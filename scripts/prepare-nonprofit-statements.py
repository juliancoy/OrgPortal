#!/usr/bin/env python3
"""Prepare reviewed public annual statement evidence. No network or DB writes.

Input manifests pin source bytes, filer EIN, period, canonical organization and
reviewed Public line mappings. Publishing uses the existing dataset preview/apply.
"""
import argparse,datetime,hashlib,json,pathlib,sys
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'web/scripts/lib'))
from irs_nonprofits import normalize_filing
from nonprofit_statements import statement_evidence
from rendered_990_statement import normalize_rendered_statement

def prepare(manifest,source_dir):
    retrieved=datetime.datetime.now(datetime.timezone.utc).isoformat();organizations={};relationships=[];profiles=[];seen=set()
    for item in manifest['filings']:
        identity=(item['ein'],item['periodEnd'])
        if identity in seen:raise ValueError('Only one reviewed filing version per EIN and period')
        seen.add(identity)
        raw=(source_dir/item['file']).read_bytes()
        if hashlib.sha256(raw).hexdigest()!=item['sourceSha256']:raise ValueError('Source checksum mismatch')
        row={'EIN':item['ein'],'TAX_PERIOD':item['periodEnd'].replace('-','')[:6],'OBJECT_ID':item['filingId']}
        if item['sourceFormat']=='irs_xml':summary,_=normalize_filing(raw,row,item['archiveUrl'],retrieved)
        elif item['sourceFormat']=='irs_efile_rendered_html':summary=normalize_rendered_statement(raw,row,item['sourceDocumentUrl'],retrieved)
        else:raise ValueError('Unknown source format')
        summary['sourceFormat']=item['sourceFormat']
        if summary['periodEnd']!=item['periodEnd']:raise ValueError('Period mismatch')
        if not all(s['reconciled'] for s in summary['statements'].values()):raise ValueError('Statement does not reconcile')
        nodes,edges=statement_evidence(summary,item['organizationId'],item)
        organizations.update((n['id'],n) for n in nodes);relationships.extend(edges)
        profiles.append({**summary,'organizationId':item['organizationId'],'propublicaUrl':f'https://projects.propublica.org/nonprofits/organizations/{int(item["ein"])}'})
    return {'organizations':list(organizations.values()),'relationships':relationships,'nonprofitProfiles':profiles,
            'statementCoverage':{'filingCount':len(profiles),'periods':sorted({s['periodEnd'] for s in profiles}),'scope':manifest['scope'],'retrievedAt':retrieved}}
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--manifest',required=True,type=pathlib.Path);p.add_argument('--source-dir',required=True,type=pathlib.Path);p.add_argument('--output',required=True,type=pathlib.Path);a=p.parse_args()
    data=prepare(json.loads(a.manifest.read_text()),a.source_dir);a.output.parent.mkdir(exist_ok=True,parents=True);a.output.write_text(json.dumps(data,indent=2)+'\n')
    print(json.dumps({'filings':len(data['nonprofitProfiles']),'relationships':len(data['relationships']),'publicRevenue':{p['name']:sum(r['amount'] for r in data['relationships'] if r['source']=='aggregate:public' and r['target']==p['organizationId']) for p in data['nonprofitProfiles']}}))
