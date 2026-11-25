#!/usr/bin/env python3
"""Extract organization-only Schedule I grants and reported contractor spending.

These annual detail observations overlap statement expenses and federal
subawards. They are not additional cash payments or additive statement totals.
"""
import argparse,collections,hashlib,json,pathlib,re,sys
from decimal import Decimal
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'web/scripts/lib'))
from rendered_990_statement import Fields
from irs_nonprofits import ein

def detail_rows(raw,summary,identity,kind):
    parser=Fields();parser.feed(raw.decode());fields=parser.fields
    header='/AppData/SubmissionHeaderAndDocument/ReturnHeader[1]/Filer[1]/EIN[1]'
    if ein(fields.get(header))!=summary['ein']:raise ValueError('Detail filing EIN mismatch')
    group='RecipientTable' if kind=='grant' else 'ContractorCompensation(?:Grp)?'
    pattern=re.compile(r'^/AppData/SubmissionHeaderAndDocument/SubmissionDocument/IRS990(?:ScheduleI)?\[1\]/('+group+r')\[(\d+)\]/(.*)$')
    groups=collections.defaultdict(dict)
    for path,value in fields.items():
        m=pattern.match(path)
        if m:groups[(m[1],int(m[2]))][m[3]]=value.strip()
    nodes={};rows=[];withheld=0;sha=hashlib.sha256(raw).hexdigest()
    for (table,index),values in sorted(groups.items()):
        def first(*paths):return next((values[p] for p in paths if p in values),'')
        if kind=='grant':
            name=' '.join(filter(None,[first('RecipientBusinessName[1]/BusinessNameLine1Txt[1]','RecipientNameBusiness[1]/BusinessNameLine1[1]'),first('RecipientBusinessName[1]/BusinessNameLine2Txt[1]','RecipientNameBusiness[1]/BusinessNameLine2[1]')]))
            recipient_ein=ein(first('RecipientEIN[1]','EINOfRecipient[1]'))
            purpose=first('PurposeOfGrantTxt[1]','PurposeOfGrant[1]')
            measures=[('cash_reported','CashGrantAmt[1]','AmountOfCashGrant[1]'),('in_kind','NonCashAssistanceAmt[1]','AmountOfNonCashAssistance[1]')]
        else:
            name=' '.join(filter(None,[first('ContractorName[1]/BusinessName[1]/BusinessNameLine1Txt[1]','NameOfContractor[1]/NameBusiness[1]/BusinessNameLine1[1]'),first('ContractorName[1]/BusinessName[1]/BusinessNameLine2Txt[1]','NameOfContractor[1]/NameBusiness[1]/BusinessNameLine2[1]')]))
            recipient_ein=None;purpose=first('ServicesDesc[1]','DescriptionOfServices[1]')
            measures=[('contractor_compensation','CompensationAmt[1]','Compensation[1]')]
        if not name:withheld+=1;continue # Never publish individual names or infer an organization.
        target='irs:recipient:ein:'+recipient_ein if recipient_ein else 'source-label:irs990:'+kind+':'+hashlib.sha256(name.encode()).hexdigest()[:32]
        nodes[target]={'id':target,'name':name,'type':'Organization reported in nonprofit filing','category':'general','sourceCategory':'IRS Form 990',
                       'identityStatus':'source_reported','identifiers':{'ein':recipient_ein} if recipient_ein else {}}
        for measure,*paths in measures:
            path=next((p for p in paths if p in values),None)
            if path is None:continue
            value=values[path].replace(',','')
            if not value:continue
            amount=Decimal(value)
            if not amount.is_finite() or amount*100!=(amount*100).to_integral_value():raise ValueError('Invalid detail money')
            if amount==0:continue
            rows.append({'id':f'irs990-detail:{summary["id"]}:{table}:{index}:{measure}','source':identity,'target':target,
                'sourceLabel':summary['name'],'targetLabel':name,'kind':'expense_detail','financialFactType':'expense_detail',
                'financialMeasure':measure,'measurement':'annual_statement_detail','amount':float(amount),'currency':'USD',
                'date':summary['periodEnd'],'periodStart':summary['periodStart'],'periodEnd':summary['periodEnd'],'fiscalYear':int(summary['periodEnd'][:4]),'fiscalCalendar':'filer',
                'type':'Reported grant assistance' if kind=='grant' else 'Reported independent-contractor compensation',
                'description':purpose,'status':'reported','sourceUrl':summary['sourceUrl'],'sourceSystem':'irs_form_990','sourceRecordType':'nonprofit_statement_detail',
                'retrievedAt':summary['retrievedAt'],'notes':'Annual reported detail, not an individual transaction. May overlap statement expenses and federal subawards; excluded from additive cash, award and annual statement totals. '+('Noncash assistance valuation.' if measure=='in_kind' else 'The source category does not establish settlement dates.'),
                'provenance':{'filingId':summary['id'],'ein':summary['ein'],'recipientEin':recipient_ein,'sourceSha256':sha,
                 'sourceLine':f'{table}[{index}]/{path}','accountingBasis':summary['accountingBasis'],'sourceDocumentUrl':summary.get('sourceDocumentUrl')}})
    return list(nodes.values()),rows,{'reportedGroups':len(groups),'unidentifiedOrPersonalGroupsWithheld':withheld}

def reuse_irs_source_ids(nodes,rows,known_ids):
    """Reuse established EIN source identities, without name/identity inference."""
    aliases={node['id']:'nonprofit:'+node['identifiers']['ein'] for node in nodes
             if node.get('identifiers',{}).get('ein') and 'nonprofit:'+node['identifiers']['ein'] in known_ids}
    for row in rows:
        if row['target'] in aliases:
            row['target']=aliases[row['target']]
            row['provenance']['identityResolution']='Existing IRS source identity with the exact reported EIN; no name matching.'
    for node in nodes:node['id']=aliases.get(node['id'],node['id'])
    return nodes,rows

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',required=True,type=pathlib.Path);p.add_argument('--identities',required=True,type=pathlib.Path);p.add_argument('--output',required=True,type=pathlib.Path);p.add_argument('--base',type=pathlib.Path);a=p.parse_args()
    ids={e['ein']:e['organizationId'] for e in json.loads(a.identities.read_text())['entities']};nodes={};rows=[];coverage=[]
    for path in sorted(a.source.glob('*-summary.json')):
        s=json.loads(path.read_text())
        for kind,f in [('contractor',a.source/(s['id']+'-IRS990.html')),('grant',a.source/'schedules'/(s['id']+'.html'))]:
            if not f.exists():coverage.append({'filingId':s['id'],'kind':kind,'status':'unavailable'});continue
            raw=f.read_bytes();summary={**s,'sourceDocumentUrl':f'https://projects.propublica.org/nonprofits/full_text/{s["id"]}/'+('IRS990ScheduleI' if kind=='grant' else 'IRS990')}
            ns,rs,c=detail_rows(raw,summary,ids[s['ein']],kind);nodes.update((n['id'],n) for n in ns);rows.extend(rs);coverage.append({'filingId':s['id'],'kind':kind,'sourceSha256':hashlib.sha256(raw).hexdigest(),**c})
    known={r['value']['id'] for r in json.loads(a.base.read_text())['rows'] if r['collection']=='organizations'} if a.base else set()
    ns,rows=reuse_irs_source_ids(list(nodes.values()),rows,known)
    result={'organizations':ns,'relationships':rows,'metadata':[{'id':'data:hopkinsNonprofitDetails','value':{'sources':coverage,'records':len(rows)}}]}
    a.output.write_text(json.dumps(result,separators=(',',':'))+'\n');a.output.chmod(0o600);print(json.dumps({'nodes':len(nodes),'records':len(rows),'sources':len(coverage)}))
