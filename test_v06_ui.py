from pathlib import Path
from playwright.sync_api import sync_playwright
import zipfile, io
base=Path(__file__).resolve().parent/'web'
html=(base/'index.html').read_text()
html=html.replace('<link rel="stylesheet" href="styles.css"/>','<style>'+(base/'styles.css').read_text()+'</style>')
for script in ('app.js','v05.js','v06.js'):
    html=html.replace(f'<script src="{script}" defer></script>', '<script>'+(base/script).read_text().replace('</script>',r'<\/script>')+'</script>')
html=html.replace('</head>','<script>Object.defineProperty(window,"localStorage",{configurable:true,value:{getItem(k){return this[k]||null},setItem(k,v){this[k]=v},removeItem(k){delete this[k]}}});</script></head>')
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,device_scale_factor=1)
 page=context.new_page();errs=[]
 page.on('pageerror',lambda e:errs.append(str(e)))
 page.set_content(html)
 page.wait_for_selector('[data-action="import-manuscript"]')
 starting=page.evaluate('state.projects.length')
 input_selector='[data-action="import-manuscript"]'
 text='序章\n他原本没有想要离开。\n第一章 失踪的信\n'+('雨下了很久，河水涨过桥墩。'*12)+'\n第二章 · 夜谈\n'+('书店的灯还亮着，只有两人在说话。'*12)
 with page.expect_file_chooser() as chooser:
    page.locator(input_selector).click()
 chooser.value.set_files({'name':'我自己的小说.txt','mimeType':'text/plain','buffer':text.encode('utf-8')})
 page.wait_for_selector('#sw6Commit')
 assert page.evaluate('state.projects.length')==starting,'Preview must not mutate works'
 assert '3 章' in page.locator('#modalRoot').inner_text()
 page.locator('[name="manuscriptTitle"]').fill('新作品·测试')
 page.locator('#sw6Commit').click()
 page.wait_for_function('(starting)=>state.projects.length===starting+1',arg=starting)
 assert page.evaluate('project().title')=='新作品·测试'
 assert page.evaluate('project().chapters.length')==3
 assert '雨下了很久' in page.evaluate('project().chapters[1].text')
 # Cancel import leaves the book list unchanged.
 page.locator('[data-tab="home"]').click()
 with page.expect_file_chooser() as chooser:
    page.locator(input_selector).click()
 chooser.value.set_files({'name':'cancel.md','mimeType':'text/markdown','buffer':('# 第一章 测试\n'+('人物不会移动。'*20)).encode()})
 page.wait_for_selector('#sw6Cancel')
 page.locator('#sw6Cancel').click()
 assert page.evaluate('state.projects.length')==starting+1
 # Another file with invalid binary bytes should fail without changing state.
 with page.expect_file_chooser() as chooser:
    page.locator(input_selector).click()
 chooser.value.set_files({'name':'bad.txt','mimeType':'text/plain','buffer':b'\x00\x00\xff\x80\x01\x02\x00'*30})
 page.wait_for_function('window.StoryWeaveManuscript.getLastError().length>0')
 assert page.evaluate('state.projects.length')==starting+1
 # A normally compressed EPUB should display the same preview, not crash.
 compressed=io.BytesIO()
 with zipfile.ZipFile(compressed,'w',zipfile.ZIP_DEFLATED) as z:
    z.writestr('OEBPS/ch1.xhtml','<html><body><h1>第一章 情节</h1><p>'+('一个人物正在展开调查。'*18)+'</p></body></html>')
 with page.expect_file_chooser() as chooser:
    page.locator(input_selector).click()
 chooser.value.set_files({'name':'压缩小说.epub','mimeType':'application/epub+zip','buffer':compressed.getvalue()})
 page.wait_for_selector('#sw6Commit')
 assert '第一章 情节' in page.locator('#modalRoot').inner_text(), 'EPUB headings must survive extraction'
 page.screenshot(path=str(base.parent/'v06-import-preview.png'),full_page=True)
 page.locator('#sw6Cancel').click()
 page.screenshot(path=str(base.parent/'v06-home-preview.png'),full_page=True)
 # Simulate save quota error. Candidate must not replace selected project or mutate book list.
 page.evaluate('(()=>{window.localStorage.setItem=()=>{throw new Error("quota exceeded")};return true})()')
 with page.expect_file_chooser() as chooser:
    page.locator(input_selector).click()
 chooser.value.set_files({'name':'fail.txt','mimeType':'text/plain','buffer':('第一章 这是标题\n'+('保存前无法提交。'*15)).encode()})
 page.wait_for_selector('#sw6Commit');page.locator('#sw6Commit').click()
 page.wait_for_function('document.querySelector("#sw6Commit")?.textContent.includes("重试")')
 assert page.evaluate('state.projects.length')==starting+1,'Failed write must be rolled back'
 assert page.evaluate('project().title')=='新作品·测试'
 page.locator('#sw6Cancel').click()
 assert not errs,errs
 print('PASS v0.6 UI: import preview, 3 chapters, confirm/cancel, binary guard, DEFLATED EPUB, quota rollback, no JS errors')
 context.close();browser.close()
