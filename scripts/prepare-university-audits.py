#!/usr/bin/env python3
"""Reconcile operating statements from retained public PDF text extracts.

The checksum identifies the retained text extract, not the original PDF bytes.
Overlapping years use the newest report's comparative column. Consolidated
reporting remains separate from legal-entity Form 990 and individual payments.
"""
import argparse, pathlib, re, json, hashlib, datetime

GROUP='reporting-group:johns-hopkins-university-affiliates'
TOKEN=r'\(?-?\d[\d,]*\.?\)?|[—–-]'
def values(text):
    suffix=re.search(r'((?:'+TOKEN+r')(?:\s+(?:'+TOKEN+r'))*)\s*$',text)
    if not suffix:return []
    return [0 if t in ['—','–','-'] else int(t.replace(',','').replace('(','-').replace(')','').rstrip('.')) for t in re.findall(TOKEN,suffix[1])]

def extract(path):
    year=int(re.search(r'university-(\d+)',path.name)[1]);raw=path.read_bytes();text=raw.decode()
    lines=[]
    for rawline in text.splitlines():
        m=re.match(r'L(\d+)@P(\d+)(?:-\d+)?:\s*(.*)',rawline)
        if m:lines.append((int(m[1]),int(m[2])+1,m[3].strip()))
    # Older reports place the financial statements after narrative and charts.
    minimum={2001:36,2002:33,2003:31,2005:27}.get(year,1)
    starts=[i for i,(_,page,s) in enumerate(lines) if page>=minimum and s in ['Operating revenues:','Revenues:']]
    result=[]
    for block,start in enumerate(starts[:2 if year<=2009 else 1]):
        stop=next(i for i in range(start,len(lines)) if lines[i][2].startswith('Total operating expenses'))
        totalrev=next(values(s) for _,_,s in lines[start:stop] if s.startswith('Total operating revenues'))
        totalexp=values(lines[stop][2]);old=year<=2009
        columns=[(-1,year-block)] if old else [(0,year),(1,year-1)]
        for col,fy in columns:
            entries=[];kind='revenue';pending=''
            for line,page,s in lines[start+1:stop]:
                if s in ['Operating expenses:','Expenses:']:kind='expense';pending='';continue
                if s.startswith('Total operating revenues'):continue
                v=values(s)
                if not v or (not old and len(v)<2):pending+=' '+s;continue
                label=(pending+' '+re.sub(r'[$\s]*'+TOKEN+r'(?:\s+(?:'+TOKEN+r'))*\s*$','',s)).strip();pending=''
                if 'Tuition and fees, net' in label:label='Tuition and fees, net of financial aid'
                if label in ['Tuition and fees','Less financial aid','Sponsored research revenues','Contributions and donor support']:continue
                if label=='Compensation and benefits' and any(e['label']=='Compensation' for e in entries):continue
                if label=='Net assets released from restrictions' and old:continue # Total column is explicit zero; interclass reclassification cancels.
                amount=v[col] if old else v[-2:][col]
                entries.append({'kind':kind,'label':label,'amount':amount*1000,'sourceLine':line,'page':page})
            for kind,expected in [('revenue',totalrev[col]),('expense',totalexp[col])]:
                actual=sum(e['amount'] for e in entries if e['kind']==kind)
                if actual!=expected*1000:raise ValueError(f'{path.name} {fy} {kind}: {actual} != {expected*1000}; {entries}')
            result.append({'fiscalYear':fy,'documentFiscalYear':year,'comparativeColumn':fy!=year,'sourceUrl':f'https://finance.jhu.edu/wp-content/uploads/sites/38/AnnualReport{year}.pdf',
                'sourceExtractSha256':hashlib.sha256(raw).hexdigest(),'sourceFormat':'public_pdf_text_extract','originalPdfChecksumAvailable':False,
                'revenue':totalrev[col]*1000,'expenses':totalexp[col]*1000,'reportingBasis':'All net-asset classes' if old else 'Operating activity without donor restrictions; terminology follows source report',
                'entries':entries})
    return result

def prepare(folder):
    selected={}
    for path in sorted(folder.glob('university-*-web.txt'),reverse=True):
        for report in extract(path):selected.setdefault(report['fiscalYear'],report)
    # Earlier years exist only in five-year summaries. Keep that source status
    # explicit, and never replace a full statement with its abbreviated summary.
    for year in [2005,2003,2002,2001]:
        path=folder/f'university-{year}-web.txt';raw=path.read_bytes();lines=[]
        for line in raw.decode().splitlines():
            m=re.match(r'L(\d+)@P(\d+)(?:-\d+)?:\s*(.*)',line)
            if m:lines.append((int(m[1]),int(m[2])+1,m[3].strip()))
        total=next((i for i,(_,_,s) in enumerate(lines) if s.startswith('Total operating revenues') and len(values(s))==5),None)
        if total is None:continue
        start=max(i for i in range(total) if lines[i][2]=='Operating revenues:')
        stop=next(i for i in range(total,len(lines)) if lines[i][2].startswith('Total operating expenses'))
        for col in range(5):
            fy=year-col
            if fy in selected:continue
            entries=[];kind='revenue'
            for line,page,s in lines[start+1:stop]:
                if not s:continue
                if s=='Operating expenses:':kind='expense';continue
                if s.startswith('Total operating revenues'):continue
                v=values(s)
                if len(v)!=5:raise ValueError('Incomplete five-year summary row')
                label=re.sub(r'[$\s]*'+TOKEN+r'(?:\s+(?:'+TOKEN+r'))*\s*$','',s).strip()
                entries.append({'kind':kind,'label':label,'amount':v[col]*1000,'sourceLine':line,'page':page})
            rt,et=values(lines[total][2])[col]*1000,values(lines[stop][2])[col]*1000
            if sum(e['amount'] for e in entries if e['kind']=='revenue')!=rt or sum(e['amount'] for e in entries if e['kind']=='expense')!=et:raise ValueError('Summary does not reconcile')
            selected[fy]={'fiscalYear':fy,'documentFiscalYear':year,'comparativeColumn':True,'sourceUrl':f'https://finance.jhu.edu/wp-content/uploads/sites/38/AnnualReport{year}.pdf',
                'sourceExtractSha256':hashlib.sha256(raw).hexdigest(),'sourceFormat':'annual_report_five_year_summary_text','originalPdfChecksumAvailable':False,
                'revenue':rt,'expenses':et,'reportingBasis':'Historical five-year summary in annual report; not a separately retained audit for this year','entries':entries}
    nodes={GROUP:{'id':GROUP,'name':'Johns Hopkins University and affiliates — reporting group','type':'Consolidated financial reporting group','category':'education','entityType':'aggregate','identityStatus':'aggregate',
        'relevance':'Annual financial reporting scope includes controlled affiliates and APL, with inter-entity eliminations. Not an identity merger or the legal-entity Form 990.'}}
    rows=[];reports=[]
    for year,r in sorted(selected.items()):
        report={k:v for k,v in r.items() if k!='entries'};reports.append(report)
        for e in r['entries']:
            label=e['label'];kind=e['kind'];key=hashlib.sha256(label.encode()).hexdigest()[:20]
            public=kind=='revenue' and (label.startswith('Tuition and fees, net') or 'auxiliary enterprises' in label.lower())
            counterpart='aggregate:public' if public else 'aggregate:jhu:'+kind+':'+key
            if not public:nodes[counterpart]={'id':counterpart,'name':label,'type':'Aggregate statement category','category':'general','entityType':'aggregate','identityStatus':'aggregate','directory':False}
            source,target=(counterpart,GROUP) if kind=='revenue' else (GROUP,counterpart)
            rows.append({'id':f'jhu-audit:{year}:{kind}:{key}','source':source,'target':target,'kind':kind,'financialFactType':kind,'financialMeasure':'annual_statement','measurement':'period_total','aggregate':True,
                'amount':e['amount'],'currency':'USD','date':f'{year}-06-30','periodStart':f'{year-1}-07-01','periodEnd':f'{year}-06-30','fiscalYear':year,'fiscalCalendar':'filer',
                'type':'Reported operating '+kind+': '+label,'description':label,'status':'reported','sourceUrl':r['sourceUrl']+'#page='+str(e['page']),
                'sourceSystem':'audited_financial_statements','sourceRecordType':'consolidated_statement','retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'notes':'Operating statement only; excludes nonoperating activity. Includes consolidated affiliates and eliminations. Not an individual payment and not additive with Form 990, NIH awards or federal obligations. Public tuition/auxiliary revenue can include third-party payment sources.',
                'provenance':{**report,'sourceLine':e['sourceLine'],'sourcePage':e['page'],'sourceLabel':label,'sourceAmountThousands':e['amount']//1000}})
    for member in ['org-johns-hopkins-university','federal-portal:federal-recipient-jhu-apl']:
        rows.append({'id':'jhu-reporting-member:'+member,'source':GROUP,'target':member,'kind':'agency','relationship':'affiliation','status':'reported','type':'Included in financial reporting group',
            'sourceUrl':'https://finance.jhu.edu/wp-content/uploads/sites/38/AnnualReport2026.pdf#page=8','notes':'Reporting affiliation, not a payment or identity merger. The source lists additional controlled affiliates.'})
    return {'organizations':list(nodes.values()),'relationships':rows,'metadata':[{'id':'data:jhuOperatingStatements','value':{'reports':reports,'scope':'Available annual report operating statements; separate consolidated reporting group. Nonoperating activity is excluded.'}}]}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',required=True,type=pathlib.Path);p.add_argument('--output',required=True,type=pathlib.Path);a=p.parse_args();result=prepare(a.source)
    a.output.write_text(json.dumps(result,separators=(',',':'))+'\n');a.output.chmod(0o600)
    print(json.dumps({'years':[r['fiscalYear'] for r in result['metadata'][0]['value']['reports']],'records':len(result['relationships'])}))
