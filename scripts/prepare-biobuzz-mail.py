#!/usr/bin/env python3
"""Preserve Gmail MIME originals and prepare every captured inbox issue locally."""
import argparse
import hashlib
import json
import re
from datetime import datetime
from email.header import decode_header, make_header
from email.utils import parseaddr, parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path
from zoneinfo import ZoneInfo


class MailHtml(HTMLParser):
    def __init__(self):
        super().__init__(); self.text = []; self.links = []; self.skip = 0

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag in {'style', 'script'}: self.skip += 1
        if not self.skip:
            if tag in {'p', 'div', 'br', 'tr', 'h1', 'h2', 'h3', 'li'}: self.text.append('\n')
            if tag == 'a' and values.get('href'): self.links.append(values['href'])
            if tag == 'img' and values.get('alt'): self.text.append(values['alt'])

    def handle_endtag(self, tag):
        if tag in {'style', 'script'}: self.skip = max(0, self.skip - 1)

    def handle_data(self, text):
        if not self.skip: self.text.append(text)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def parts(part):
    yield part
    for child in part.get('parts') or []: yield from parts(child)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--captured', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    messages = [message for path in sorted(args.captured.glob('batch-*.json')) for message in json.loads(path.read_text())['responses']]
    if len({message['id'] for message in messages}) != len(messages): raise ValueError('Duplicate Gmail message IDs')
    report = []
    for message in messages:
        headers = {header['name'].lower(): header['value'] for header in message['payload']['headers']}
        subject = str(make_header(decode_header(headers.get('subject', '(no subject)'))))
        display, sender = parseaddr(headers.get('from', ''))
        if not (sender.lower().endswith('@biobuzz.io') or (display == 'BioBuzz Networks' and sender.lower() == 'hello-biobuzz.io@shared1.ccsend.com')): raise ValueError('Unexpected sender domain')
        when = parsedate_to_datetime(headers['date']).astimezone(ZoneInfo('America/New_York'))
        leaves = list(parts(message['payload']))
        plain = [part['body']['content'] for part in leaves if part.get('mime_type') == 'text/plain' and part.get('body', {}).get('content') is not None]
        html = [part['body']['content'] for part in leaves if part.get('mime_type') == 'text/html' and part.get('body', {}).get('content') is not None]
        parsed = MailHtml()
        for body in html: parsed.feed(body)
        body = '\n'.join(plain) if plain else ''.join(parsed.text)
        if not body.strip(): raise ValueError('Missing complete text body: ' + message['id'])
        archive_hash = hashlib.sha256(canonical(message).encode()).hexdigest()
        source = {
            'publisher': 'BioBuzz', 'senderEmail': sender.lower(), 'senderName': display,
            'subject': subject, 'publishedDate': when.date().isoformat(), 'sentAt': when.isoformat(),
            'gmailMessageId': message['id'], 'gmailThreadId': message['thread_id'],
            'captureMethod': 'Gmail full MIME read', 'sourceArchiveSha256': archive_hash,
            'bodyText': body, 'links': list(dict.fromkeys(parsed.links)),
            'attachmentMetadata': [{'filename': part.get('filename'), 'mimeType': part.get('mime_type'), 'attachmentId': part.get('body', {}).get('attachment_id')} for part in leaves if part.get('filename') or part.get('body', {}).get('attachment_id')],
        }
        section = 'Newsletter'; items = []
        # Paragraph extraction preserves the complete source text separately;
        # categories are documentary headings, never inferred monetary entries.
        for paragraph in re.split(r'\r?\n\s*\r?\n', body):
            clean = re.sub(r'https?://\S+', '', paragraph)
            clean = re.sub(r'[\u034f\u200b\u200c\u200d\ufeff]', '', clean)
            clean = re.sub(r'\s+', ' ', clean).strip(' ()\t\r\n')
            if not clean or len(clean) < 8 or re.match(r'^(Read [Mm]ore|Apply [Nn]ow|Register [Nn]ow|View in browser|Unsubscribe|Manage preferences|Explore all)', clean): continue
            if clean.upper() in {'FINANCIAL', 'PEOPLE + WORKFORCE', 'CLINICAL + COMMERCIAL', 'ECOSYSTEM BUZZ', 'ON THE CALENDAR', 'WHO\'S HIRING?!'}:
                section = clean; continue
            kind = {'FINANCIAL': 'financing-headline', 'PEOPLE + WORKFORCE': 'workforce', 'CLINICAL + COMMERCIAL': 'clinical-commercial', 'ECOSYSTEM BUZZ': 'ecosystem', "WHO'S HIRING?!": 'hiring'}.get(section.upper(), 'newsletter-content')
            items.append({'key': f'paragraph-{len(items)+1}', 'title': clean[:1000], 'kind': kind, 'section': section})
        if not items: items = [{'key': 'body', 'title': subject, 'kind': 'newsletter-content'}]
        document = {'schemaVersion': 1, 'source': source, 'items': items}
        # Avoid duplicating tracked link strings if the body already contains
        # every target. The untouched MIME tree retains all anchors and images.
        if len(canonical(document)) > 90000:
            source['linksInOriginalArchive'] = source.pop('links')
            # Keep every link in DB and IndexedDB; oversized issues require an
            # explicit schema expansion instead of a silent truncation.
            if len(canonical(document)) > 90000: raise ValueError('Issue exceeds sync size limit: ' + message['id'])
        output = args.output / (message['id'] + '.json')
        output.write_text(json.dumps({**document, 'sourceArchive': message}, ensure_ascii=False) + '\n'); output.chmod(0o600)
        report.append({'messageId': message['id'], 'date': source['publishedDate'], 'subject': subject, 'items': len(items), 'documentBytes': len(canonical(document).encode()), 'file': str(output)})
    summary = {'messages': len(report), 'items': sum(row['items'] for row in report), 'earliest': min(row['date'] for row in report), 'latest': max(row['date'] for row in report), 'issues': report}
    (args.output / 'manifest.json').write_text(json.dumps(summary, indent=2) + '\n')
    (args.output / 'manifest.json').chmod(0o600)
    print(json.dumps({key: value for key, value in summary.items() if key != 'issues'}))


if __name__ == '__main__': main()
