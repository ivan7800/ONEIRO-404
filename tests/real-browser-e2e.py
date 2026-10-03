"""Serve the unmodified production page under a Pages-style prefix. No engine stubs."""
import asyncio, json, os, threading, tempfile
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from playwright.async_api import async_playwright
ROOT=Path(os.environ.get('ONEIRO_ROOT',Path(__file__).resolve().parents[1])).resolve()
class Handler(SimpleHTTPRequestHandler):
 def translate_path(self,path):
  from urllib.parse import urlsplit,unquote
  relative=unquote(urlsplit(path).path).removeprefix('/ONEIRO-404/')
  target=(ROOT/relative).resolve()
  return str(target if target.is_relative_to(ROOT) else ROOT/'not-found')
 def log_message(self,*args): pass
async def main():
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
 url=f'http://127.0.0.1:{server.server_port}/ONEIRO-404/'
 checks=[];errors=[];consoles=[];bad_responses=[];metrics=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,executable_path=os.environ.get('BROWSER_EXECUTABLE') or p.chromium.executable_path,args=['--no-sandbox']+json.loads(os.environ.get('BROWSER_ARGS','[]')))
  context=await browser.new_context(viewport={'width':1440,'height':900},accept_downloads=True)
  page=await context.new_page()
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('console',lambda m:consoles.append(m.text) if m.type=='error' else None)
  page.on('response',lambda r:bad_responses.append([r.status,r.url]) if r.status>=400 else None)
  page.on('dialog',lambda d:d.accept())
  async def wait_js(expression,arg=None,timeout=10000):
   deadline=asyncio.get_running_loop().time()+timeout/1000
   while asyncio.get_running_loop().time()<deadline:
    if await page.evaluate(expression,arg):return
    await asyncio.sleep(.025)
   raise AssertionError('JavaScript condition timed out: '+expression)
  async def route(name):
   await page.locator(f'[data-route={name}]').first.click()
   await wait_js('(r)=>ONEIRO_ROUTER.current===r',arg=name)
   if name=='journal':await wait_js("document.querySelector('#journal-summary strong')!==null")
   if name=='lab':await wait_js("document.querySelector('#lab-empty')?.hidden===false||document.querySelector('#lab-sample')?.textContent!=='0'")
  async def count():return await page.evaluate('ONEIRO_JOURNAL_DB.list().then(x=>x.length)')
  await page.goto(url);await page.wait_for_selector('#home-stats .stat')
  assert await page.evaluate('ONEIRO_APP.journalReady')
  await wait_js('!!ONEIRO_APP.swRegistration',timeout=10000)
  await page.evaluate('navigator.serviceWorker.ready');await wait_js('!!navigator.serviceWorker.controller')
  checks.append('production boot, local scripts, CSP, IndexedDB and real Service Worker')
  # Responsive views with real renderers, not cloned templates.
  for width in [320,375,768,1024,1440]:
   await page.set_viewport_size({'width':width,'height':900})
   for name in ['home','session','journal','lab','settings']:
    await route(name)
    size=await page.evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})')
    assert size['scroll']<=size['width']+1,(width,name,size)
    if width<=560:
     nav=await page.locator('.nav').bounding_box();assert abs(nav['y']+nav['height']-900)<2,(width,name,nav)
    metrics.append({'width':width,'view':name,'scrollWidth':size['scroll']})
  checks.append('25 live view/viewport combinations without horizontal overflow')
  await page.set_viewport_size({'width':1440,'height':900})
  await route('session')
  assert not await page.locator('#session-live').is_visible()
  await page.locator('#session-form button[type=submit]').click();assert 'intención' in await page.locator('#session-status').inner_text()
  await page.fill('#intention','hotel puerta 🌙')
  await page.click('#save-session-config');assert await page.evaluate("ONEIRO_STORAGE.get('lastSession').intention")=='hotel puerta 🌙'
  await page.click('#preview-audio');await wait_js("ONEIRO_AUDIO_ENGINE.getState().status==='preview'")
  await page.click('#stop-audio-preview');assert await page.evaluate("ONEIRO_AUDIO_ENGINE.getState().status")!='preview'
  checks.append('empty session validation, configuration save, real Web Audio preview/silence')
  for mode in ['Dream','Nightmare','Liminal','Adventure','Memory','Custom']:
   await page.select_option('#mode',mode);await page.locator('#session-form button[type=submit]').click()
   await wait_js('(m)=>ONEIRO_SESSION_ENGINE.getSnapshot()?.mode===m',arg=mode)
   await page.click('#end-session');assert await page.evaluate('ONEIRO_SESSION_ENGINE.getSnapshot()') is None
  checks.append('six protocols start and terminate independently')
  await page.select_option('#mode','Lucid');await page.locator('#session-form button[type=submit]').click();await page.wait_for_selector('#session-live',state='visible')
  await page.click('#pause-session');await page.click('#skip-phase')
  assert await page.evaluate("ONEIRO_SESSION_ENGINE.getSnapshot().status")=='paused'
  assert await page.evaluate("ONEIRO_SESSION_ENGINE.getRemainingMs()===ONEIRO_SESSION_ENGINE.getSnapshot().plan.DESCENT*1000")
  await page.reload();await page.wait_for_selector('#pause-session');assert 'REANUDAR' in await page.locator('#pause-session').inner_text()
  await page.click('#pause-session');await page.click('#audio-session-toggle');await page.click('#audio-session-toggle')
  for _ in range(3):await page.click('#skip-phase')
  await page.wait_for_selector('#session-recall',state='visible')
  await page.fill('#recall-title','Hotel de la luna');await page.fill('#recall-text','Puerta roja en un hotel 🌙')
  await page.locator('#recall-form details summary').click()
  await page.fill('#recall-symbols','puerta, luna');await page.fill('#recall-places','hotel')
  await page.locator('#recall-form button[type=submit]').click();await wait_js('ONEIRO_JOURNAL_DB.list().then(x=>x.length===1)')
  checks.append('Lucid pause/skip, reload, resume, audio toggle, timed phases and recall in IndexedDB')
  await route('journal');await page.locator('[data-entry-id]').first.click()
  await page.click('#delete-journal-entry');await wait_js('ONEIRO_JOURNAL_DB.list().then(x=>x.length===0)')
  await page.reload();await wait_js('ONEIRO_APP.journalReady');assert await count()==0
  checks.append('delete session dream remains deleted after reload and legacy migration')
  await page.click('#new-dream');await page.locator('#journal-form button[type=submit]').click()
  assert 'fragmento' in await page.locator('#journal-form-status').inner_text()
  payload='<img src=x onerror="window.__xss=1"><script>window.__xss=2</script> 🌙'
  await page.fill('#journal-title','Prueba de hotel');await page.fill('#journal-text',payload);await page.fill('#journal-symbols','puerta, agua')
  await page.locator('#journal-form button[type=submit]').click();await wait_js('ONEIRO_JOURNAL_DB.list().then(x=>x.length===1)')
  assert not await page.evaluate('window.__xss||false');assert await page.locator('#journal-list img,#journal-list script').count()==0
  await page.fill('#journal-text','Texto editado 🌙');await page.locator('#journal-form button[type=submit]').click();await wait_js("ONEIRO_JOURNAL_DB.list().then(x=>x[0]?.text==='Texto editado 🌙')")
  await page.fill('#journal-search','ausente');assert await page.locator('#journal-empty').is_visible();await page.click('#clear-journal-filters')
  await page.select_option('#journal-mode-filter','Lucid');assert await page.locator('#journal-empty').is_visible();await page.click('#clear-journal-filters')
  await page.select_option('#journal-sort','oldest');await page.click('#close-journal-editor')
  checks.append('journal empty validation, create/edit, XSS text, search/filter/sort/clear and editor close')
  # Double submit is an adversarial probe: no duplicate entry may be created.
  await page.click('#new-dream');await page.fill('#journal-text','Doble envío')
  await page.evaluate("()=>{const f=document.querySelector('#journal-form');f.requestSubmit();f.requestSubmit()}")
  await page.wait_for_timeout(200);assert await count()==2,('duplicate submission',await count())
  checks.append('double journal submission creates one entry')
  await route('lab');assert await page.locator('#lab-sample').inner_text()=='2'
  await page.select_option('#map-category','Símbolos');await page.locator('.map-node').first.click();assert await page.locator('#map-inspector').inner_text()
  await page.click('#map-reset');await page.select_option('#lab-window','all')
  checks.append('real Lab statistics, time window, map node, category and reset')
  await route('settings')
  for theme in ['void','oneiric','liminal','soma','terminal','nocturne','dreamcore']:
   await page.select_option('#theme-select',theme);assert await page.evaluate("ONEIRO_STORAGE.get('prefs').theme")==theme
  for control in ['reduced-motion','high-contrast','large-text','privacy-hide-previews']:
   await page.check('#'+control)
  await page.select_option('#privacy-auto-lock','1');await page.uncheck('#privacy-blur-hidden')
  await page.set_viewport_size({'width':320,'height':900})
  for name in ['home','session','journal','lab','settings']:
   await route(name);assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  await page.set_viewport_size({'width':1440,'height':900})
  await page.fill('#privacy-new-pin','1234');await page.fill('#privacy-confirm-pin','9999');await page.click('#privacy-save-pin');assert 'coinciden' in await page.locator('#privacy-settings-status').inner_text()
  await page.fill('#privacy-confirm-pin','1234');await page.click('#privacy-save-pin');await wait_js("ONEIRO_PRIVACY.prefs().lockEnabled")
  await page.click('#privacy-lock-now');await page.fill('#privacy-unlock-pin','0000');await page.locator('#privacy-unlock-form button').click();await wait_js("document.getElementById('privacy-unlock-status').textContent.includes('incorrecto')")
  await page.fill('#privacy-unlock-pin','1234');await page.locator('#privacy-unlock-form button').click();await page.wait_for_selector('#privacy-lock',state='hidden')
  checks.append('seven skins, privacy/visual preferences, 320px large text, PIN mismatch, lock and wrong/right unlock')
  with tempfile.TemporaryDirectory() as temp:
   async with page.expect_download() as info:await page.click('#backup-export-json')
   download=await info.value;plain=Path(temp)/'plain.json';await download.save_as(plain)
   data=json.loads(plain.read_text());assert len(data['payload']['dreams'])==2;assert not data['payload']['storage']['privacy']['lockEnabled']
   await page.fill('#backup-passphrase','password123')
   async with page.expect_download() as info:await page.click('#backup-export-encrypted')
   download=await info.value;encrypted=Path(temp)/'backup.oneiro';await download.save_as(encrypted)
   assert json.loads(encrypted.read_text())['cipher']=='AES-256-GCM';assert await page.input_value('#backup-passphrase')==''
   await page.select_option('#backup-restore-mode','replace');await page.set_input_files('#backup-file',plain)
   await wait_js("document.getElementById('backup-status')?.textContent.includes('Restauración completada')")
   await page.wait_for_timeout(1100);await page.wait_for_selector('#privacy-lock',state='visible')
   await page.fill('#privacy-unlock-pin','1234');await page.locator('#privacy-unlock-form button').click();await page.wait_for_selector('#privacy-lock',state='hidden');assert await count()==2
   await page.select_option('#backup-restore-mode','merge');await page.fill('#backup-passphrase','password123');await page.set_input_files('#backup-file',encrypted)
   await wait_js("document.getElementById('backup-status')?.textContent.includes('Restauración completada')")
   await page.wait_for_timeout(1100);await page.wait_for_selector('#privacy-lock',state='visible');await page.fill('#privacy-unlock-pin','1234');await page.locator('#privacy-unlock-form button').click();await page.wait_for_selector('#privacy-lock',state='hidden')
   assert await count()==2
   checks.append('actual JSON/encrypted downloads and UI replace/merge restore with real Crypto and PIN retained')
  await page.fill('#privacy-current-pin','1234');await page.click('#privacy-disable-pin');await wait_js('!ONEIRO_PRIVACY.prefs().lockEnabled')
  await page.click('#storage-persist');await wait_js("document.getElementById('pwa-status').textContent.includes('persistencia')||document.getElementById('pwa-status').textContent.includes('concedido')")
  checks.append('disable PIN, request storage persistence with actual browser decision')
  # Keyboard and offline test exercise the real router and cached scripts.
  await page.keyboard.press('Alt+3');await page.wait_for_selector('#journal-summary strong');await page.keyboard.press('/');assert await page.evaluate('document.activeElement.id')=='journal-search'
  await page.focus('#new-dream');await page.keyboard.press('Enter');await wait_js("document.activeElement.id==='journal-title'");await page.keyboard.press('Escape');await wait_js("document.activeElement.id==='new-dream'")
  checks.append('keyboard routes, search shortcut, editor focus and Escape return')
  await context.set_offline(True);await page.reload();await page.wait_for_selector('#journal-search');assert await count()==2
  for name in ['home','session','journal','lab','settings']:await route(name)
  checks.append('offline reload, IndexedDB preserved and five routes via real cache')
  await context.set_offline(False)
  await page.click('#reset-local');await wait_js("document.getElementById('settings-status').textContent.includes('borrados')");assert await count()==0
  await page.reload();await wait_js('ONEIRO_APP.journalReady');assert await count()==0
  checks.append('confirmed reset clears local data and remains empty after reload')
  assert not errors,errors
  assert not consoles,consoles
  assert not bad_responses,bad_responses
  if os.environ.get('QA_OUTPUT'):
   output=Path(os.environ['QA_OUTPUT']);output.mkdir(parents=True,exist_ok=True)
   await route('home');await page.wait_for_timeout(600);await page.locator('.brand').focus();await page.screenshot(path=str(output/'oneiro-desktop.png'),full_page=True)
   (output/'real-browser-results.json').write_text(json.dumps({'browser':browser.version,'checks':checks,'responsive':metrics,'errors':errors,'consoleErrors':consoles,'badResponses':bad_responses},ensure_ascii=False,indent=2))
  print('PASS real-browser-e2e',json.dumps({'browser':browser.version,'checks':checks,'responsiveCombinations':len(metrics),'errors':len(errors)},ensure_ascii=False))
  await browser.close()
 server.shutdown()
asyncio.run(main())
