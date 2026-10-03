from pathlib import Path
from bs4 import BeautifulSoup
import re

ROOT=Path(__file__).resolve().parents[1]
soup=BeautifulSoup(ROOT.joinpath('index.html').read_text(),'html.parser')
ids=[x.get('id') for x in soup.find_all(attrs={'id':True})]
assert len(ids)==len(set(ids)), 'duplicate HTML ids'
assert soup.select_one('a.skip-link[href="#app"]'), 'missing skip link'
main=soup.select_one('main#app')
assert main and main.get('tabindex')=='-1', 'main focus target missing'
lock=soup.select_one('#privacy-lock')
assert lock and lock.get('role')=='dialog' and lock.get('aria-modal')=='true', 'privacy lock is not modal dialog'
assert soup.select_one('#a11y-announcer[aria-live="polite"]'), 'missing live announcer'
assert soup.select_one('#live-timer[role="timer"]'), 'timer semantics missing'
assert soup.select_one('#dream-map[role="region"]'), 'interactive dream map must be region, not img'

# Every visible form control that needs a name must have an ancestor label, explicit label, or aria label.
controls=[]
for el in soup.select('input, select, textarea'):
    if el.get('type') in ('hidden','file'): continue
    if el.has_attr('hidden'): continue
    cid=el.get('id')
    named=bool(el.get('aria-label') or el.get('aria-labelledby') or el.find_parent('label'))
    if cid and soup.select_one(f'label[for="{cid}"]'): named=True
    if not named: controls.append(cid or str(el)[:80])
assert not controls, f'unnamed controls: {controls}'

buttons=[]
for el in soup.select('button'):
    visible=BeautifulSoup(el.decode_contents(),'html.parser').get_text(' ',strip=True)
    name=(el.get('aria-label') or visible).strip()
    if not name: buttons.append(el.get('id') or str(el)[:80])
assert not buttons, f'unnamed buttons: {buttons}'

css='\n'.join(ROOT.joinpath('css',n).read_text() for n in ('core.css','animations.css','themes.css'))
for token in (':focus-visible','min-height:44px','safe-area-inset-bottom','prefers-reduced-motion','forced-colors','large-text-root','high-contrast'):
    assert token in css, f'missing CSS accessibility feature: {token}'
js=ROOT.joinpath('js/accessibility.js').read_text()
for token in ('Alt','prefers-reduced-motion','prefers-contrast','trapFocus','journal-search'):
    assert token.lower() in js.lower(), f'missing accessibility JS feature: {token}'
print('PASS accessibility-static', {'ids':len(ids),'controls_named':True,'buttons_named':True})
