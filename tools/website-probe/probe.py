#!/usr/bin/env python3
"""Standalone OrgPortal synthetic browser probe; no LAN discovery privileges."""
from pathlib import Path
from websites import WebsiteMonitor

if __name__ == '__main__':
    directory = Path.home()/'.local/share/orgportal/website-probe'
    directory.mkdir(parents=True, exist_ok=True)
    WebsiteMonitor(directory/'websites.sqlite3').scheduler()
