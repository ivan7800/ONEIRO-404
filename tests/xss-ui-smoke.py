import os
import asyncio
from pathlib import Path
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
soup=BeautifulSoup(ROOT.joinpath('index.html').read_text(),'html.parser')
for tag in soup.find_all('script'): tag.decompose()
for meta in soup.find_all('meta',attrs={'http-equiv':'Content-Security-Policy'}): meta.decompose()
page_html=str(soup)
app=ROOT.joinpath('js/app.js').read_text().replace("document.addEventListener('DOMContentLoaded',()=>ONEIRO_APP.init());",'')
async def main():
  errors=[]
  async with async_playwright() as p:
    b=await p.chromium.launch(headless=True,executable_path=os.environ.get('BROWSER_EXECUTABLE') or (str(Path('/usr/bin/chromium')) if Path('/usr/bin/chromium').exists() else p.chromium.executable_path),args=['--no-sandbox'])
    page=await b.new_page()
    page.on('pageerror',lambda e:errors.append(str(e)))
    await page.set_content(page_html)
    await page.add_script_tag(content="window.ONEIRO_PRIVACY={applyVisualPrefs(){}};window.ONEIRO_STORAGE={get(){return{}},set(){}};")
    await page.add_script_tag(content=app)
    payload='\"><img src=x onerror="window.__xss=1"><script>window.__xss=2</script>'
    result=await page.evaluate("""(payload)=>{
      window.__xss=0;
      const html=ONEIRO_APP.journalCard({id:payload,title:payload,text:payload,dreamAt:new Date().toISOString(),mode:payload,vividness:50,intensity:50,lucidity:50,symbols:[payload],places:[],emotions:[],tags:[]});
      const host=document.createElement('div');host.innerHTML=html;document.body.appendChild(host);
      return {xss:window.__xss,imgs:host.querySelectorAll('img').length,scripts:host.querySelectorAll('script').length,text:host.textContent.includes('<img')};
    }""",payload)
    await page.wait_for_timeout(50)
    assert result['xss']==0,result
    assert result['imgs']==0 and result['scripts']==0,result
    assert result['text'],result
    assert not errors,errors
    print('PASS xss-ui-smoke',result)
    await b.close()
asyncio.run(main())
