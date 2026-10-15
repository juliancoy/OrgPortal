#!/usr/bin/env python3
"""Refresh selected nonprofit evidence; no production organization writes."""
import argparse,csv,io,json,sys,urllib.request,datetime,pathlib,os
sys.path.insert(0,str(pathlib.Path(__file__).parent/'lib'))
from irs_nonprofits import filing_xml,normalize_filing,ein,transactions_sql
ROOT=pathlib.Path(__file__).resolve().parents[1]
# EINs verified through ProPublica's Maryland discovery results.
TARGETS=['526036106','237180620','521951681','526037034','520591543','521420138']
REDACTED='13bb4caf-d044-488d-a79d-bd7f678be3be'
def refresh(index_year,index_file=None):
    retrieved=datetime.datetime.now(datetime.timezone.utc).isoformat()
    if index_file:rows=json.loads(pathlib.Path(index_file).read_text())
    else:
        url=f'https://apps.irs.gov/pub/epostcard/990/xml/{index_year}/index_{index_year}.csv'
        with urllib.request.urlopen(url,timeout=60) as response:
            rows=[r for r in csv.DictReader(io.TextIOWrapper(response,encoding='utf-8-sig')) if ein(r['EIN']) in TARGETS]
    organizations={};profiles=[];relationships=[];versions=[]
    def organization(ein_id,name):
        id='nonprofit:'+ein_id
        if id not in organizations:organizations[id]={'id':id,'name':name,'type':'Nonprofit organization','category':'general','website':'','relevance':'Identity documented in an IRS nonprofit filing.','proximity':None,'publicEmails':[],'sourceRows':[],'sourceCategory':'IRS Form 990','identifiers':{'ein':ein_id}}
        return id
    for target in TARGETS:
        api_url=f'https://projects.propublica.org/nonprofits/api/v2/organizations/{int(target)}.json'
        with urllib.request.urlopen(api_url,timeout=30) as response:api=json.load(response)
        if ein(api['organization']['ein'])!=target:raise ValueError('ProPublica EIN mismatch')
        candidates=[r for r in rows if ein(r['EIN'])==target and r['RETURN_TYPE'] in ('990','990PF')]
        if not candidates:raise ValueError(f'No supported IRS filing for {target} in {index_year} index')
        period=max(r['TAX_PERIOD'] for r in candidates);selected=[r for r in candidates if r['TAX_PERIOD']==period]
        parsed=[]
        for row in selected:
            data,url=filing_xml(row);summary,grants=normalize_filing(data,row,url,retrieved);parsed.append((summary,grants))
        if len(parsed)>1:
            timestamps=[datetime.datetime.fromisoformat(s['filedAt'].replace('Z','+00:00')) for s,_ in parsed]
            if any(t.tzinfo is None for t in timestamps):raise ValueError('Ambiguous filing timezone requires review')
            parsed.sort(key=lambda value:datetime.datetime.fromisoformat(value[0]['filedAt'].replace('Z','+00:00')))
        if len(parsed)>1 and datetime.datetime.fromisoformat(parsed[-1][0]['filedAt'].replace('Z','+00:00'))==datetime.datetime.fromisoformat(parsed[-2][0]['filedAt'].replace('Z','+00:00')):raise ValueError('Ambiguous filing versions require review')
        summary,grants=parsed[-1];versions.extend([{**s,'selected':s['id']==summary['id']} for s,_ in parsed])
        source=organization(target,summary['name'])
        profile={**summary,'organizationId':source,'city':api['organization'].get('city'),'state':api['organization'].get('state'),'nteeCode':api['organization'].get('ntee_code'),'propublicaUrl':f'https://projects.propublica.org/nonprofits/organizations/{int(target)}','apiSourceUrl':api_url,'apiLatestTaxPeriod':max((str(f.get('tax_prd','')) for f in api.get('filings_with_data',[])),default=None)}
        profiles.append(profile)
        for g in grants:
            if g['recipientEin']:target_id=organization(g['recipientEin'],g['recipientName'])
            elif g['recipientIdentity']=='unidentified':
                target_id=REDACTED
                organizations.setdefault(REDACTED,{'id':REDACTED,'name':'Redacted','type':'Unidentified recipients','portalSlug':'redacted','directory':True,'category':'general','website':'','relevance':'Grouping for unidentified recipients, not a single legal entity.','proximity':None,'publicEmails':[],'sourceRows':[],'sourceCategory':'IRS Form 990'})
            else:target_id=None
            future=g['grantStatus']=='approved_future';kind='terms' if future else 'in_kind' if g['measure']=='in_kind' else 'transfer'
            relationships.append({**g,'source':source,'target':target_id,'sourceLabel':summary['name'],'targetLabel':g['recipientName'],'relationship':'funding' if kind!='in_kind' else 'in_kind','kind':kind,'amountLabel':f'${g["amount"]:,.2f}'+(' approved for future payment' if future else ' reported noncash assistance' if kind=='in_kind' else ' reported grant'),'date':summary['periodEnd'],'type':'IRS grant approved for future payment' if future else 'IRS reported grant','description':g['purpose'],'financialMeasure':'future_grant_approval' if future else 'reported_nonprofit_grant','status':'reported','notes':f'Fiscal period {summary["periodStart"]} through {summary["periodEnd"]}; {summary["accountingBasis"]} accounting. '+('Reported paid during the year; exact payment date unavailable.' if g['grantStatus']=='paid' else 'Schedule I reports grants on the filer accounting basis; payment is not independently verified.' if not future else 'Approved for future payment; excluded from tracked funding volume.')+(' Recipient EIN unavailable; no organization identity inferred.' if g['recipientIdentity']=='name_only' else ''),'provenance':{'sheet':'IRS Form 990 XML','filingId':summary['id'],'archiveUrl':summary['archiveUrl'],'sourceSha256':summary['sourceSha256']},'retrievedAt':retrieved})
        print(f'{target}: {summary["name"]}; period {summary["periodEnd"]}; {len(grants)} grant records',flush=True)
    return {'updatedAt':retrieved,'nonprofitCoverage':{'indexYear':index_year,'scope':'Six selected Maryland nonprofits and foundations; latest supported fiscal period in the chosen IRS index, not a statewide census.','profileCount':len(profiles),'grantRecordCount':len(relationships),'retrievedAt':retrieved},'organizations':list(organizations.values()),'relationships':relationships,'financing':[],'nonprofitProfiles':profiles,'filingVersions':versions}
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--index-year',type=int,default=2025);parser.add_argument('--index-file');args=parser.parse_args()
    if not 2022<=args.index_year<=datetime.date.today().year:parser.error('Choose an available IRS index year from 2022 onward')
    result=refresh(args.index_year,args.index_file)
    artifacts=ROOT.parent/'artifacts/nonprofits';artifacts.mkdir(parents=True,exist_ok=True);(artifacts/'filing-records.sql').write_text(transactions_sql(result))
    out=ROOT/'public/ecosystem-data/ecosystem-nonprofits.json';temp=out.with_suffix('.json.tmp');temp.write_text(json.dumps(result,separators=(',',':'))+'\n');os.replace(temp,out)
    print(f'Published {len(result["nonprofitProfiles"])} profiles and {len(result["relationships"])} grant observations')
