import asyncio, json, os
from pathlib import Path
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
soup=BeautifulSoup(ROOT.joinpath('index.html').read_text(),'html.parser')
for tag in soup.find_all('script'): tag.decompose()
for meta in soup.find_all('meta',attrs={'http-equiv':'Content-Security-Policy'}): meta.decompose()
css='\n'.join(ROOT.joinpath('css',name).read_text() for name in ['core.css','animations.css','themes.css'])
style=soup.new_tag('style'); style.string=css; soup.head.append(style)
page_html=str(soup)

journal_core=ROOT.joinpath('js/journal-core.js').read_text()
analytics=ROOT.joinpath('js/analytics-core.js').read_text()
session_engine=ROOT.joinpath('js/session-engine.js').read_text()
router=ROOT.joinpath('js/router.js').read_text()
app=ROOT.joinpath('js/app.js').read_text().replace("document.addEventListener('DOMContentLoaded',()=>ONEIRO_APP.init());",'')
a11y=ROOT.joinpath('js/accessibility.js').read_text()

STUBS=r'''
class MemStorage{
  constructor(){this.m=new Map()}
  get(k,f=null){return this.m.has(k)?structuredClone(this.m.get(k)):f}
  set(k,v){this.m.set(k,structuredClone(v));return true}
  remove(k){this.m.delete(k);return true}
  clear(){this.m.clear()}
}
window.ONEIRO_STORAGE=new MemStorage();
window.ONEIRO_AUDIO_ENGINE={
  prefs:{enabled:true,master:34,layers:{rain:100,wind:100,pink:100,brown:100,drone:100}},state:{status:'idle',message:'Audio preparado'},listeners:new Set(),
  getPrefs(){return structuredClone(this.prefs)},getState(){return {...this.state,prefs:this.getPrefs()}},
  updatePrefs(p){this.prefs={...this.prefs,...p,layers:{...this.prefs.layers,...(p.layers||{})}};this.emit();return this.getPrefs()},
  subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn)},emit(){const s=this.getState();this.listeners.forEach(f=>f(s))},
  async preview(){this.state={status:'preview',message:'Preescucha activa'};this.emit()},stopPreview(){this.state={status:'idle',message:'Preescucha detenida'};this.emit()},
  async unlock(){this.state={status:'playing',message:'Audio activo'};this.emit();return true},async reactivate(){return this.unlock()},syncSession(){},reset(){this.state={status:'idle',message:'Audio reiniciado'};this.emit()},init(){},bindSessionEngine(){}
};
window.ONEIRO_PRIVACY={
  unlocked:true,p:{lockEnabled:false,autoLockMinutes:5,hidePreviews:false,blurWhenHidden:true},
  prefs(){return structuredClone(this.p)},save(x){Object.assign(this.p,x);return this.p},supported(){return true},applyVisualPrefs(){},hideLock(){},
  async verifyPin(pin){return !this.p.lockEnabled||pin==='1234'},async setPin(pin){if(!/^\d{4,12}$/.test(pin))throw Error('PIN inválido');this.p.lockEnabled=true;this.p.pinHash='x';this.p.pinSalt='y';return this.p},
  async disablePin(pin){if(!(await this.verifyPin(pin)))throw Error('PIN actual incorrecto.');this.p.lockEnabled=false;return true},lock(){return !!this.p.lockEnabled}
};
window.ONEIRO_PRIVACY_CRYPTO={async encryptJSON(x,p){if(p.length<8)throw Error('short');return {format:'ONEIRO404-ENCRYPTED',version:1,payload:'x'}},async decryptJSON(x,p){return x.__snapshot||x}};
window.__dreams=[];
window.ONEIRO_JOURNAL_DB={
  ready:true,error:null,async init(){return this},getStatus(){return {ready:true,name:'oneiro404',version:1}},async migrateSessionHistory(){return {imported:0,skipped:0,total:0}},
  async list(){return structuredClone(window.__dreams)},async get(id){return structuredClone(window.__dreams.find(x=>x.id===id)||null)},
  async put(v){const n=ONEIRO_JOURNAL_CORE.normalizeEntry(v);const i=window.__dreams.findIndex(x=>x.id===n.id);if(i>=0)window.__dreams[i]=n;else window.__dreams.push(n);return structuredClone(n)},
  async remove(id){window.__dreams=window.__dreams.filter(x=>x.id!==id);return true},async clear(){window.__dreams=[];return true},
  async addFromSession(s,d={}){const n=ONEIRO_JOURNAL_CORE.fromSession(s,d);if(n.text) return this.put(n);return null}
};
window.ONEIRO_BACKUP={
  async create(storage,db,{includeSecrets=false}={}){return {format:'ONEIRO404-BACKUP',version:1,appVersion:'1.0.0',exportedAt:new Date().toISOString(),containsLockCredential:includeSecrets,payload:{storage:{},dreams:await db.list()},checksum:'sha256:test'}},
  async validate(x){return {valid:true,dreams:x.payload?.dreams?.length||0}},summary(x){return {dreams:x.payload?.dreams?.length||0,exportedAt:x.exportedAt,appVersion:x.appVersion,containsLockCredential:!!x.containsLockCredential}},
  async restore(x,s,db){return {ok:true,imported:x.payload?.dreams?.length||0,skipped:0}}
};
Object.defineProperty(navigator,'storage',{configurable:true,value:{persist:async()=>true,persisted:async()=>true,estimate:async()=>({usage:1024,quota:1024*1024})}});
'''

async def main():
    errors=[]; consoles=[]; checks=[]
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True,executable_path=os.environ.get('BROWSER_EXECUTABLE') or (str(Path('/usr/bin/chromium')) if Path('/usr/bin/chromium').exists() else p.chromium.executable_path),args=['--no-sandbox'])
        page=await browser.new_page(viewport={'width':1100,'height':900},accept_downloads=True)
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('console',lambda m:consoles.append(m.text) if m.type=='error' else None)
        page.on('dialog',lambda d:asyncio.create_task(d.accept()))
        await page.set_content(page_html,wait_until='domcontentloaded')
        await page.add_script_tag(content=STUBS)
        await page.add_script_tag(content=journal_core)
        await page.add_script_tag(content=analytics)
        await page.add_script_tag(content=session_engine)
        await page.evaluate("ONEIRO_SESSION_ENGINE.autoTick=false")
        await page.add_script_tag(content=a11y)
        await page.add_script_tag(content=router)
        await page.add_script_tag(content=app)
        await page.evaluate("""()=>{
          ONEIRO_APP.journalReady=true;ONEIRO_APP.journalMigration={imported:0};
          ONEIRO_APP.downloadBlob=(name,text)=>{window.__downloads=(window.__downloads||[]).concat(name)};
          ONEIRO_ACCESSIBILITY.init();ONEIRO_ROUTER.init();
        }""")

        # Global navigation routes.
        for route in ['session','journal','lab','settings','home']:
            selector=f'[data-route="{route}"]'
            await page.locator(selector).first.click(); await page.wait_for_timeout(10)
            assert await page.evaluate('ONEIRO_ROUTER.current')==route
        checks.append('routes')

        # Session builder controls.
        await page.evaluate("ONEIRO_ROUTER.go('session')")
        await page.fill('#intention','hotel vacío bajo la lluvia')
        await page.click('#preview-audio'); assert await page.evaluate("ONEIRO_AUDIO_ENGINE.getState().status")=='preview'
        await page.click('#stop-audio-preview'); assert await page.evaluate("ONEIRO_AUDIO_ENGINE.getState().status")=='idle'
        await page.click('#save-session-config'); assert 'guardadas' in (await page.locator('#session-status').inner_text()).lower()
        await page.locator('#session-form button[type=submit]').click(); await page.wait_for_timeout(10)
        assert await page.evaluate("ONEIRO_SESSION_ENGINE.getSnapshot().phase")=='PRIME'
        await page.click('#pause-session'); assert await page.evaluate("ONEIRO_SESSION_ENGINE.getSnapshot().status")=='paused'
        await page.click('#skip-phase')
        paused=await page.evaluate("ONEIRO_SESSION_ENGINE.getSnapshot()")
        assert paused['phase']=='DESCENT' and paused['status']=='paused' and paused['pausedRemainingMs']==paused['plan']['DESCENT']*1000
        await page.click('#pause-session'); assert await page.evaluate("ONEIRO_SESSION_ENGINE.getSnapshot().status")=='running'
        await page.click('#audio-session-toggle'); await page.click('#audio-session-toggle')
        await page.click('#skip-phase'); await page.click('#skip-phase'); await page.click('#skip-phase')
        assert await page.evaluate("ONEIRO_SESSION_ENGINE.getSnapshot().phase")=='RECALL'
        await page.fill('#recall-text','pasillo, agua y una puerta roja')
        await page.locator('#recall-form button[type=submit]').click(); await page.wait_for_timeout(10)
        assert len(await page.evaluate('window.__dreams'))==1
        checks.append('session-controls')

        # Start another and discard recall.
        await page.fill('#intention','bosque')
        await page.locator('#session-form button[type=submit]').click()
        for _ in range(4): await page.click('#skip-phase')
        await page.click('#discard-recall'); assert await page.evaluate('ONEIRO_SESSION_ENGINE.getSnapshot()') is None
        checks.append('discard-recall')

        # Journal controls: create/edit/search/filter/delete.
        await page.evaluate("ONEIRO_ROUTER.go('journal')"); await page.wait_for_timeout(20)
        await page.click('#new-dream'); await page.fill('#journal-title','Sueño manual'); await page.fill('#journal-text','escaleras y hotel')
        await page.locator('#journal-form button[type=submit]').click(); await page.wait_for_timeout(20)
        assert len(await page.evaluate('window.__dreams'))==2, {'dreams':await page.evaluate('window.__dreams'),'errors':errors,'status':await page.locator('#journal-form-status').inner_text()}
        await page.fill('#journal-search','no-existe'); assert not await page.locator('#journal-empty').get_attribute('hidden')
        await page.click('#clear-journal-filters'); await page.click('#close-journal-editor')
        # Open first visible card and delete it.
        await page.locator('[data-entry-id]').first.click(); await page.click('#delete-journal-entry'); await page.wait_for_timeout(20)
        assert len(await page.evaluate('window.__dreams'))==1
        checks.append('journal-controls')

        # Lab/map reset.
        await page.evaluate("ONEIRO_ROUTER.go('lab')"); await page.wait_for_timeout(20)
        if await page.locator('#map-reset').count(): await page.click('#map-reset')
        checks.append('lab-controls')

        # Settings controls.
        await page.evaluate("ONEIRO_ROUTER.go('settings')"); await page.wait_for_timeout(20)
        await page.select_option('#theme-select','dreamcore')
        await page.check('#reduced-motion'); await page.check('#high-contrast'); await page.check('#large-text')
        await page.select_option('#privacy-auto-lock','1'); await page.check('#privacy-hide-previews')
        await page.fill('#privacy-new-pin','1234'); await page.fill('#privacy-confirm-pin','1234'); await page.click('#privacy-save-pin')
        assert 'activo' in (await page.locator('#privacy-lock-state').inner_text()).lower()
        await page.click('#privacy-lock-now')
        # Fake privacy lock does not render overlay; return to settings state and disable.
        await page.fill('#privacy-current-pin','1234'); await page.click('#privacy-disable-pin')
        await page.click('#backup-export-json')
        await page.fill('#backup-passphrase','12345678'); await page.click('#backup-export-encrypted')
        assert await page.input_value('#backup-passphrase')==''
        downloads=await page.evaluate('window.__downloads||[]'); assert len(downloads)==2
        await page.evaluate("""()=>{const f=document.getElementById('backup-file');window.__fileClicks=0;f.click=()=>window.__fileClicks++;}""")
        await page.click('#backup-import'); assert await page.evaluate('window.__fileClicks')==1
        await page.evaluate("""()=>{ONEIRO_APP.pwaInstallPrompt={prompt:async()=>{},userChoice:Promise.resolve({outcome:'accepted'})};ONEIRO_APP.refreshPwaInstallButton()}""")
        await page.click('#pwa-install'); assert 'aceptada' in (await page.locator('#pwa-status').inner_text()).lower()
        await page.click('#storage-persist'); assert 'persistente' in (await page.locator('#pwa-status').inner_text()).lower()
        await page.click('#reset-local'); await page.wait_for_timeout(20)
        assert 'borrados' in (await page.locator('#settings-status').inner_text()).lower()
        checks.append('settings-controls')

        assert not errors,errors
        assert not consoles,consoles
        print('PASS controls-ui-smoke',json.dumps({'checks':checks,'downloads':downloads,'errors':len(errors)},ensure_ascii=False))
        await browser.close()

asyncio.run(main())
