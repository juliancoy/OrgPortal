"""Check audit arithmetic and compare sampled node counts with the local public API."""
import csv,json,pathlib,ssl,urllib.request,urllib.parse,sys
folder=pathlib.Path(sys.argv[1]);a=json.loads((folder/'audit.json').read_text());rows=list(csv.DictReader((folder/'nodes.csv').open()));t=a['totals']
assert len(rows)==t['nodes']==sum(b['nodes'] for b in a['distribution'])
assert sum(int(r['incoming']) for r in rows)==sum(int(r['outgoing']) for r in rows)==t['uniqueDirectedPairs']
assert sum(int(r['neighbors']) for r in rows)==2*t['uniqueUndirectedPairs']
assert sum(int(r['neighbors'])==0 for r in rows)==t['isolated']
assert a['integrity']['nativeUniqueRecords']==a['integrity']['exportedNativeRecords']
assert a['integrity']['externalCount']==a['integrity']['exportedComptrollerRecords']
assert all(a['integrity'][k]==0 for k in ['danglingGraphEndpoints','missingEvidenceEndpoints','duplicateEvidenceKeys','profileMismatches','nodesMissingProfile','ambiguousAliases'])
samples=[next(r for r in rows if r['id']==id) for id in ['research-state-maryland','source-label:maryland_comptroller:agency:48f492397cccbc6623346999a79f812a','source-label:maryland_comptroller:agency:14aa88b77dfd301a1a96d03621dbdb9e','compass-agency:54aa50be9ce8cd11d60c']]
for r in samples:
 url='https://localhost:8443/api/ecosystem/organization-map?'+urllib.parse.urlencode({'org':r['id'],'limit':1})
 with urllib.request.urlopen(url,context=ssl._create_unverified_context(),timeout=30) as response:page=json.load(response)
 assert page['version']==a['snapshot']['version'],'Snapshot changed; compare against the audited version'
 assert page['total']==int(r['neighbors']) and page['incoming']==int(r['incoming']) and page['outgoing']==int(r['outgoing']),r['id']
 print('PASS',r['name'],r['id'],r['neighbors'],'neighbors')
print('PASS: every node included, degree sums and distribution reconcile, imported record totals match, no endpoint/index inconsistencies; sampled public API counts agree')
