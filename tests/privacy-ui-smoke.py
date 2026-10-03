import asyncio, json, os
from pathlib import Path
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
soup=BeautifulSoup(ROOT.joinpath('index.html').read_text(),'html.parser')
for meta in soup.find_all('meta',attrs={'http-equiv':'Content-Security-Policy'}): meta.decompose()
for tag in soup.find_all('script'): tag.decompose()
css='\n'.join(ROOT.joinpath('css',name).read_text() for name in ['core.css','animations.css','themes.css'])
style=soup.new_tag('style'); style.string=css; soup.head.append(style)
page_html=str(soup)
storage="""(()=>{const m=new Map();window.ONEIRO_STORAGE={get:(k,f=null)=>m.has(k)?structuredClone(m.get(k)):f,set:(k,v)=>(m.set(k,structuredClone(v)),true),remove:k=>m.delete(k),clear:()=>m.clear()};})();"""
privacy=ROOT.joinpath('js/privacy.js').read_text()
app=ROOT.joinpath('js/app.js').read_text().replace("document.addEventListener('DOMContentLoaded',()=>ONEIRO_APP.init());",'')

async def main():
    errors=[]; consoles=[]
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True, executable_path=os.environ.get('BROWSER_EXECUTABLE') or (str(Path('/usr/bin/chromium')) if Path('/usr/bin/chromium').exists() else p.chromium.executable_path), args=['--no-sandbox'])
        page=await browser.new_page(viewport={'width':1440,'height':1100})
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: consoles.append((m.type,m.text)) if m.type=='error' else None)
        await page.set_content(page_html, wait_until='domcontentloaded')
        await page.add_script_tag(content=storage)
        await page.add_script_tag(content=privacy)
        await page.add_script_tag(content=app)
        await page.evaluate("""()=>{
          window.ONEIRO_ROUTER={current:'settings'};
          window.ONEIRO_JOURNAL_DB={getStatus:()=>({ready:true,name:'oneiro404',version:1}),clear:async()=>true};
          window.ONEIRO_SESSION_ENGINE={end:()=>true};window.ONEIRO_AUDIO_ENGINE={reset:()=>true};
          ONEIRO_APP.journalReady=true;
          const host=document.getElementById('app');host.innerHTML='';host.appendChild(document.getElementById('settings-view').content.cloneNode(true));
          ONEIRO_PRIVACY.init();ONEIRO_APP.bindSettings();
        }""")
        assert await page.locator('#theme-select option').count()==7
        await page.select_option('#theme-select','dreamcore')
        await page.wait_for_timeout(30)
        assert await page.get_attribute('body','data-theme')=='dreamcore'
        await page.check('#privacy-hide-previews')
        assert await page.evaluate("document.body.classList.contains('privacy-hide-previews')")
        await page.check('#high-contrast')
        assert await page.evaluate("document.body.classList.contains('high-contrast')")
        await page.check('#large-text')
        assert await page.evaluate("document.documentElement.classList.contains('large-text-root')")
        crypto_ok=await page.evaluate("ONEIRO_PRIVACY.supported()")
        if crypto_ok:
            await page.fill('#privacy-new-pin','4047');await page.fill('#privacy-confirm-pin','4047');await page.click('#privacy-save-pin')
            await page.wait_for_timeout(100)
            state=await page.text_content('#privacy-lock-state');assert 'PIN activo' in state
            await page.click('#privacy-lock-now');assert not await page.locator('#privacy-lock').is_hidden()
            await page.fill('#privacy-unlock-pin','4047');await page.click('#privacy-unlock-form button[type=submit]');await page.wait_for_timeout(100)
            assert await page.locator('#privacy-lock').is_hidden()
            await page.fill('#privacy-current-pin','4047');await page.click('#privacy-disable-pin');await page.wait_for_timeout(100)
            assert 'Sin bloqueo' in await page.text_content('#privacy-lock-state')
        await page.screenshot(path=str(ROOT/'privacy-preview.png'), full_page=True)
        assert not errors,errors
        assert not consoles,consoles
        print('PASS privacy-ui-smoke',json.dumps({'crypto':crypto_ok,'theme':'dreamcore','hiddenPreviews':True,'highContrast':True,'largeText':True},ensure_ascii=False))
        await browser.close()

asyncio.run(main())
