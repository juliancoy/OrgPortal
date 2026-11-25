"""Explicit pre-2013 IRS e-file field mapping; preserve original source paths."""
import datetime,hashlib,re,xml.etree.ElementTree as ET
from rendered_990_statement import Fields
from irs_nonprofits import money,text,ein
from nonprofit_statements import statement_lines

ALIASES={'CYContributionsGrantsAmt':'ContributionsGrantsCurrentYear','CYProgramServiceRevenueAmt':'ProgramServiceRevenueCY',
 'CYInvestmentIncomeAmt':'InvestmentIncomeCurrentYear','CYOtherRevenueAmt':'OtherRevenueCurrentYear','CYTotalRevenueAmt':'TotalRevenueCurrentYear',
 'CYGrantsAndSimilarPaidAmt':'GrantsAndSimilarAmntsCY','CYBenefitsPaidToMembersAmt':'BenefitsPaidToMembersCY',
 'CYSalariesCompEmpBnftPaidAmt':'SalariesEtcCurrentYear','CYTotalProfFndrsngExpnsAmt':'TotalProfFundrsngExpCY',
 'CYOtherExpensesAmt':'OtherExpensesCurrentYear','CYTotalExpensesAmt':'TotalExpensesCurrentYear',
 'ProgramServiceRevenueGrp':'ProgramServiceRevenue','TotalOthProgramServiceRevGrp':'TotalOthProgramServiceRevenue',
 'TotalRevenueColumnAmt':'TotalRevenueColumn','Desc':'Description'}

def normalize_legacy_statement(raw,row,url,retrieved):
    fields=Fields();fields.feed(raw.decode());header='/AppData/SubmissionHeaderAndDocument/ReturnHeader[1]/'
    prefix='/AppData/SubmissionHeaderAndDocument/SubmissionDocument/IRS990[1]/'
    h=lambda p:fields.fields.get(header+p,'').strip()
    if ein(h('Filer[1]/EIN[1]'))!=ein(row['EIN']):raise ValueError('Legacy filing EIN mismatch')
    start=datetime.datetime.strptime(h('TaxPeriodBeginDate[1]'),'%m-%d-%Y').date().isoformat()
    end=datetime.datetime.strptime(h('TaxPeriodEndDate[1]'),'%m-%d-%Y').date().isoformat()
    if end.replace('-','')[:6]!=row['TAX_PERIOD']:raise ValueError('Legacy filing period mismatch')
    form=ET.Element('IRS990');reverse={v:k for k,v in ALIASES.items()};elements={}
    for path,value in fields.fields.items():
        if not path.startswith(prefix):continue
        parts=path[len(prefix):].split('/');first=parts[0].split('[')[0]
        if first not in reverse:continue
        parent=form;current=''
        for part in parts:
            match=re.fullmatch(r'(\w+)(\[\d+\])',part)
            if not match:raise ValueError('Unexpected legacy path')
            name=reverse.get(match[1],match[1]);current+='/'+name+match[2]
            if current not in elements:elements[current]=ET.SubElement(parent,name)
            parent=elements[current]
        parent.text=value.strip().replace(',','') if re.fullmatch(r'[\d,.-]+',value.strip()) else value.strip()
    statements=statement_lines(form,money,text)
    for section in statements.values():
        for line in section['lines']:
            line['sourceLine']=re.sub(r'\w+',lambda m:ALIASES.get(m[0],m[0]),line['sourceLine'])
    def scalar(name):
        value=fields.fields.get(prefix+name+'[1]','').strip().replace(',','')
        if not value:return None
        e=ET.Element('root');ET.SubElement(e,'value').text=value;return money(e,'value')
    return {'id':row['OBJECT_ID'],'ein':ein(row['EIN']),'name':h('Filer[1]/Name[1]/BusinessNameLine1[1]'),
        'formType':'990','periodStart':start,'periodEnd':end,'filedAt':'','amended':None,
        'accountingBasis':'accrual' if fields.fields.get(prefix+'MethodOfAccountingAccrual[1]')=='1' else 'unspecified',
        'sourceUrl':f'https://projects.propublica.org/nonprofits/organizations/{int(row["EIN"])}/{row["OBJECT_ID"]}/full',
        'sourceDocumentUrl':url,'archiveUrl':'','sourceFormat':'irs_efile_rendered_html_legacy','sourceSha256':hashlib.sha256(raw).hexdigest(),
        'retrievedAt':retrieved,'revenue':money(form,'CYTotalRevenueAmt'),'expenses':money(form,'CYTotalExpensesAmt'),
        'assets':scalar('TotalAssetsEOY'),'liabilities':scalar('TotalLiabilitiesEOY'),'statements':statements}
