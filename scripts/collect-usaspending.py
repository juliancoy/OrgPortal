"""Collect official federal obligation transactions, preserving source identities.

Only the requested public financial fields are downloaded; no street addresses,
contact details or tax identifiers. ZIPs/receipts stay in the private output folder.
"""
import argparse
from contextlib import closing
import csv
import datetime as dt
import hashlib
import io
import json
import os
from pathlib import Path
import sqlite3
import time
from decimal import Decimal, DecimalException
from urllib.parse import urlparse
import zipfile
import requests
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from federal_source_http import session as source_session

BASE = 'https://api.usaspending.gov/api/v2'
CODES = ['A', 'B', 'C', 'D', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11']
COMMON_COLUMNS = ['modification_number', 'action_date', 'federal_action_obligation', 'awarding_agency_code', 'awarding_agency_name',
 'awarding_sub_agency_code', 'awarding_sub_agency_name', 'funding_agency_code', 'funding_agency_name',
 'recipient_name', 'recipient_uei', 'recipient_state_code', 'recipient_country_code',
 'primary_place_of_performance_state_name', 'primary_place_of_performance_country_code',
 'transaction_description', 'action_date_fiscal_year', 'usaspending_permalink']
FAMILIES = {
 'contracts': (['A', 'B', 'C', 'D'], ['contract_transaction_unique_key', 'contract_award_unique_key', 'award_id_piid', 'award_type_code']),
 'assistance': (['02', '03', '04', '05', '06', '07', '08', '09', '10', '11'], ['assistance_transaction_unique_key', 'assistance_award_unique_key', 'award_id_fain', 'award_id_uri', 'assistance_type_code']),
}

def digest(value):
    return hashlib.sha256(value).hexdigest()

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)

def save(path, value):
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, indent=2) + '\n')
    os.chmod(temp, 0o600)
    temp.replace(path)

def official(url):
    p = urlparse(url)
    if p.scheme != 'https' or p.username or p.password or p.hostname not in ['api.usaspending.gov', 'files.usaspending.gov', 'www.usaspending.gov']:
        raise ValueError('Unexpected federal source URL')
    return url

def request(method, url, **kwargs):
    for attempt in range(4):
        try:
            with source_session(attempt) as session:
                response = session.request(method, official(url), timeout=(15, 90), **kwargs)
            response.raise_for_status()
            return response
        except (requests.ConnectionError, requests.Timeout, requests.HTTPError) as error:
            if attempt == 3 or isinstance(error, requests.HTTPError) and error.response.status_code not in [429, 500, 502, 503, 504]:
                raise
            time.sleep(2 ** attempt)

def normalize(row, retrieved_at, source_sha256, *, require_maryland=True):
    transaction = row.get('contract_transaction_unique_key') or row.get('assistance_transaction_unique_key')
    award = row.get('contract_award_unique_key') or row.get('assistance_award_unique_key')
    if not transaction or not award:
        raise ValueError('Missing stable federal transaction/award key')
    date = dt.date.fromisoformat(row['action_date'])
    amount = Decimal(row['federal_action_obligation']) * 100
    if not amount.is_finite() or amount != amount.to_integral_value() or abs(amount) > 9007199254740991:
        raise ValueError('Invalid signed federal obligation cents')
    recipient_state = row.get('recipient_state_code', '')
    performance_state = row.get('primary_place_of_performance_state_code') or ('MD' if row.get('primary_place_of_performance_state_name', '').strip().upper() in ['MARYLAND','MD'] else '')
    if require_maryland and recipient_state != 'MD' and performance_state != 'MD':
        raise ValueError('Transaction is outside Maryland selection')
    source = official(row['usaspending_permalink'])
    if urlparse(source).hostname != 'www.usaspending.gov' or not urlparse(source).path.startswith('/award/'):
        raise ValueError('Missing official award evidence link')
    agency, recipient = row['awarding_agency_name'].strip(), row['recipient_name'].strip()
    if not recipient:
        identifier = row.get('recipient_uei','').strip() or award
        recipient = f'Recipient not reported ({identifier})'
    if not agency and row.get('awarding_agency_code'):
        agency = f"Federal agency {row['awarding_agency_code']} (name not supplied)"
    if not agency or not recipient:
        raise ValueError('Missing reported counterparty label and source identifier')
    metadata = {key: row.get(key, '') for key in [
        'awarding_agency_code', 'awarding_agency_name', 'awarding_sub_agency_code', 'awarding_sub_agency_name',
        'funding_agency_code', 'funding_agency_name', 'recipient_uei', 'recipient_state_code',
        'recipient_country_code', 'primary_place_of_performance_state_code',
        'primary_place_of_performance_country_code', 'primary_place_of_performance_state_name', 'modification_number', 'assistance_type', 'award_type']}
    metadata.update(primary_place_of_performance_state_code=performance_state, assistance_type=row.get('assistance_type_code', ''), award_type=row.get('award_type_code', ''),
                    award_key=award, transaction_key=transaction,
                    award_identifier=row.get('award_id_piid') or row.get('award_id_fain') or row.get('award_id_uri') or award,
                    fiscal_year=str(date.year + (date.month >= 10)))
    return dict(id='usaspending:transaction:' + digest(transaction.encode()), dataset='prime_transactions',
                external_id=transaction, agency_label=agency, recipient_label=recipient,
                occurred_at=date.isoformat(), amount_cents=int(amount), fact_type='obligation',
                description=row.get('transaction_description') or row.get('award_description') or '',
                source_url=source, metadata=metadata, retrieved_at=retrieved_at, source_sha256=source_sha256)

def collect(out, years, quarantine_invalid=False):
    out.mkdir(parents=True, exist_ok=True, mode=0o700)
    manifest = {'startedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'fiscalYears': years,
                'scopes': ['place_of_performance', 'recipient'], 'sources': [], 'limitations': [
                    'Federal obligations and deobligations, not disbursements or settled cash.',
                    'Recipient location and primary place of performance overlap; transaction keys deduplicate their union.',
                    'Loans retain federal action obligations; loan face value is not added.',
                    'Prime transactions only; subawards are excluded to avoid adding pass-through spending twice.',
                    'Search counts can include duplicate indexed transactions; exported rows reconcile to the completed download count. Search/export differences remain explicit.',
                    'Source reporting delays and revisions apply. No claim of a complete federal cash ledger.']}
    with closing(sqlite3.connect(out / 'staging.sqlite')) as db:
        db.execute('CREATE TABLE IF NOT EXISTS transactions(id TEXT PRIMARY KEY, payload TEXT NOT NULL, content_hash TEXT NOT NULL)')
        # A run is rebuilt from its retained source downloads; never silently mix runs.
        db.execute('DELETE FROM transactions')
        quarantine_path=out/'quarantine.jsonl'
        if quarantine_invalid:quarantine_path.write_text('');quarantine_path.chmod(0o600)
        for year in years:
            for scope, family in [(scope, family) for scope in manifest['scopes'] for family in FAMILIES]:
                codes, family_columns = FAMILIES[family]
                prefix = f'fy{year}-{scope}-{family}'
                receipt = out / (prefix + '-request.json')
                filters = {'award_type_codes': codes, 'time_period': [{'start_date': f'{year-1}-10-01', 'end_date': f'{year}-09-30'}],
                           scope + '_locations': [{'country': 'USA', 'state': 'MD'}]}
                payload = {'filters': filters, 'columns': COMMON_COLUMNS + family_columns, 'spending_level': ['transactions'], 'file_format': 'csv'}
                if receipt.exists():
                    job = json.loads(receipt.read_text())
                    if job['request'] != payload:
                        raise ValueError('Source request changed; choose a fresh output directory')
                else:
                    count = request('POST', BASE + '/search/spending_by_transaction_count/', json={'filters': filters}).json()
                    expected = sum(count['results'].values())
                    if expected >= 500000:
                        raise ValueError('Year exceeds the source download cap; partition before importing')
                    job = {'requestedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'request': payload,
                           'expectedCount': expected, 'response': request('POST', BASE + '/download/search/', json=payload).json()}
                    save(receipt, job)
                archive = out / (prefix + '.zip')
                if not archive.exists():
                    deadline = time.monotonic() + 1800
                    while True:
                        status = request('GET', job['response']['status_url']).json()
                        save(out / (prefix + '-status.json'), status)
                        if status['status'] == 'finished': break
                        if status['status'] == 'failed' or time.monotonic() > deadline:
                            raise ValueError('Federal source download failed or exceeded 30 minutes: ' + str(status.get('message')))
                        print(prefix, status['status'], flush=True)
                        time.sleep(15)
                    with request('GET', status['file_url'], stream=True) as response:
                        temp = archive.with_suffix('.part')
                        with temp.open('wb') as handle:
                            for block in response.iter_content(1024 * 1024): handle.write(block)
                        os.chmod(temp, 0o600); temp.replace(archive)
                status = json.loads((out / (prefix + '-status.json')).read_text())
                with archive.open('rb') as source:source_hash = hashlib.file_digest(source, 'sha256').hexdigest()
                count, duplicate, quarantined = 0, 0, 0
                with zipfile.ZipFile(archive) as zipped:
                    for name in zipped.namelist():
                        if not name.endswith('.csv'): continue
                        with zipped.open(name) as raw:
                            for raw_row in csv.DictReader(io.TextIOWrapper(raw, encoding='utf-8-sig')):
                                count += 1
                                try:row = normalize(raw_row, job['requestedAt'], source_hash)
                                except (ValueError,KeyError,DecimalException) as error:
                                    if not quarantine_invalid:raise
                                    with quarantine_path.open('a') as review:
                                        review.write(canonical({'sourceFile':archive.name,'sourceSha256':source_hash,'csvFile':name,'rowNumber':count,
                                            'requestedAt':job['requestedAt'],'reason':str(error),'row':raw_row})+'\n')
                                    quarantined+=1
                                    continue
                                comparable = {k: v for k, v in row.items() if k not in ['source_sha256', 'retrieved_at']}
                                content_hash = digest(canonical(comparable).encode())
                                prior = db.execute('SELECT content_hash FROM transactions WHERE id=?', (row['id'],)).fetchone()
                                if prior:
                                    if prior[0] != content_hash: raise ValueError('Source transaction changed between overlapping exports')
                                    duplicate += 1
                                else:
                                    db.execute('INSERT INTO transactions VALUES(?,?,?)', (row['id'], canonical(row), content_hash))
                if status.get('status') != 'finished' or count != status.get('total_rows'):
                    raise ValueError(f'Export row count mismatch for {prefix}; review before publication')
                db.commit()
                manifest['sources'].append({'scope': scope, 'family': family, 'fiscalYear': year, 'records': count, 'searchCount': job['expectedCount'],
                                            'searchCountDifference': job['expectedCount'] - count, 'duplicates': duplicate,
                                            'sha256': source_hash, 'file': archive.name, 'requestedAt': job['requestedAt'],
                                            'quarantinedRecords':quarantined,'normalizedRecords':count-quarantined})
                save(out / 'manifest.partial.json', manifest)
                print(prefix, count, 'records;', duplicate, 'already collected', flush=True)
        totals = {}
        with (out / 'observations.jsonl').open('w') as handle:
            count = 0
            for payload, in db.execute('SELECT payload FROM transactions ORDER BY id'):
                handle.write(payload + '\n'); count += 1
                row = json.loads(payload); year = row['metadata']['fiscal_year']
                total = totals.setdefault(year, {'records': 0, 'amount_cents': 0})
                total['records'] += 1; total['amount_cents'] += row['amount_cents']
        os.chmod(out / 'observations.jsonl', 0o600); os.chmod(out / 'staging.sqlite', 0o600)
        manifest.update(records=count, totals=totals, sha256=hashlib.file_digest((out / 'observations.jsonl').open('rb'), 'sha256').hexdigest(),
                        completedAt=dt.datetime.now(dt.timezone.utc).isoformat())
        save(out / 'manifest.json', manifest); db.close()
        print(json.dumps(manifest), flush=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--years', nargs='+', type=int, default=[2025, 2026])
    parser.add_argument('--quarantine-invalid',action='store_true',help='Retain rejected source rows separately for review; never silently count them as imported')
    args = parser.parse_args()
    if any(year < 2008 or year > dt.datetime.now().year + 1 for year in args.years):
        parser.error('Unsupported federal fiscal year')
    collect(args.output, sorted(set(args.years)),args.quarantine_invalid)
