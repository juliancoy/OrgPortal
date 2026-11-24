"""Annual statement observations, kept separate from cash payments and awards.

Public/customer attribution is an explicit review keyed to a filing checksum and
an exact source line. No payer is inferred from an organization's name or NAICS.
"""
from decimal import Decimal

PUBLIC = {'id':'aggregate:public','name':'Public','category':'general','type':'Aggregate customers',
          'entityType':'aggregate','identityStatus':'aggregate','directory':False,
          'relevance':'Students, patients and other customers purchasing services, including purchases paid on their behalf. Not a legal entity or a claim that households paid every dollar. Insurer, government and other third-party payer shares are not separated unless the source provides them.',
          'sourceCategory':'Public financial statements'}

def statement_lines(form, money, text):
    def line(path,label,section,amount=None):
        return {'sourceLine':path,'label':label,'section':section,'amount':money(form,path) if amount is None else amount}
    revenues=[line('CYContributionsGrantsAmt','Contributions and grants','contributions'),
              line('CYInvestmentIncomeAmt','Investment income and realized gains','investment'),
              line('CYOtherRevenueAmt','Other revenue, net','other')]
    service_total=money(form,'CYProgramServiceRevenueAmt')
    service=[]
    for i,g in enumerate(form.findall('ProgramServiceRevenueGrp'),1):
        amount=money(g,'TotalRevenueColumnAmt')
        if amount is not None:service.append(line(f'ProgramServiceRevenueGrp[{i}]/TotalRevenueColumnAmt',text(g,'Desc') or 'Program services','program_services',amount))
    remainder=money(form,'TotalOthProgramServiceRevGrp/TotalRevenueColumnAmt')
    if remainder is not None:service.append(line('TotalOthProgramServiceRevGrp/TotalRevenueColumnAmt','Other program service revenue','program_services',remainder))
    if service_total is not None and service and sum(Decimal(str(x['amount'])) for x in service)==Decimal(str(service_total)):
        revenues.extend(service)
    else:
        # Incomplete itemization is not a residual attributed to customers.
        revenues.append(line('CYProgramServiceRevenueAmt','Program service revenue — payer mix unspecified','program_services'))
    expenses=[line(path,label,'expenses') for path,label in [
        ('CYGrantsAndSimilarPaidAmt','Grants and similar assistance'),
        ('CYBenefitsPaidToMembersAmt','Member benefits'),
        ('CYSalariesCompEmpBnftPaidAmt','Salaries, compensation and employee benefits'),
        ('CYTotalProfFndrsngExpnsAmt','Professional fundraising fees'),
        ('CYOtherExpensesAmt','Other expenses')]]
    def reconcile(lines,total):
        known=[x for x in lines if x['amount'] is not None]
        # An absent field remains unavailable. Reconciliation is arithmetic,
        # not evidence that an omitted line was explicitly reported as zero.
        return {'lines':known,'total':total,'reconciled':total is not None and sum(Decimal(str(x['amount'])) for x in known)==Decimal(str(total))}
    return {'revenue':reconcile(revenues,money(form,'CYTotalRevenueAmt')),
            'expenses':reconcile(expenses,money(form,'CYTotalExpensesAmt'))}

def statement_evidence(summary,organization_id,review=None):
    """Project disjoint statement lines. Totals remain in the profile, not edges."""
    review=review or {'publicLines':[]}
    public={r['sourceLine']:r for r in review.get('publicLines',[])}
    if public and (review.get('filingId')!=summary['id'] or review.get('sourceSha256')!=summary['sourceSha256']):
        raise ValueError('Public attribution review does not match the filing checksum')
    statements=summary.get('statements',{});known={r['sourceLine']:r for r in statements.get('revenue',{}).get('lines',[])}
    if any(path not in known or known[path]['label']!=r['label'] or not r.get('reason') for path,r in public.items()):
        raise ValueError('Public attribution requires an exact reviewed revenue line and reason')
    organizations={};relationships=[]
    for kind,section in [('revenue','revenue'),('expense','expenses')]:
        report=statements.get(section,{})
        if not report.get('reconciled'):continue # Never publish a partial breakdown as a complete budget.
        for row in report['lines']:
            if row['amount']==0:continue
            is_public=kind=='revenue' and row['sourceLine'] in public
            if is_public:node=dict(PUBLIC)
            else:
                label={'contributions':'Donors and grantors','investment':'Investment returns','program_services':'Other service customers and sponsors','other':'Other revenue sources','expenses':row['label']}[row['section']]
                node={'id':f'aggregate:statement:{summary["ein"]}:{kind}:{row["sourceLine"] if kind=="expense" else row["section"]}',
                      'name':label,'type':'Aggregate statement category','category':'general','entityType':'aggregate','identityStatus':'aggregate','directory':False,
                      'sourceCategory':'IRS Form 990','relevance':'Annual statement category, not an identified counterparty or an individual payment. Scope: '+summary['name']}
            organizations[node['id']]=node
            source,target=(node['id'],organization_id) if kind=='revenue' else (organization_id,node['id'])
            notes=f'Fiscal period {summary["periodStart"]} through {summary["periodEnd"]}; {summary["accountingBasis"]} accounting. Annual {kind} observation, not an individual payment or a proposed budget. Excluded from cash-payment and award totals. May overlap recorded funding; do not add to those records.'
            if is_public:notes+=' Public groups service customers and purchases on their behalf; insurer, government and household shares are not established. '+public[row['sourceLine']]['reason']
            relationships.append({'id':f'irs990-statement:{summary["id"]}:{kind}:{row["sourceLine"]}',
                'source':source,'target':target,'sourceLabel':node['name'] if kind=='revenue' else summary['name'],
                'targetLabel':summary['name'] if kind=='revenue' else node['name'],
                'kind':kind,'relationship':kind,'financialFactType':kind,'financialMeasure':'annual_statement','measurement':'period_total',
                'aggregate':True,'amount':row['amount'],'currency':'USD','date':summary['periodEnd'],
                'periodStart':summary['periodStart'],'periodEnd':summary['periodEnd'],'fiscalYear':int(summary['periodEnd'][:4]),'fiscalCalendar':'filer',
                'type':f'Annual {kind}: {row["label"]}','description':row['label'],'status':'reported','notes':notes,
                'sourceUrl':summary['sourceUrl'],'sourceSystem':'irs_form_990','sourceRecordType':'nonprofit_statement',
                'provenance':{'filingId':summary['id'],'ein':summary['ein'],'sourceLine':row['sourceLine'],'sourceSha256':summary['sourceSha256'],
                              'archiveUrl':summary['archiveUrl'],'accountingBasis':summary['accountingBasis'],
                              'attribution':{'method':'reviewed_customer_category','reason':public[row['sourceLine']]['reason']} if is_public else {'method':'source_statement_category'}},
                'retrievedAt':summary['retrievedAt']})
    return list(organizations.values()),relationships
