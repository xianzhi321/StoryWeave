from pathlib import Path
import os
import shutil
from playwright.sync_api import sync_playwright
import zipfile, io

base=Path(__file__).resolve().parent/'web'
html=(base/'index.html').read_text()
html=html.replace('<link rel="stylesheet" href="styles.css"/>','<style>'+(base/'styles.css').read_text()+'</style>')
for script in ('app.js','v05.js'):
    html=html.replace(f'<script src="{script}" defer></script>', '<script>'+(base/script).read_text().replace('</script>',r'<\/script>')+'</script>')
with sync_playwright() as pw:
    browser=pw.chromium.launch(**({'executable_path':os.environ.get('CHROMIUM_BIN') or shutil.which('chromium') or shutil.which('google-chrome')} if (os.environ.get('CHROMIUM_BIN') or shutil.which('chromium') or shutil.which('google-chrome')) else {}),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,device_scale_factor=1)
    page=context.new_page();errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    html=html.replace('</head>','<script>Object.defineProperty(window,"localStorage",{configurable:true,value:{getItem(k){return this[k]||null},setItem(k,v){this[k]=v},removeItem(k){delete this[k]}}});</script></head>')
    page.set_content(html)
    page.wait_for_selector('[data-tab="skills"]')
    page.locator('[data-tab="skills"]').click()
    trigger=page.locator('[data-action="import-book"]')
    assert '导入参考书籍' in trigger.inner_text()
    with page.expect_file_chooser() as chooser:
        trigger.click()
    chooser.value.set_files({'name':'短篇测试.txt','mimeType':'text/plain','buffer':('这是中文小说片段。人物在雨中交谈。'*10).encode('utf8')})
    page.wait_for_function('state.documents.length===1')
    assert page.evaluate('state.documents[0].title')=='短篇测试'
    assert page.locator('#modalRoot .modal').count()==0,'After safe import, distill remains manual'
    page.locator('[data-action="distill"]').wait_for(timeout=6000)
    assert page.locator('[data-action="distill"]').count()==1
    page.reload(wait_until='domcontentloaded') if False else None
    # Wrong format is rejected without crashing.
    with page.expect_file_chooser() as chooser:
        trigger.click()
    chooser.value.set_files({'name':'bad.json','mimeType':'application/json','buffer':b'{"abc":true}'})
    page.wait_for_timeout(100)
    assert page.evaluate('state.documents.length')==1
    assert '仅支持' in page.locator('#toastRoot').inner_text()
    # Corrupt EPUB should generate a meaningful toast, no page exception.
    with page.expect_file_chooser() as chooser:
        trigger.click()
    chooser.value.set_files({'name':'bad.epub','mimeType':'application/epub+zip','buffer':b'Not an EPUB archive, fail safely'})
    page.wait_for_timeout(200)
    assert page.evaluate('state.documents.length')==1
    assert 'EPUB' in page.locator('#toastRoot').inner_text()
    # A minimal uncompressed XHTML EPUB works on WebViews without DecompressionStream.
    stream=io.BytesIO()
    with zipfile.ZipFile(stream,'w',zipfile.ZIP_STORED) as z:
        z.writestr('OEBPS/chapter.xhtml','<html><body><p>'+('中文小说片段，江边有人走过。'*12)+'</p></body></html>')
    with page.expect_file_chooser() as chooser:
        trigger.click()
    chooser.value.set_files({'name':'参考故事.epub','mimeType':'application/epub+zip','buffer':stream.getvalue()})
    page.wait_for_function('state.documents.length===2')
    page.wait_for_function('document.querySelectorAll("[data-action=distill]").length===2')
    assert page.locator('[data-action="distill"]').count()==2
    # Simulate storage exhaustion, make sure the new reference is rolled back.
    page.evaluate('(()=>{localStorage.setItem=(k,v)=>{throw new Error("Storage quota exhausted")};return null})()')
    with page.expect_file_chooser() as chooser:
        trigger.click()
    chooser.value.set_files({'name':'cannot-save.txt','mimeType':'text/plain','buffer':('故事中的人物仍在谈话。'*15).encode('utf8')})
    page.wait_for_function('!importingReference')
    assert page.evaluate('state.documents.length')==2, 'An unsaved import must not appear in state'
    assert 'Storage quota exhausted' in page.locator('#toastRoot').inner_text()
    page.locator('[data-action="distill"]').last.click()
    assert '文学技能蒸馏' in page.locator('#modalRoot').inner_text()
    assert not errors,errors
    print('PASS v0.5.1 mobile import: file-picker opened, TXT imported, unsupported rejected, invalid EPUB guarded, EPUB parsed, manual distill, no JS errors')
    context.close();browser.close()
