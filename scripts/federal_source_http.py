"""Hostname-based HTTP with fallback after a broken IPv4 or IPv6 response.

A TCP/TLS connection can succeed while HTTP immediately closes. Retrying the
same first DNS address then never reaches a healthy address family. Rotate the
resolved candidates on retry, retaining TLS hostname verification and scopes.
"""
import socket, time
import requests
from requests.adapters import HTTPAdapter
from urllib3.connection import HTTPSConnection
from urllib3.connectionpool import HTTPSConnectionPool
from urllib3.exceptions import ConnectTimeoutError, NewConnectionError

_preferred={}

def address_order(host,port,attempt):
    addresses=list(socket.getaddrinfo(host,port,type=socket.SOCK_STREAM))
    preferred=_preferred.get(host)
    if preferred and time.monotonic()-preferred[1]<300:
        addresses.sort(key=lambda a:a[0]!=preferred[0])
    # Several addresses in one family must not starve the other family.
    families={}
    for address in addresses:families.setdefault(address[0],[]).append(address)
    addresses=[]
    while any(families.values()):
        for candidates in families.values():
            if candidates:addresses.append(candidates.pop(0))
    if addresses:
        offset=attempt%len(addresses);addresses=addresses[offset:]+addresses[:offset]
    return addresses

def session(attempt=0):
    class ResolvedHTTPSConnection(HTTPSConnection):
        def _new_conn(self):
            last=None
            for family,kind,proto,_,address in address_order(self._dns_host,self.port,attempt):
                sock=socket.socket(family,kind,proto)
                try:
                    sock.settimeout(min(float(self.timeout),15))
                    for option in self.socket_options or []:sock.setsockopt(*option)
                    if self.source_address:sock.bind(self.source_address)
                    sock.connect(address);self.resolved_family=family
                    return sock
                except OSError as error:last=error;sock.close()
            if isinstance(last,socket.timeout):raise ConnectTimeoutError(self,'Resolved source addresses timed out') from last
            raise NewConnectionError(self,'No resolved source address connected') from last

        def getresponse(self):
            response=super().getresponse()
            # Only a complete HTTP response establishes a working family.
            _preferred[self._dns_host]=(self.resolved_family,time.monotonic())
            return response

    class ResolvedPool(HTTPSConnectionPool):ConnectionCls=ResolvedHTTPSConnection
    class Adapter(HTTPAdapter):
        def init_poolmanager(self,*args,**kwargs):
            super().init_poolmanager(*args,**kwargs)
            self.poolmanager.pool_classes_by_scheme={**self.poolmanager.pool_classes_by_scheme,'https':ResolvedPool}
    result=requests.Session();result.mount('https://',Adapter())
    # Each request owns its session. Do not advertise a persistent connection
    # that this client will immediately discard after the response headers.
    result.headers['Connection']='close'
    result.headers['User-Agent']='OrgPortal public financial evidence collector/1.0 (+https://orgportal.cc)'
    return result
