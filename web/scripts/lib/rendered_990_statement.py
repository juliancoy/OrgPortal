"""Read only organization-level statement fields from the IRS e-file HTML view.

Fallback when the IRS index's ZIP omits the named object. Preserve the HTML
checksum and format; never present this extraction as the original IRS XML.
"""
import hashlib,re,datetime,xml.etree.ElementTree as ET
from html.parser import HTMLParser
from irs_nonprofits import money,text,ein
from nonprofit_statements import statement_lines

class Fields(HTMLParser):
    def __init__(self):super().__init__();self.fields={};self.active=None
    def handle_starttag(self,tag,attrs):
        a=dict(attrs);key=a.get('id','')
        if key.startswith('/AppData/'):
            if tag=='input':self.fields[key]='1' if 'checked' in a else '0'
            else:self.active=(tag,key);self.fields[key]=''
    def handle_endtag(self,tag):
        if self.active and self.active[0]==tag:self.active=None
    def handle_data(self,data):
        if self.active:self.fields[self.active[1]]+=data

def normalize_rendered_statement(data,row,source_url,retrieved_at):
    fields=Fields();fields.feed(data.decode('utf-8'))
    header='/AppData/SubmissionHeaderAndDocument/ReturnHeader[1]/'
    def h(key):return fields.fields.get(header+key,'').strip()
    filer=ein(h('Filer[1]/EIN[1]'))
    if filer!=ein(row['EIN']):raise ValueError('Rendered filing EIN mismatch')
    start=datetime.datetime.strptime(h('TaxPeriodBeginDt[1]'),'%m-%d-%Y').date().isoformat()
    end=datetime.datetime.strptime(h('TaxPeriodEndDt[1]'),'%m-%d-%Y').date().isoformat()
    if end.replace('-','')[:6]!=row['TAX_PERIOD']:raise ValueError('Rendered filing period mismatch')
    prefix='/AppData/SubmissionHeaderAndDocument/SubmissionDocument/IRS990[1]/';form=ET.Element('IRS990')
    allowed=re.compile(r'^(?:CY\w+|MethodOfAccounting(?:Accrual|Cash)Ind|TotalAssetsGrp|TotalLiabilitiesGrp|ProgramServiceRevenueGrp|TotalOthProgramServiceRevGrp)\[\d+\]')
    elements={}
    for path,value in fields.fields.items():
        if not path.startswith(prefix):continue
        path=path[len(prefix):]
        if not allowed.match(path):continue
        parent=form;current=''
        for part in path.split('/'):
            current+='/'+part;match=re.fullmatch(r'(\w+)\[\d+\]',part)
            if not match:raise ValueError('Unexpected rendered source path')
            if current not in elements:elements[current]=ET.SubElement(parent,match[1])
            parent=elements[current]
        parent.text=value.strip().replace(',','') if re.fullmatch(r'[\d,.-]+',value.strip()) else value.strip()
    name=h('Filer[1]/BusinessName[1]/BusinessNameLine1Txt[1]')
    if not name:raise ValueError('Missing filer name')
    return {'id':row['OBJECT_ID'],'ein':filer,'name':name,'formType':'990','periodStart':start,'periodEnd':end,
            'filedAt':'','amended':None,'accountingBasis':'accrual' if text(form,'MethodOfAccountingAccrualInd')=='1' else 'cash' if text(form,'MethodOfAccountingCashInd')=='1' else 'unspecified',
            'sourceUrl':f'https://projects.propublica.org/nonprofits/organizations/{int(filer)}/{row["OBJECT_ID"]}/full',
            'archiveUrl':'','sourceDocumentUrl':source_url,'sourceFormat':'irs_efile_rendered_html','sourceSha256':hashlib.sha256(data).hexdigest(),'retrievedAt':retrieved_at,
            'revenue':money(form,'CYTotalRevenueAmt'),'expenses':money(form,'CYTotalExpensesAmt'),'assets':money(form,'TotalAssetsGrp/EOYAmt'),'liabilities':money(form,'TotalLiabilitiesGrp/EOYAmt'),
            'statements':statement_lines(form,money,text)}
