"""Drive Wrangler's local scheduled event; Cloudflare deployments use native cron."""
import os, random, time, urllib.request
url = os.environ['REPLICA_TRIGGER']
interval = int(os.environ.get('REPLICA_INTERVAL', '300'))
if not 60 <= interval <= 86400:
    raise ValueError('Replica interval must be 60..86400 seconds')
failures = 0
while True:
    try:
        with urllib.request.urlopen(url, timeout=60) as response:
            if response.status != 200:
                raise RuntimeError('Scheduled trigger HTTP ' + str(response.status))
        failures = 0
        print('Scheduled organization replica refresh', flush=True)
    except Exception as error:
        failures += 1
        print('Replica refresh failed: ' + str(error), flush=True)
    time.sleep(min(interval * 2 ** min(failures, 4), 3600) * random.uniform(1, 1.1))
