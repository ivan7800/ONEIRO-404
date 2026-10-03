"""Production browser integration with explicit injected storage failures."""
import asyncio, importlib.util, json, os, threading
from pathlib import Path
from http.server import ThreadingHTTPServer
from playwright.async_api import async_playwright
spec=importlib.util.spec_from_file_location('real_e2e',Path(__file__).with_name('real-browser-e2e.py'))
# Load only the server definitions; the other test's main function runs separately.
source=Path(__file__).with_name('real-browser-e2e.py').read_text().replace('asyncio.run(main())','')
namespace={'__file__':str(Path(__file__).with_name('real-browser-e2e.py'))};exec(compile(source,'real-browser-e2e.py','exec'),namespace)
async def main():
 server=ThreadingHTTPServer(('127.0.0.1',0),namespace['Handler']);threading.Thread(target=server.serve_forever,daemon=True).start()
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,executable_path=os.environ.get('BROWSER_EXECUTABLE') or p.chromium.executable_path,args=['--no-sandbox'])
  page=await browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
  await page.goto(f'http://127.0.0.1:{server.server_port}/ONEIRO-404/#settings');await page.wait_for_selector('#theme-select')
  async def wait(expression):
   for _ in range(400):
    if await page.evaluate(expression):return
    await asyncio.sleep(.025)
   raise AssertionError(expression)
  fresh=await page.evaluate('ONEIRO_BACKUP.create(ONEIRO_STORAGE,ONEIRO_JOURNAL_DB).then(x=>ONEIRO_BACKUP.validate(x))');assert fresh['valid']
  await page.evaluate("()=>{window.__set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='oneiro:privacy')throw new DOMException('test quota','QuotaExceededError');return __set.call(this,k,v)}}")
  await page.fill('#privacy-new-pin','1234');await page.fill('#privacy-confirm-pin','1234');await page.click('#privacy-save-pin')
  await wait("document.querySelector('#privacy-settings-status').textContent.includes('No se pudo guardar')")
  assert not await page.evaluate('ONEIRO_PRIVACY.prefs().lockEnabled');await page.evaluate('()=>{Storage.prototype.setItem=window.__set}')
  await page.click('#privacy-save-pin');await wait('ONEIRO_PRIVACY.prefs().lockEnabled')
  await page.evaluate("ONEIRO_JOURNAL_DB.put({id:'safe',text:'Conservar datos'})")
  await page.evaluate("()=>{window.__clear=ONEIRO_JOURNAL_DB.clear;ONEIRO_JOURNAL_DB.clear=async()=>{throw new Error('fallo de prueba')}}")
  await page.click('#reset-local');await wait("document.querySelector('#settings-status').textContent.includes('no pudo borrarse')")
  assert await page.evaluate('ONEIRO_PRIVACY.prefs().lockEnabled');assert await page.evaluate('ONEIRO_JOURNAL_DB.list().then(x=>x.length)')==1
  await page.evaluate('()=>{ONEIRO_JOURNAL_DB.clear=window.__clear}')
  result=await page.evaluate("""async()=>{
   const before=await ONEIRO_BACKUP.create(ONEIRO_STORAGE,ONEIRO_JOURNAL_DB,{includeSecrets:true});
   const incoming=structuredClone(before);incoming.payload.dreams=[{id:'new',text:'Importado'}];incoming.payload.storage.prefs={theme:'soma'};
   const {checksum,...base}=incoming;incoming.checksum='sha256:'+await ONEIRO_BACKUP.sha256(base);
   const put=ONEIRO_JOURNAL_DB.put.bind(ONEIRO_JOURNAL_DB);let fail=true;
   ONEIRO_JOURNAL_DB.put=async(...args)=>{if(args[0].id==='new'&&fail){fail=false;throw new Error('write failure')}return put(...args)};
   let message='';try{await ONEIRO_BACKUP.restore(incoming,ONEIRO_STORAGE,ONEIRO_JOURNAL_DB,{mode:'replace'})}catch(e){message=e.message}finally{ONEIRO_JOURNAL_DB.put=put}
   const after=await ONEIRO_BACKUP.create(ONEIRO_STORAGE,ONEIRO_JOURNAL_DB,{includeSecrets:true});
   return {message,equal:JSON.stringify(before.payload)===JSON.stringify(after.payload)};
  }""")
  assert result['message']=='write failure';assert result['equal'],result
  await page.evaluate('ONEIRO_APP.journalReady=false');await page.click('#reset-local');await wait("document.querySelector('#settings-status').textContent.includes('borrados')")
  assert await page.evaluate('ONEIRO_JOURNAL_DB.list().then(x=>x.length)')==0
  assert not errors,errors
  print('PASS storage-browser-faults: fresh empty backup, PIN quota rejected, reset DB failure retains data/PIN, replace rollback in real IndexedDB, reset with stale readiness flag; errors=0')
  await browser.close()
 server.shutdown()
asyncio.run(main())
