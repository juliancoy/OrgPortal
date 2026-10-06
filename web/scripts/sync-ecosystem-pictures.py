#!/usr/bin/env python3
"""Fill missing connected-organization pictures from published website metadata.
No credentials, image guessing, or database writes. Sources remain flat fields.
"""
import concurrent.futures,json,urllib.request,urllib.parse
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]/'public/ecosystem-data'
FILES=['ecosystem-portal.json','ecosystem-history.json','ecosystem-research.json']
class Metadata(HTMLParser):
 def __init__(self):super().__init__();self.images={}
 def handle_starttag(self,tag,attributes):
  attrs=dict(attributes)
  if tag=='meta' and (attrs.get('property') or attrs.get('name','')).lower() in ['og:image','twitter:image','twitter:image:src']:
   self.images[(attrs.get('property') or attrs.get('name')).lower()]=attrs.get('content','')
def published_picture(url):
 try:
  request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; EcosystemSourcePreview/1.0)'})
  with urllib.request.urlopen(request,timeout=8) as response:
   if 'html' not in response.headers.get('Content-Type',''):return None
   parser=Metadata();parser.feed(response.read(1_000_000).decode('utf-8',errors='replace'))
   image=parser.images.get('og:image') or parser.images.get('twitter:image') or parser.images.get('twitter:image:src')
   if not image:return None
   resolved=urllib.parse.urljoin(response.url,image)
   if urllib.parse.urlparse(resolved).scheme not in ['http','https']:return None
   return resolved,response.url
 except Exception:return None
originals={name:(ROOT/name).read_text() for name in FILES}
data={name:json.loads(text) for name,text in originals.items()}
connected=set()
for collection in data.values():
 for edge in collection.get('relationships',[]):
  connected.update([edge.get('source'),edge.get('target')])
urls={org.get('website') for collection in data.values() for org in collection['organizations'] if org['id'] in connected and not org.get('imageUrl') and org.get('website','').startswith(('http://','https://'))}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
 results=dict(zip(sorted(urls),executor.map(published_picture,sorted(urls))))
count=0
for name,collection in data.items():
 for org in collection['organizations']:
  result=results.get(org.get('website'))
  if not org.get('imageUrl') and result:
   org['imageUrl'],org['imageSourceUrl']=result;org['imageCaption']='Published website preview image';count+=1
 indent=2 if '\n  "' in originals[name] else None
 text=json.dumps(collection,indent=indent,ensure_ascii='\\u' in originals[name],separators=(',',':') if indent is None else None)+'\n'
 (ROOT/name).write_text(text)
print(json.dumps({'websites_checked':len(urls),'websites_with_published_pictures':sum(bool(v) for v in results.values()),'organization_records_enriched':count}))
