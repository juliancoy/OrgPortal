#!/usr/bin/env python3
"""Normalize checksummed RePORTER pages without converting awards into payments.

No PI names, contacts or street addresses are published. Unknown recipient
identifiers remain separate source identities; subprojects remain evidence and
are never included in parent-project award totals.
"""
import argparse, collections, hashlib, json, pathlib
from decimal import Decimal

IDENTITIES={
 '4134401':('FTMTDMBR29C7','org-johns-hopkins-university','Johns Hopkins University'),
 '2919603':('VAHXFBLGVHE1','registry-a55f67fe-f0bb-4af0-aed7-c93b44075b5c','Johns Hopkins Bayview Medical Center Inc'),
 '4136301':(None,'registry-9c4d09ac-0939-473e-990e-20ea7cabdcad','The Johns Hopkins Hospital'),
}

def normalize(row,page_sha,retrieved):
    org=row['organization'];ipf=str(org.get('org_ipf_code') or org.get('external_org_id') or '')
    identity=IDENTITIES.get(ipf);uei=org.get('primary_uei')
    if identity and uei and identity[0] and uei!=identity[0]:raise ValueError('Conflicting NIH recipient identifiers')
    target=identity[1] if identity else 'nih:recipient:'+ipf
    if not ipf:raise ValueError('NIH recipient has no source identity')
    agency=row.get('agency_ic_admin') or {};code=agency.get('code') or 'unreported'
    source='nih:admin:'+code
    nodes=[{'id':source,'name':agency.get('name') or agency.get('abbreviation') or 'RePORTER administering agency unspecified',
            'type':'Federal research administering agency','category':'general','sourceCategory':'NIH RePORTER',
            'sourceUrl':'https://reporter.nih.gov/','identifiers':{'nihAdminCode':code},
            'relevance':'Administering agency reported by RePORTER. Co-funding institutes are retained in each project record; this does not assert that the administrator provided every dollar.'}]
    if not identity:nodes.append({'id':target,'name':org['org_name'],'type':'Unresolved historical recipient','category':'general',
                                 'sourceCategory':'NIH RePORTER','identityStatus':'unreviewed','identifiers':{'nihIpf':ipf}})
    sub=row.get('subproject_id');application=row['appl_id'];year=row['fiscal_year']
    if not isinstance(year,int) or not isinstance(application,int):raise ValueError('Invalid NIH identity/year')
    amount=row.get('award_amount')
    if amount is not None:
        cents=Decimal(str(amount))*100
        if not cents.is_finite() or cents!=cents.to_integral_value() or abs(cents)>9007199254740991:raise ValueError('Invalid NIH amount')
    url=row.get('project_detail_url') or f'https://reporter.nih.gov/project-details/{application}'
    if url!=f'https://reporter.nih.gov/project-details/{application}':raise ValueError('Unexpected NIH evidence URL')
    record={'id':f'nih:project:{application}:{sub or "parent"}', 'source':source,'target':target,
            'sourceLabel':nodes[0]['name'],'targetLabel':org['org_name'],'kind':'subproject_award' if sub else 'reported_award',
            'financialFactType':'subproject_award' if sub else 'reported_award','financialMeasure':'subproject_component' if sub else 'project_fiscal_year_award',
            'amount':amount,'currency':'USD','date':f'FY{year}','fiscalYear':year,'fiscalCalendar':'federal',
            'type':'Research subproject allocation' if sub else 'Reported research project award','description':row.get('project_title') or '',
            'status':'reported','sourceSystem':'nih_reporter','sourceRecordType':'research_subproject' if sub else 'research_project',
            'sourceUrl':url,'retrievedAt':retrieved,
            'notes':'Reported project funding, not cash disbursement. May overlap USAspending obligations and annual statements; do not add across sources.'+(' Subproject component excluded from parent award totals.' if sub else ''),
            'provenance':{'sourceSha256':page_sha,'applicationId':application,'subprojectId':sub,'projectNumber':row.get('project_num'),
              'recipientIpf':ipf,'recipientUei':uei,'identityMethod':'reviewed_nih_ipf_and_uei' if identity else 'unresolved_source_identity',
              'administeringAgency':agency,'fundingInstitutes':row.get('agency_ic_fundings') or [],
              'budgetStart':row.get('budget_start'),'budgetEnd':row.get('budget_end'),
              'projectStart':row.get('project_start_date'),'projectEnd':row.get('project_end_date'),
              'directCost':row.get('direct_cost_amt'),'indirectCost':row.get('indirect_cost_amt')}}
    return nodes,record

def prepare(directory):
    nodes={};records={};years={};pages=[];totals=collections.defaultdict(lambda:{'parents':0,'subprojects':0,'missingParentAmounts':0,'parentAwardCents':0})
    for path in sorted(directory.glob('*.json')):
        raw=path.read_bytes();page=json.loads(raw);response=page['response'];request=page['request'];year=request['criteria']['fiscal_years'][0]
        count=years.setdefault(year,{'expected':response['meta']['total'],'actual':0})
        if count['expected']!=response['meta']['total']:raise ValueError('Source count changed between pages')
        sha=hashlib.sha256(raw).hexdigest();pages.append({'file':path.name,'sha256':sha,'records':len(response['results'])})
        for row in response['results']:
            if row['fiscal_year']!=year:raise ValueError('Wrong fiscal year')
            ns,record=normalize(row,sha,page['retrievedAt'])
            if record['id'] in records:raise ValueError('Duplicate NIH project identity')
            nodes.update((n['id'],n) for n in ns);records[record['id']]=record;count['actual']+=1
            t=totals[year];sub=bool(row.get('subproject_id'));t['subprojects' if sub else 'parents']+=1
            if not sub:
                if row.get('award_amount') is None:t['missingParentAmounts']+=1
                else:t['parentAwardCents']+=int(Decimal(str(row['award_amount']))*100)
    if any(x['actual']!=x['expected'] for x in years.values()):raise ValueError('Incomplete NIH pagination')
    return {'organizations':list(nodes.values()),'relationships':list(records.values()),'metadata':[{'id':'data:nihHopkinsCoverage',
            'value':{'source':'https://api.reporter.nih.gov/v2/projects/search','query':'JOHNS HOPKINS','records':len(records),
                     'years':years,'totals':dict(totals),'pages':pages,'limitations':['Organization-name query; unknown historic identifiers remain separate.','Subproject amounts excluded from parent totals.','Reported awards, not cash or additional money beyond other funding sources.']}}]}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',required=True,type=pathlib.Path);p.add_argument('--output',required=True,type=pathlib.Path);a=p.parse_args()
    data=prepare(a.source);a.output.write_text(json.dumps(data,separators=(',',':'))+'\n');a.output.chmod(0o600)
    print(json.dumps({'records':len(data['relationships']),'nodes':len(data['organizations']),'sha256':hashlib.sha256(a.output.read_bytes()).hexdigest()}))
