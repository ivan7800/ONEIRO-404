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
a11y=ROOT.joinpath('js/accessibility.js').read_text()
appjs=ROOT.joinpath('js/app.js').read_text().replace("document.addEventListener('DOMContentLoaded',()=>ONEIRO_APP.init());",'')

async def render_template(page, name):
    await page.evaluate("""(name)=>{const host=document.getElementById('app');host.innerHTML='';host.appendChild(document.getElementById(name).content.cloneNode(true));}""", name)
    await page.wait_for_timeout(20)

async def metrics(page):
    return await page.evaluate("""()=>({
      innerWidth:innerWidth,scrollWidth:document.documentElement.scrollWidth,
      nav:[...document.querySelectorAll('.nav button')].map(x=>Math.round(x.getBoundingClientRect().height)),
      navPosition:getComputedStyle(document.querySelector('.nav')).position,
      textInputFont:document.querySelector('input[type=text],input[type=search],textarea')?parseFloat(getComputedStyle(document.querySelector('input[type=text],input[type=search],textarea')).fontSize):null
    })""")

async def main():
    errors=[]; consoles=[]; results={}
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True, executable_path=os.environ.get('BROWSER_EXECUTABLE') or (str(Path('/usr/bin/chromium')) if Path('/usr/bin/chromium').exists() else p.chromium.executable_path), args=['--no-sandbox'])
        page=await browser.new_page(viewport={'width':320,'height':700})
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('console',lambda m:consoles.append(m.text) if m.type=='error' else None)
        await page.set_content(page_html,wait_until='domcontentloaded')
        await page.add_script_tag(content=a11y)
        await page.add_script_tag(content=appjs)
        await page.evaluate("""()=>{window.ONEIRO_ROUTER={current:'home',go(route){this.current=route;window.__route=route}};ONEIRO_ACCESSIBILITY.init();}""")
        for tpl in ('home-view','session-view','journal-view','lab-view','settings-view'):
            await render_template(page,tpl)
            m=await metrics(page); results[tpl]=m
            assert m['scrollWidth']<=m['innerWidth']+1,(tpl,m)
            assert min(m['nav'])>=44,(tpl,m)
        assert results['session-view']['textInputFont']>=16,results['session-view']
        await render_template(page,'session-view')
        assert await page.evaluate("getComputedStyle(document.getElementById('session-live')).display")=='none'
        assert await page.evaluate("getComputedStyle(document.getElementById('session-recall')).display")=='none'
        assert results['home-view']['navPosition']=='fixed',results['home-view']
        # Large-text preference must not create horizontal overflow at 320 px.
        await page.evaluate("document.documentElement.classList.add('large-text-root')")
        for tpl in ('home-view','session-view','settings-view'):
            await render_template(page,tpl)
            large=await metrics(page)
            assert large['scrollWidth']<=large['innerWidth']+1,(f'large-{tpl}',large)
        await page.evaluate("document.documentElement.classList.remove('large-text-root')")

        # Keyboard route shortcuts.
        await page.keyboard.press('Alt+3')
        assert await page.evaluate('window.__route')=='journal'
        await render_template(page,'journal-view'); await page.evaluate("ONEIRO_ROUTER.current='journal'")
        await page.keyboard.press('/')
        assert await page.evaluate("document.activeElement?.id")=='journal-search'
        # Editor focus enters the form and returns to the launching control.
        await page.focus('#new-dream')
        await page.evaluate('ONEIRO_APP.openJournalEditor()')
        await page.wait_for_timeout(30)
        assert await page.evaluate("document.activeElement?.id")=='journal-title'
        await page.evaluate('ONEIRO_APP.closeJournalEditor()')
        await page.wait_for_timeout(30)
        assert await page.evaluate("document.activeElement?.id")=='new-dream'

        # Landscape small-height regression.
        await page.set_viewport_size({'width':844,'height':390})
        await render_template(page,'session-view')
        lm=await metrics(page);results['landscape']=lm
        assert lm['scrollWidth']<=lm['innerWidth']+1,lm
        assert not errors,errors
        assert not consoles,consoles
        await page.screenshot(path=str(ROOT/'responsive-preview.png'),full_page=True)
        print('PASS responsive-ui-smoke',json.dumps(results,ensure_ascii=False))
        await browser.close()

asyncio.run(main())
