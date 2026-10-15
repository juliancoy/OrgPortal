"""Public organization fields only; original returns stay in memory."""
import io,re,urllib.request,xml.etree.ElementTree as ET
import zipfile64.zipfile as zipfile
from decimal import Decimal

class IRSArchive(io.RawIOBase):
    def __init__(self,url):
        if not re.fullmatch(r'https://apps\.irs\.gov/pub/epostcard/990/xml/\d{4}/\d{4}_TEOS_XML_\d{2}[A-Z]\.zip',url):
            raise ValueError('Only official IRS XML archives are accepted')
        self.url=url;self.position=0
        with urllib.request.urlopen(urllib.request.Request(url,headers={'Range':'bytes=-65536'}),timeout=60) as response:
            match=re.fullmatch(r'bytes (\d+)-(\d+)/(\d+)',response.headers.get('Content-Range',''))
            if response.status!=206 or not match:raise ValueError('IRS archive does not support partial retrieval')
            self.start,end,self.length=map(int,match.groups());self.cache=response.read(65537)
            if len(self.cache)!=end-self.start+1:raise ValueError('Incomplete IRS archive range')
    def seekable(self):return True
    def readable(self):return True
    def tell(self):return self.position
    def seek(self,offset,whence=0):
        self.position=offset if whence==0 else self.position+offset if whence==1 else self.length+offset
        if self.position<0:raise ValueError('Invalid archive offset')
        return self.position
    def read(self,size=-1):
        size=self.length-self.position if size<0 else min(size,self.length-self.position)
        if size<=0:return b''
        if size>16*1024*1024:raise ValueError('Archive request exceeds bounded retrieval size')
        if not(self.start<=self.position and self.position+size<=self.start+len(self.cache)):
            start=self.position;end=min(self.length-1,start+max(size,65536)-1)
            with urllib.request.urlopen(urllib.request.Request(self.url,headers={'Range':f'bytes={start}-{end}'}),timeout=60) as response:
                if response.status!=206 or response.headers.get('Content-Range')!=f'bytes {start}-{end}/{self.length}':raise ValueError('Unexpected IRS archive range')
                data=response.read(end-start+2)
                if len(data)!=end-start+1:raise ValueError('Truncated IRS range')
                self.start=start;self.cache=data
        result=self.cache[self.position-self.start:self.position-self.start+size];self.position+=len(result);return result

def filing_xml(row):
    object_id=row['OBJECT_ID'];batch=row['XML_BATCH_ID'];year=batch[:4]
    if not re.fullmatch(r'\d{18}',object_id):raise ValueError('Invalid IRS object ID')
    url=f'https://apps.irs.gov/pub/epostcard/990/xml/{year}/{batch}.zip'
    with IRSArchive(url) as remote,zipfile.ZipFile(remote) as archive:
        members=[m for m in archive.infolist() if m.filename.rsplit('/',1)[-1]==f'{object_id}_public.xml']
        if len(members)!=1:raise ValueError(f'Filing object not unique in archive: {object_id}')
        member=members[0]
        if member.file_size>16*1024*1024:raise ValueError('Filing exceeds XML size bound')
        return archive.read(member),url

def parse_xml(data):
    if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():raise ValueError('XML entities are not accepted')
    root=ET.fromstring(data)
    for element in root.iter():element.tag=element.tag.rsplit('}',1)[-1]
    return root

def text(element,path):
    found=element.find(path)
    return (found.text or '').strip() if found is not None else ''

def money(element,*paths):
    for path in paths:
        value=text(element,path)
        if value:
            decimal=Decimal(value)
            if not decimal.is_finite() or decimal!=decimal.quantize(Decimal('0.01')):raise ValueError('Invalid monetary value in IRS filing')
            return float(decimal)
    return None

def ein(value):
    digits=re.sub(r'[^0-9]','',str(value or ''))
    return digits.zfill(9) if 1<=len(digits)<=9 and int(digits)>0 else None

def business_name(element,path):
    return ' '.join(filter(None,[text(element,path+'/BusinessNameLine1Txt'),text(element,path+'/BusinessNameLine2Txt')]))

def normalize_filing(data,row,archive_url,retrieved_at):
    import hashlib
    root=parse_xml(data);header=root.find('ReturnHeader');filer=header.find('Filer')
    filer_ein=ein(text(filer,'EIN'))
    if filer_ein!=ein(row['EIN']):raise ValueError('IRS filing EIN does not match index')
    form_type=text(header,'ReturnTypeCd');form=root.find('./ReturnData/'+('IRS990PF' if form_type=='990PF' else 'IRS990'))
    if form is None or form_type not in ('990','990PF'):raise ValueError('Unsupported nonprofit return type')
    end=text(header,'TaxPeriodEndDt');start=text(header,'TaxPeriodBeginDt')
    if end.replace('-','')[:6]!=row['TAX_PERIOD']:raise ValueError('Filing period does not match index')
    amended=any(text(form,p).lower() in ('true','1','x') for p in ['AmendedReturnInd','AmendedReturnBoxInd'])
    basis='accrual' if text(form,'MethodOfAccountingAccrualInd').lower() in ('true','1','x') else 'cash' if text(form,'MethodOfAccountingCashInd').lower() in ('true','1','x') else text(form,'AccountingMethodCd') or 'unspecified'
    source_url=f'https://projects.propublica.org/nonprofits/organizations/{int(filer_ein)}/{row["OBJECT_ID"]}/full'
    summary={'id':row['OBJECT_ID'],'ein':filer_ein,'name':business_name(filer,'BusinessName'),'formType':form_type,'periodStart':start,'periodEnd':end,'taxYear':int(text(header,'TaxYr')),'filedAt':text(header,'ReturnTs'),'amended':amended,'accountingBasis':basis,'sourceUrl':source_url,'archiveUrl':archive_url,'sourceSha256':hashlib.sha256(data).hexdigest(),'retrievedAt':retrieved_at,
      'revenue':money(form,'CYTotalRevenueAmt','AnalysisOfRevenueAndExpenses/TotalRevAndExpnssAmt'),
      'expenses':money(form,'CYTotalExpensesAmt','AnalysisOfRevenueAndExpenses/TotalExpensesRevAndExpnssAmt'),
      'assets':money(form,'TotalAssetsGrp/EOYAmt','Form990PFBalanceSheetsGrp/TotalAssetsEOYAmt'),
      'liabilities':money(form,'TotalLiabilitiesGrp/EOYAmt','Form990PFBalanceSheetsGrp/TotalLiabilitiesEOYAmt')}
    summary['reportedPaidGrants']=money(form,'SupplementaryInformationGrp/TotalGrantOrContriPdDurYrAmt')
    summary['reportedFutureGrants']=money(form,'SupplementaryInformationGrp/TotalGrantOrContriApprvFutAmt')
    grants=[]
    groups=[(g,'paid') for g in form.findall('.//GrantOrContributionPdDurYrGrp')]+[(g,'approved_future') for g in form.findall('.//GrantOrContriApprvForFutGrp')]
    schedule=root.find('./ReturnData/IRS990ScheduleI')
    if schedule is not None:groups += [(g,'reported') for g in schedule.findall('.//RecipientTable')]
    for index,(group,status) in enumerate(groups):
        recipient_ein=ein(text(group,'RecipientEIN') or text(group,'EIN'))
        name=business_name(group,'RecipientBusinessName')
        # Personal names and addresses never enter the published dataset.
        identity='identified' if recipient_ein else 'name_only' if name else 'unidentified'
        name=name or 'Redacted'
        purpose=(text(group,'GrantOrContributionPurposeTxt') or text(group,'PurposeOfGrantTxt')) if identity!='unidentified' else 'Recipient identity withheld; see source filing for purpose.'
        amounts=[('cash',money(group,'Amt','CashGrantAmt'))]
        if schedule is not None:amounts.append(('in_kind',money(group,'NonCashAssistanceAmt')))
        for measure,amount in amounts:
            if amount is None or (measure=='in_kind' and amount==0):continue
            key=f'irs990:{filer_ein}:{end}:{row["OBJECT_ID"]}:{index}:{measure}'
            grants.append({'id':key,'awardKey':key,'filerEin':filer_ein,'recipientEin':recipient_ein,'recipientName':name,'recipientIdentity':identity,'amount':amount,'currency':'USD','grantStatus':status,'measure':measure,'purpose':purpose,'filingId':row['OBJECT_ID'],'periodStart':start,'periodEnd':end,'accountingBasis':basis,'sourceUrl':source_url})
    if form_type=='990PF':
        for field,status in [('reportedPaidGrants','paid'),('reportedFutureGrants','approved_future')]:
            disclosed=sum(Decimal(str(g['amount'])) for g in grants if g['grantStatus']==status)
            if summary[field] is not None and disclosed!=Decimal(str(summary[field])):raise ValueError(f'Grant schedule does not reconcile with reported total: {field}')
    return summary,grants

def transactions_sql(dataset):
    import json
    def quote(value):
        if value is None:return 'NULL'
        if isinstance(value,(int,float)):return str(value)
        return "'"+str(value).replace("'","''")+"'"
    statements=[]
    for f in dataset['filingVersions']:
        if f['selected']:statements.append(f"UPDATE nonprofit_filing_records SET selected=0 WHERE ein={quote(f['ein'])} AND period_end={quote(f['periodEnd'])} AND form_type={quote(f['formType'])} AND julianday(filed_at)<=julianday({quote(f['filedAt'])});")
    for f in dataset['filingVersions']:
        fields=['id','ein','name','form_type','period_start','period_end','filed_at','amended','selected','accounting_basis','revenue_cents','expenses_cents','assets_cents','liabilities_cents','source_url','archive_url','source_sha256','retrieved_at']
        values=[f['id'],f['ein'],f['name'],f['formType'],f['periodStart'],f['periodEnd'],f['filedAt'],int(f['amended']),int(f['selected']),f['accountingBasis']]+[int(Decimal(str(f[k]))*100) if f[k] is not None else None for k in ['revenue','expenses','assets','liabilities']]+[f['sourceUrl'],f['archiveUrl'],f['sourceSha256'],f['retrievedAt']]
        statements.append(f"INSERT INTO nonprofit_filing_records({','.join(fields)}) VALUES({','.join(map(quote,values))}) ON CONFLICT(id) DO UPDATE SET "+','.join(c+'=excluded.'+c for c in fields[1:])+';')
    for g in dataset['relationships']:
        fields=['id','filing_id','recipient_ein','recipient_name','recipient_identity','amount_cents','kind','grant_status','from_organization_id','to_organization_id','source_url','description','notes','provenance_json']
        values=[g['id'],g['filingId'],g['recipientEin'],g['recipientName'],g['recipientIdentity'],int(Decimal(str(g['amount']))*100),g['kind'],g['grantStatus'],None,None,g['sourceUrl'],g['description'],g['notes'],json.dumps(g['provenance'])]
        expressions=list(map(quote,values))
        if g['recipientIdentity']=='unidentified':expressions[9]="(SELECT id FROM organizations WHERE id='13bb4caf-d044-488d-a79d-bd7f678be3be')"
        statements.append(f"INSERT INTO nonprofit_grant_records({','.join(fields)}) VALUES({','.join(expressions)}) ON CONFLICT(id) DO UPDATE SET "+','.join(c+'=excluded.'+c for c in fields[1:])+';')
    return '\n'.join(statements)+'\n'
