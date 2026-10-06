#!/usr/bin/env python3
"""Import newsletter JSON with local preview receipts; never contacts production."""
import argparse
import json
import ssl
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('files', type=Path, nargs='+')
    parser.add_argument('--deployment', type=Path, default=ROOT / '.local/bmoremedtech-newsletter-storage.json')
    parser.add_argument('--base-url', default='https://localhost:8443/api/org/api/local/newsletters')
    parser.add_argument('--receipt', type=Path, required=True)
    args = parser.parse_args()
    origin = urlparse(args.base_url)
    if origin.scheme != 'https' or origin.hostname not in {'localhost', '127.0.0.1'} or origin.username or origin.password:
        raise ValueError('Only the local HTTPS deployment is allowed')
    capability = json.loads(args.deployment.read_text())
    context = ssl.create_default_context(cafile=str(ROOT / '.local/certs/localhost.crt'))

    def call(path, body=None):
        request = Request(args.base_url.rstrip('/') + path, data=json.dumps(body).encode() if body is not None else None,
                          headers={'Authorization': 'Bearer ' + capability['token'], 'Content-Type': 'application/json'})
        with urlopen(request, context=context, timeout=30) as response:
            return json.load(response)

    status = call('/status')
    if status['datasetId'] != capability['datasetId']:
        raise ValueError('Local dataset differs from the selected deployment')
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    with args.receipt.open('a') as log:
        args.receipt.chmod(0o600)
        for file in args.files:
            supplied = json.loads(file.read_text())
            document = {key: supplied[key] for key in ['schemaVersion', 'source', 'items']}
            archive = supplied.get('sourceArchive')
            request_body = {'document': document, **({'sourceArchive': archive} if archive else {})}
            preview = call('/import', request_body)
            if preview.get('alreadyImported'):
                result = preview
            else:
                if preview['document'] != document or preview['items'] != len(document['items']) or preview['publication'] != 'local-only':
                    raise ValueError('Preview differs from the reviewed newsletter')
                log.write(json.dumps({'file': str(file), 'datasetId': status['datasetId'], 'previewId': preview['previewId'], 'status': 'previewed'}) + '\n')
                log.flush()
                result = call('/import', {**request_body, 'confirm': True, 'previewId': preview['previewId']})
            log.write(json.dumps({'file': str(file), 'datasetId': status['datasetId'], 'status': 'committed', 'result': result}) + '\n')
            log.flush()
            print(json.dumps(result))


if __name__ == '__main__':
    main()
