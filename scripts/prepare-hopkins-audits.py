import pathlib,json,re,hashlib,datetime,argparse
parser=argparse.ArgumentParser(description='Extract reconciled Hopkins reporting-group operating statements from retained HSCRC audits.');parser.add_argument('--source',required=True,type=pathlib.Path);parser.add_argument('--output',required=True,type=pathlib.Path);parser.add_argument('--identities',required=True,type=pathlib.Path);args=parser.parse_args();source=args.source;manifest=json.load(open(source/'manifest.json'))
group='reporting-group:johns-hopkins-health-system-affiliates';nodes={group:{'id':group,'name':'Johns Hopkins Health System and affiliates — reporting group','type':'Combined or consolidated financial reporting group','category':'general','entityType':'aggregate','identityStatus':'aggregate','sourceCategory':'Audited financial statements','relevance':'Financial reporting scope of the cited annual audits. Not a legal nonprofit or an identity merger. Scope changes and prior-year restatements follow each source report.'}};records=[];reports=[];used=set()
number=r'\(?-?\d[\d,]*(?:\.\d+)?\)?'
def amounts(line):
 parts=re.split(r'\s{2,}',line.strip()); values=[]
 for part in parts[1:]:
  for v in re.findall(number,part.replace('$','')):
   values.append(float(v.replace(',','').replace('(','-').replace(')','')))
 return values
candidates=[]
for item in manifest:
 if 'hospital-audits' not in item.get('file','') or item['file'] in used:continue
 used.add(item['file']);raw=(source/item['file']).read_bytes();assert hashlib.sha256(raw).hexdigest()==item['sha256']
 text=(source/item['file']).with_suffix('.txt').read_text();m=re.search(r'June 30, (20\d\d) and (20\d\d)',text[:1500])
 if not m or not re.search(r'affiliates',text[:250],re.I):continue
 lines=text.splitlines();revenue_index=next((i for i,l in enumerate(lines[:400]) if re.search(r'Total operating revenues',l,re.I)),None);expense_index=next((i for i,l in enumerate(lines[:400]) if re.search(r'Total operating expenses',l,re.I)),None)
 if revenue_index is None or expense_index is None:continue
 assert re.search(r'in thousands',text[:text.find(lines[revenue_index])],re.I)
 start=next(i for i in range(revenue_index-12,revenue_index) if re.match(r'\s*Net patient service revenue(?:,|\s)',lines[i],re.I) and 'before' not in lines[i].lower())
 revenue_lines=[(l.strip().split('  ')[0],amounts(l),i+1) for i,l in enumerate(lines[start:revenue_index],start) if len(amounts(l))==2]
 expense_lines=[(l.strip().split('  ')[0],amounts(l),i+1) for i,l in enumerate(lines[revenue_index+1:expense_index],revenue_index+1) if len(amounts(l))==2]
 rt,et=amounts(lines[revenue_index]),amounts(lines[expense_index]);assert len(rt)==len(et)==2
 for col,year in enumerate(map(int,m.groups())):
  if sum(r[1][col] for r in revenue_lines)!=rt[col] or sum(r[1][col] for r in expense_lines)!=et[col]:
   print('UNRECONCILED',year,item['file'],revenue_lines,expense_lines,rt,et);raise ValueError('Audited statement extraction mismatch')
  candidates.append({'year':year,'documentYear':int(m[1]),'column':col,'item':item,'revenues':revenue_lines,'expenses':expense_lines,'revenue':rt[col],'expense':et[col],'lines':lines,'scope':'consolidated' if 'Consolidated' in text[:250] else 'combined'})
selected={}
for c in sorted(candidates,key=lambda c:c['documentYear'],reverse=True):selected.setdefault(c['year'],c)
for year,c in sorted(selected.items()):
 col=c['column'];item=c['item'];lines=c['lines'];payer=[]
 # Only a source table of dollar amounts that exactly reconciles to patient
 # revenue can replace that leaf. Percentages and receivables are not revenue.
 for i,line in enumerate(lines):
  if re.match(r'\s*Medicare\s+',line):
   part=lines[i:i+12];possible=[]
   for offset,l in enumerate(part):
    if re.match(r'\s*(Medicare|Medicaid(?:/Medicaid MCO)?|Blue Cross|HMO|Commercial|Other payors|Self pay)\s',l):
     v=amounts(l)
     if len(v)==4:possible.append((l.strip().split('  ')[0],v[col*2],i+offset+1))
   if len(possible)==7 and sum(v for _,v,_ in possible)==c['revenues'][0][1][col]:payer=possible;break
 report={'fiscalYear':year,'sourceUrl':item['url'],'sourceSha256':item['sha256'],'reportingScope':c['scope'],'documentFiscalYear':c['documentYear'],'comparativeColumn':col==1,'operatingRevenue':int(c['revenue']*1000),'operatingExpenses':int(c['expense']*1000),'payerBreakdownReconciled':bool(payer)};reports.append(report)
 for kind,source_lines in [('revenue',c['revenues']),('expense',c['expenses'])]:
  entries=[]
  for n,(label,values,line) in enumerate(source_lines):
   if kind=='revenue' and n==0 and payer:entries.extend((label,value,line,True) for label,value,line in payer)
   else:entries.append((label,values[col],line,False))
  for label,value,line,is_payer in entries:
   nid='aggregate:public' if is_payer and label=='Self pay' else 'aggregate:jhhs:'+kind+':'+hashlib.sha256(label.encode()).hexdigest()[:20]
   if nid!='aggregate:public':nodes[nid]={'id':nid,'name':label,'type':'Reported payer category' if is_payer else 'Aggregate audited statement category','category':'general','entityType':'aggregate','identityStatus':'aggregate','directory':False,'sourceCategory':'Audited financial statements'}
   a,b=(nid,group) if kind=='revenue' else (group,nid)
   records.append({'id':f'jhhs-audit:{year}:{kind}:'+hashlib.sha256(label.encode()).hexdigest()[:20],'source':a,'target':b,'kind':kind,'financialFactType':kind,'financialMeasure':'annual_statement','measurement':'period_total','aggregate':True,'amount':int(value*1000),'currency':'USD','date':f'{year}-06-30','periodStart':f'{year-1}-07-01','periodEnd':f'{year}-06-30','fiscalYear':year,'fiscalCalendar':'filer','type':'Audited operating '+kind+': '+label,'description':label,'status':'reported','sourceUrl':item['url'],'sourceSystem':'audited_financial_statements','sourceRecordType':'consolidated_statement','retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'notes':'Combined/consolidated reporting group, not the separate health-system corporation or an individual payment. Includes affiliated entities and elimination entries. Do not add to separate legal-entity statements or federal funding records.'+(' Primary payer classification includes patient deductibles and coinsurance in that payer category; not a cash-paid-by-payer ledger.' if is_payer else ''),'provenance':{**report,'sourceTextLine':line,'sourceLabel':label,'sourceAmountThousands':value,'sourceAmountColumn':col,'extraction':'Reviewed PDF text, scale 1000; revenue and expense leaves reconcile separately to printed totals.'}})
 # No total edges: each disjoint revenue/expense leaf is represented once.
for key in ['health-system','hospital','bayview']:
 entity=next(e for e in json.load(open(args.identities))['entities'] if e['key']==key)
 records.append({'id':'jhhs-reporting-member:'+entity['organizationId'],'source':group,'target':entity['organizationId'],'kind':'agency','relationship':'affiliation','status':'reported','type':'Included in financial reporting group','sourceUrl':reports[-1]['sourceUrl'],'notes':'Documented reporting affiliation, not a payment or an identity merger. Other affiliates are included in the report; these three links are not an exhaustive legal-entity list.'})
result={'organizations':list(nodes.values()),'relationships':records,'metadata':[{'id':'data:jhhsAuditedStatements','value':{'reports':reports,'scope':'Published JHHS combined/consolidated statements available from HSCRC. Prior-year comparative columns fill years without a separate current-year report. Legal-entity Form 990 reports remain distinct.'}}]};args.output.write_text(json.dumps(result,separators=(',',':'))+'\n');print(json.dumps({'years':sorted(selected),'observations':len(records),'payerYears':[r['fiscalYear'] for r in reports if r['payerBreakdownReconciled']]}))
