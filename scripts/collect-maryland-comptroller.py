#!/usr/bin/env python3
"""Collect public Comptroller relationship observations, without production writes.

MD-VIEW is queried by every advertised agency. A failed/limited query prevents a
complete manifest; it never replaces a prior successful normalized file.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, date, timedelta
from decimal import Decimal
import hashlib
import io
import json
from pathlib import Path
import re
import sqlite3
import zipfile
import requests
from bs4 import BeautifulSoup
from lxml import html

BPW = 'https://interactive.marylandcomptroller.gov/BPWDashboard/Search'
MDVIEW = 'https://interactive2.marylandtaxes.gov/MDVIEW/Home/PaymentSearch'
FEDERAL = 'https://dashboards.marylandtaxes.gov/com-dashboards/downloads/csv-top-federal-agencies-by-spending-and-jobs.zip'


def cents(value):
    text = value.strip().replace('$', '').replace(',', '')
    if re.fullmatch(r'\(\d+(?:\.\d{1,2})?\)', text):
        text = '-' + text[1:-1]
    if not re.fullmatch(r'-?\d+(?:\.\d{1,2})?', text):
        raise ValueError(f'Unrecognized amount: {value!r}')
    return int(Decimal(text) * 100)


def digest(value):
    return hashlib.sha256(value).hexdigest()


def parse_bpw(raw):
    document = html.fromstring(raw)
    tables = document.xpath('//table[@id="bpwTable"]')
    table = tables[0] if tables else None
    if table is None:
        raise ValueError('BPW result table missing')
    records = []
    for tr in table.xpath('.//tbody/tr'):
        td = tr.xpath('./td')
        if len(td) != 13:
            raise ValueError('BPW column count changed')
        values = [' '.join(c.text_content().split()) for c in td]
        date = re.match(r'\d{4}-\d{2}-\d{2}', values[1])
        links = td[1].xpath('.//a[@href]')
        link = links[0] if links else None
        if not date or link is None or not link.get('href').startswith('https://bpw.maryland.gov/'):
            raise ValueError('BPW agenda provenance missing')
        date = date[0]
        # A meeting/item can include multiple recipients or sub-items. Full row
        # hash retains every distinct source observation, without invented splits.
        identity = digest(json.dumps(values, ensure_ascii=False).encode())
        records.append(dict(id='md-bpw:' + identity, dataset='bpw', external_id=f'{date}:{values[2]}:{identity[:16]}',
                            agency_label=td[0].get('title') or values[0], recipient_label=values[7],
                            occurred_at=date, amount_cents=cents(values[6]), fact_type='reported_award',
                            description=values[5], source_url=link.get('href'),
                            metadata=dict(zip(['agency_code','agenda','agenda_item','category','type','description','amount_label','recipient','certification','goals','contract','method','fund_source'], values))))
    if not records:
        raise ValueError('Empty BPW result; review source before replacing snapshot')
    if len({r['id'] for r in records}) != len(records):
        raise ValueError('Duplicate BPW rows require source reconciliation')
    return records


def parse_payments(raw, agency):
    document = html.fromstring(raw)
    tables = document.xpath('//table[@id="searchResultsTable"]')
    table = tables[0] if tables else None
    text = ' '.join(document.text_content().split())
    if re.search(r'(first|maximum|limit(?:ed)? to)\s+[\d,]+\s+(?:records|results|payments)', text, re.I):
        raise ValueError('MD-VIEW result limit requires date partitioning')
    if table is None:
        if re.search(r'no (?:payments|records|results).*found', text, re.I):
            return []
        raise ValueError(f'MD-VIEW results missing for {agency}')
    records = []
    for tr in table.xpath('.//tbody/tr'):
        values = [' '.join(c.text_content().split()) for c in tr.xpath('./td')]
        if len(values) != 5:
            raise ValueError('MD-VIEW column count changed')
        date = datetime.strptime(values[3], '%Y/%m/%d').date().isoformat()
        # Payment numbers alone are not unique across agency/payee/date.
        key = json.dumps([agency, values[1], values[2], date], ensure_ascii=False)
        records.append(dict(id='md-view:' + digest(key.encode()), dataset='mdview', external_id=values[2],
                            agency_label=values[0], recipient_label=values[1], occurred_at=date,
                            amount_cents=cents(values[4]), fact_type='disbursement', description='Public MD-VIEW payment total',
                            source_url=MDVIEW, metadata={'agency_code': agency, 'payment_number': values[2], 'amount_label': values[4]}))
    if len({r['id'] for r in records}) != len(records):
        raise ValueError('Duplicate payment identities require review')
    return records


def fetch_payments(code, output, start=None, end=None):
    suffix = f'-{start}-{end}' if start else ''
    path = output / f'mdview-{code}{suffix}.html'
    if path.exists():
        raw = path.read_bytes()
    else:
        session = requests.Session()
        response = session.get(MDVIEW, timeout=90)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, 'html.parser')
        data = {i['name']: i.get('value','') for i in soup.select('input[name]')}
        data.update(search='search', selectedAgency=code)
        if start:
            data.update(PaymentDateEarliest=start, PaymentDateLatest=end)
        response = session.post(MDVIEW, data=data, timeout=180)
        response.raise_for_status()
        raw = response.content
        parse_payments(raw, code)
        path.write_bytes(raw)
    records = parse_payments(raw, code)
    source = {'agency_code':code, 'count':len(records), 'sha256':digest(raw), 'artifact':path.name,
              'period_start':start, 'period_end':end}
    for row in records:
        row['source_sha256'] = source['sha256']
    # FAQ documents a 5,000-result cap, although some current searches return
    # more. Partition at that threshold regardless of the actual HTML length.
    if len(records) >= 5000:
        earliest = date.fromisoformat(min(r['occurred_at'] for r in records))
        latest = date.fromisoformat(max(r['occurred_at'] for r in records))
        if earliest == latest:
            raise ValueError('5000+ payments on a single day require another partition key')
        middle = earliest + (latest - earliest) // 2
        left, left_sources = fetch_payments(code, output, start or '1900-01-01', middle.isoformat())
        right, right_sources = fetch_payments(code, output, (middle+timedelta(days=1)).isoformat(), end or '2200-12-31')
        combined = {r['id']:r for r in left + right}
        if len(combined) != len(left) + len(right):
            raise ValueError('Overlapping date partitions')
        baseline = {r['id']:(r['amount_cents'],r['metadata']) for r in records}
        if any(key not in combined or baseline[key] != (combined[key]['amount_cents'],combined[key]['metadata']) for key in baseline):
            raise ValueError('MD-VIEW changed or date partitions dropped baseline payments')
        return list(combined.values()), [source, *left_sources, *right_sources]
    if start and any(not start <= r['occurred_at'] <= end for r in records):
        raise ValueError('MD-VIEW ignored the requested date range')
    return records, [source]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'artifacts/maryland-comptroller')
    parser.add_argument('--bpw-only', action='store_true')
    args = parser.parse_args()
    out = args.output
    out.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).isoformat()
    bpw = out / 'bpw-search.html'
    if not bpw.exists():
        response = requests.get(BPW, timeout=180)
        response.raise_for_status()
        bpw.write_bytes(response.content)
    raw = bpw.read_bytes()
    records = parse_bpw(raw)
    bpw_sha256 = digest(raw)
    for row in records:
        row['source_sha256'] = bpw_sha256
    coverage = [{'dataset':'bpw','count':len(records),'sha256':digest(raw),'artifact':bpw.name,'source_url':BPW}]
    failures = []
    if not args.bpw_only:
        response = requests.get(MDVIEW, timeout=90)
        response.raise_for_status()
        soup = BeautifulSoup(response.content,'html.parser')
        agencies = {o['value']:o.get_text(' ',strip=True) for o in soup.select('select[name=selectedAgency] option[value]') if o['value']}
        if not agencies:
            raise ValueError('No MD-VIEW agencies advertised')
        (out/'mdview-agencies.json').write_text(json.dumps(agencies,indent=2)+'\n')
        with ThreadPoolExecutor(max_workers=3) as pool:
            futures = {pool.submit(fetch_payments,c,out):c for c in agencies}
            for future in as_completed(futures):
                code=futures[future]
                try:
                    rows,source=future.result()
                    records.extend(rows)
                    coverage.extend({'dataset':'mdview', **item, 'source_url':MDVIEW} for item in source)
                    print(f'MD-VIEW {code}: {len(rows)}', flush=True)
                except Exception as error:
                    failures.append({'agency_code':code,'error':str(error)})
                    print(f'MD-VIEW {code}: FAILED {error}',flush=True)
        response=requests.get(FEDERAL,timeout=90)
        response.raise_for_status()
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            files=[{'name':i.filename,'bytes':i.file_size} for i in archive.infolist()]
        (out/'federal-averages.zip').write_bytes(response.content)
        coverage.append({'dataset':'federal_averages','sha256':digest(response.content),'artifact':'federal-averages.zip','source_url':FEDERAL,'files':files,'ledger_eligible':False,'reason':'2020-2024 annual averages by agency/geography; overlapping aggregates, not individual transactions'})
    records.sort(key=lambda r:r['id'])
    if len({r['id'] for r in records}) != len(records):
        raise ValueError('Cross-query duplicate identities require reconciliation')
    summary={'retrieved_at':now,'production_applied':False,'coverage':coverage,'failures':failures,
             'coverage_claim':'All rows returned by BPW and successful agency-wide MD-VIEW searches; no independent MD-VIEW total is published, so historical completeness is unverified.',
             'source_limitations':['Confidential payments are excluded by Maryland.','BPW is approval evidence, including amendments and multi-recipient awards; amounts must not be added to MD-VIEW payments.','MD-VIEW payment totals are not invoice allocations; payment-detail pages have not been collected.', 'MD-VIEW FAQ documents a 5000-result cap and 13-month history; actual results include older dates. Queries at or above 5000 rows are date-partitioned.','No name-only organization identity merges.','Federal averages remain separate from the transaction ledger.'],
             'record_count':len(records),'bpw_only':args.bpw_only}
    # Staging only: source snapshots and normalized rows never mutate production.
    tmp=out/'observations.jsonl.tmp'
    with tmp.open('w') as stream:
        for record in records:
            stream.write(json.dumps({**record,'retrieved_at':now},ensure_ascii=False)+'\n')
    tmp.replace(out/'observations.jsonl')
    (out/'manifest.json').write_text(json.dumps(summary,indent=2)+'\n')
    database=out/'staging.sqlite.tmp'
    database.unlink(missing_ok=True)
    with sqlite3.connect(database) as db:
        db.execute('CREATE TABLE observations(id TEXT PRIMARY KEY,dataset TEXT,external_id TEXT,agency_label TEXT,recipient_label TEXT,occurred_at TEXT,amount_cents INTEGER,fact_type TEXT,description TEXT,source_url TEXT,metadata_json TEXT,retrieved_at TEXT)')
        db.executemany('INSERT INTO observations VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[(r['id'],r['dataset'],r['external_id'],r['agency_label'],r['recipient_label'],r['occurred_at'],r['amount_cents'],r['fact_type'],r['description'],r['source_url'],json.dumps(r['metadata']),now) for r in records])
    database.replace(out/'staging.sqlite')
    print(json.dumps({'records':len(records),'failed_agencies':len(failures),'production_applied':False}))
    if failures:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
