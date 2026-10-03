import asyncio, json, os
from pathlib import Path
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
html=ROOT.joinpath('index.html').read_text()
soup=BeautifulSoup(html,'html.parser')
for meta in soup.find_all('meta',attrs={'http-equiv':'Content-Security-Policy'}): meta.decompose()
for tag in soup.find_all('script'):
    tag.decompose()
# Inline CSS so the page exercises layout too.
css='\n'.join(ROOT.joinpath('css',name).read_text() for name in ['core.css','animations.css','themes.css'])
style=soup.new_tag('style'); style.string=css; soup.head.append(style)
page_html=str(soup)
analytics=ROOT.joinpath('js/analytics-core.js').read_text()
app=ROOT.joinpath('js/app.js').read_text().replace("document.addEventListener('DOMContentLoaded',()=>ONEIRO_APP.init());",'')

entries=[
  {'id':'1','dreamAt':'2026-10-03T06:00:00Z','mode':'Liminal','vividness':80,'intensity':70,'lucidity':20,'intention':'hotel ocean red door','text':'hotel ocean red door','symbols':['Door','Water'],'places':['Hotel','Ocean'],'emotions':['Curiosity'],'tags':['water']},
  {'id':'2','dreamAt':'2026-10-02T06:00:00Z','mode':'Liminal','vividness':70,'intensity':60,'lucidity':10,'intention':'endless stairs hotel','text':'endless stairs hotel','symbols':['Stairs'],'places':['Hotel'],'emotions':['Fear'],'tags':['recurrent']},
  {'id':'3','dreamAt':'2026-09-29T06:00:00Z','mode':'Lucid','vividness':90,'intensity':50,'lucidity':80,'intention':'fly over city','text':'fly city','symbols':['Flight'],'places':['City'],'emotions':['Joy'],'tags':['lucid']},
  {'id':'4','dreamAt':'2026-09-20T06:00:00Z','mode':'Dream','vividness':60,'intensity':40,'lucidity':0,'intention':'forest rain','text':'forest rain','symbols':['Rain'],'places':['Forest'],'emotions':['Calm'],'tags':['nature']},
  {'id':'5','dreamAt':'2026-08-01T06:00:00Z','mode':'Manual','vividness':50,'intensity':30,'lucidity':0,'intention':'','text':'Train station','symbols':['Train'],'places':['Station'],'emotions':['Neutral'],'tags':[]},
  {'id':'6','dreamAt':'2026-10-01T06:00:00Z','mode':'Dream','vividness':40,'intensity':75,'lucidity':55,'intention':'black lighthouse','text':'beach night','notes':'black lighthouse','symbols':['Beach'],'places':['Beach'],'emotions':['Unease'],'tags':[]}
]

async def main():
    errors=[]; consoles=[]
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True, executable_path=os.environ.get('BROWSER_EXECUTABLE') or (str(Path('/usr/bin/chromium')) if Path('/usr/bin/chromium').exists() else p.chromium.executable_path), args=['--no-sandbox'])
        page=await browser.new_page(viewport={'width':1440,'height':1100})
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: consoles.append((m.type,m.text)) if m.type=='error' else None)
        await page.set_content(page_html, wait_until='domcontentloaded')
        await page.add_script_tag(content=analytics)
        await page.add_script_tag(content=app)
        await page.evaluate("""(entries)=>{
          window.ONEIRO_ROUTER={current:'lab'};
          window.ONEIRO_JOURNAL_DB={list:async()=>entries,error:null};
          ONEIRO_APP.journalReady=true;
          const app=document.getElementById('app');
          app.innerHTML='';
          app.appendChild(document.getElementById('lab-view').content.cloneNode(true));
        }""", entries)
        await page.evaluate("ONEIRO_APP.bindLab()")
        await page.wait_for_timeout(100)
        initial=await page.evaluate("""()=>({
          recall:document.getElementById('lab-recall').textContent,
          lucid:document.getElementById('lab-lucid').textContent,
          association:document.getElementById('lab-association').textContent,
          sample:document.getElementById('lab-sample').textContent,
          dna:document.querySelectorAll('.dna-row').length,
          modes:document.querySelectorAll('.mode-row:not(.mode-head)').length,
          recurrences:document.querySelectorAll('.recurrence-item').length,
          trend:document.querySelectorAll('.trend-column').length,
          contentHidden:document.getElementById('lab-content').hidden,
          emptyHidden:document.getElementById('lab-empty').hidden
        })""")
        assert initial['recall']=='65%',initial
        assert initial['lucid']=='33%',initial
        assert initial['association']=='80%',initial
        assert initial['sample']=='6',initial
        assert initial['dna']>0 and initial['modes']>=4 and initial['trend']==8,initial
        assert initial['contentHidden'] is False and initial['emptyHidden'] is True,initial

        await page.select_option('#lab-window','30')
        await page.wait_for_timeout(50)
        filtered=await page.evaluate("""()=>({sample:document.getElementById('lab-sample').textContent, recall:document.getElementById('lab-recall').textContent})""")
        assert filtered['sample']=='5',filtered
        assert filtered['recall']=='68%',filtered
        await page.screenshot(path=str(ROOT/'lab-preview.png'), full_page=True)
        # Empty-state regression
        await page.evaluate("ONEIRO_JOURNAL_DB.list=async()=>[]; const app=document.getElementById('app'); app.innerHTML=''; app.appendChild(document.getElementById('lab-view').content.cloneNode(true));")
        await page.evaluate("ONEIRO_APP.bindLab()")
        await page.wait_for_timeout(50)
        empty_state=await page.evaluate("""()=>({emptyHidden:document.getElementById('lab-empty').hidden,contentHidden:document.getElementById('lab-content').hidden})""")
        assert empty_state=={'emptyHidden':False,'contentHidden':True},empty_state
        assert not errors,errors
        assert not consoles,consoles
        print('PASS lab-ui-smoke',json.dumps({'initial':initial,'filtered':filtered,'empty':empty_state},ensure_ascii=False))
        await browser.close()

asyncio.run(main())
