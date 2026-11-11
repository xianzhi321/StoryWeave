from pathlib import Path
from playwright.sync_api import sync_playwright
import json
BASE=Path(__file__).resolve().parent/'web'
def inline_html():
    html=(BASE/'index.html').read_text()
    html=html.replace('<link rel="stylesheet" href="styles.css"/>','<style>'+(BASE/'styles.css').read_text()+'</style>')
    for name in ('app.js','v05.js','v06.js','v07.js'):
        html=html.replace(f'<script src="{name}" defer></script>', '<script>'+(BASE/name).read_text().replace('</script>',r'<\/script>')+'</script>')
    init="""<script>Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem(){return null},setItem(){},removeItem(){}}});</script>"""
    return html.replace('</head>',init+'</head>')
root=Path(__file__).resolve().parent
with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True)
  page=context.new_page()
  page.set_content(inline_html())
  page.wait_for_selector('[data-tab="write"]')
  page.locator('[data-tab="write"]').click()
  page.wait_for_selector('.sw7-editor-utilities')
  page.screenshot(path=str(root/'v07-writer-preview.png'),full_page=True)
  page.locator('[data-action="sw7-reference"]').click()
  page.wait_for_selector('.sw7-reference-drawer')
  page.screenshot(path=str(root/'v07-characters-preview.png'),full_page=False)
  page.locator('#sw7DrawerClose').click()
  page.locator('[data-action="sw7-find"]').click()
  page.locator('#sw7Find').fill('钟楼')
  page.screenshot(path=str(root/'v07-find-preview.png'),full_page=False)
  browser.close()
  print('PASS preview renders: writer, character drawer, chapter search')
