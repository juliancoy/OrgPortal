#!/usr/bin/env python3
"""Normalize retained recipient exports without merging recipients by name.

Only completed, checksum-verified exports are accepted. The transaction ID is
the native importer ID, so later overlapping Maryland imports replace the same
evidence rather than introducing another financial observation.
"""
import argparse, csv, hashlib, importlib.util, io, json, pathlib, re, zipfile

spec = importlib.util.spec_from_file_location('federal', pathlib.Path(__file__).with_name('collect-usaspending.py'))
federal = importlib.util.module_from_spec(spec)
spec.loader.exec_module(federal)

def prepare(folder):
    manifest = json.loads((folder / 'manifest.partial.json').read_text())
    nodes, records, sources = {}, {}, []
    for item in manifest:
        archive = folder / item['file']
        sha = hashlib.file_digest(archive.open('rb'), 'sha256').hexdigest()
        if sha != item['sha256'] or item['status']['status'] != 'finished':
            raise ValueError('Unverified source archive')
        count = duplicates = 0
        with zipfile.ZipFile(archive) as zipped:
            for filename in zipped.namelist():
                if not filename.endswith('.csv'): continue
                for raw in csv.DictReader(io.TextIOWrapper(zipped.open(filename), encoding='utf-8-sig')):
                    row = federal.normalize(raw, item['requestedAt'], sha, require_maryland=False)
                    p = row['metadata']; agency = p['awarding_agency_code']; uei = p['recipient_uei']
                    source = ('usgov:agency:' + agency if re.fullmatch(r'\d{3}', agency) and agency != '999'
                              else 'source-label:usaspending:agency:' + federal.digest(row['agency_label'].encode())[:32])
                    target = ('usgov:recipient:' + uei if re.fullmatch(r'[A-Z0-9]{12}', uei)
                              else 'source-label:usaspending:recipient:' + federal.digest(row['recipient_label'].encode())[:32])
                    for node_id, label, role, identifiers in [(source,row['agency_label'],'agency',{'usaspendingAgencyCode':agency}),
                                                            (target,row['recipient_label'],'recipient',{'uei':uei} if uei else {})]:
                        nodes.setdefault(node_id, {'id':node_id,'name':label,'type':'Organization' if node_id.startswith('usgov:') else 'Source label',
                            'category':'government' if role=='agency' else 'general','entityType':'organization' if node_id.startswith('usgov:') else 'source_label',
                            'identityStatus':'source_linked' if node_id.startswith('usgov:') else 'unverified_label','directory':False,
                            'sourceCategory':'usaspending','identifiers':identifiers})
                    edge = {'id':row['id'],'source':source,'target':target,'sourceLabel':row['agency_label'],'targetLabel':row['recipient_label'],
                        'kind':'obligation','relationship':'funding','financialFactType':'obligation','financialMeasure':'delta','measurement':'delta',
                        'amount':row['amount_cents']/100,'currency':'USD','date':row['occurred_at'],'fiscalYear':int(p['fiscal_year']),
                        'fiscalCalendar':'federal','description':row['description'],'type':row['description'] or 'Federal obligation',
                        'sourceUrl':row['source_url'],'sourceSystem':'usaspending','sourceDataset':'prime_transactions','evidence':'usaspending',
                        'sourceRecordType':'external_financial_observation','transactionRecordId':row['id'],'status':'reported',
                        'retrievedAt':row['retrieved_at'],'notes':'Signed federal obligation, not a cash disbursement. Recipient search can include related organizations; source identities remain separate.',
                        'provenance':{**p,'recipient_duns':raw.get('recipient_duns',''),'sourceSha256':sha}}
                    count += 1
                    if row['id'] in records:
                        old = records[row['id']]
                        comparable = lambda r: {k:v for k,v in r.items() if k not in ['retrievedAt','provenance']} | {'provenance':{k:v for k,v in r['provenance'].items() if k!='sourceSha256'}}
                        if comparable(old) != comparable(edge): raise ValueError('Conflicting source transaction')
                        duplicates += 1
                    else: records[row['id']] = edge
        if count != item['status']['total_rows']: raise ValueError('Source row count mismatch')
        sources.append({'sourceSha256':sha,'rows':count,'duplicates':duplicates,'request':item['request'],'requestedAt':item['requestedAt']})
    return {'organizations':list(nodes.values()),'relationships':list(records.values()),'metadata':[{
        'id':'data:hopkinsFederalHistory:' + federal.digest(json.dumps(sources,sort_keys=True).encode())[:20],
        'value':{'sources':sources,'records':len(records),'scope':'Completed recipient-search exports only. Other years and source aliases may remain unavailable; not a complete cash ledger.'}}]}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',required=True,type=pathlib.Path);p.add_argument('--output',required=True,type=pathlib.Path);a=p.parse_args()
    result=prepare(a.source);a.output.write_text(json.dumps(result,separators=(',',':'))+'\n');a.output.chmod(0o600)
    print(json.dumps({'records':len(result['relationships']),'nodes':len(result['organizations'])}))
