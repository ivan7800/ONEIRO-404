from pathlib import Path
from bs4 import BeautifulSoup
import re
ROOT=Path(__file__).resolve().parents[1]
html=ROOT.joinpath('index.html').read_text()
soup=BeautifulSoup(html,'html.parser')
# Production page must keep scripts external and local.
for s in soup.find_all('script'):
    assert s.get('src'), 'inline production script found'
    assert s['src'].startswith('./'), s['src']
for tag,attr in [('script','src'),('link','href')]:
    for el in soup.find_all(tag):
        v=el.get(attr)
        if not v: continue
        assert not re.match(r'^(?:https?:)?//',v), f'external resource: {v}'
meta=soup.find('meta',attrs={'http-equiv':'Content-Security-Policy'})
assert meta and "default-src 'self'" in meta.get('content','')
assert "object-src 'none'" in meta.get('content','')
assert "base-uri 'self'" in meta.get('content','')
assert soup.find('meta',attrs={'name':'referrer','content':'no-referrer'})
assert soup.find('link',attrs={'rel':lambda x:x and 'apple-touch-icon' in x})
print('PASS security-static')
