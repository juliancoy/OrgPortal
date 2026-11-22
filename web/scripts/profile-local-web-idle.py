"""Sample the local Vite process after browser profiling has stopped."""
import json, os, pathlib, subprocess, time

rows = subprocess.check_output(['docker', 'top', 'lifetech-community-web', '-eo', 'pid,args'], text=True).splitlines()
pid = next(row.split()[0] for row in rows if '.bin/vite ' in row)
def sample():
    fields = pathlib.Path('/proc/' + pid + '/stat').read_text().split()
    return {'ticks': int(fields[13])+int(fields[14]), 'rssBytes': int(fields[23])*os.sysconf('SC_PAGE_SIZE')}

before = sample()
started = time.monotonic()
time.sleep(5)
after = sample()
elapsed = time.monotonic()-started
result = {'pid': pid, 'sampleSeconds': elapsed, 'cpuPercent': 100*(after['ticks']-before['ticks'])/os.sysconf('SC_CLK_TCK')/elapsed, 'rssBytes': after['rssBytes']}
out = pathlib.Path(__file__).resolve().parents[2]/'artifacts/performance/organization-map'
out.mkdir(parents=True, exist_ok=True)
(out/'idle-after.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result))
