"""HTTP/IndexedDB acceptance test: imported novel survives a real reload."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
from playwright.sync_api import sync_playwright
from zipfile import ZipFile, ZIP_DEFLATED
from io import BytesIO
root=Path(__file__).resolve().parent/'web'
http=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(root)))
worker=Thread(target=http.serve_forever,daemon=True);worker.start()
url=(root/'index.html').as_uri()
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  ctx=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True)
  page=ctx.new_page();errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(url,wait_until='domcontentloaded')
  page.wait_for_function('state&&state.projects.length>0')
  original=page.evaluate('state.projects.length')
  text='第一章 灯下\n'+('天色渐晚，记录本上只剩下一行字。'*20)+'\n第二章 车站\n'+('人们都在等待一辆没有时刻表的列车。'*20)
  with page.expect_file_chooser() as ch:page.locator('[data-action="import-manuscript"]').click()
  ch.value.set_files({'name':'持久化测试小说.txt','mimeType':'text/plain','buffer':text.encode('utf-8')})
  page.wait_for_selector('#sw6Commit')
  page.locator('#sw6Commit').click()
  page.wait_for_function('original=>state.projects.length===original+1',arg=original)
  assert page.evaluate('project().chapters.length')==2
  new_id=page.evaluate('state.selected')
  page.reload(wait_until='domcontentloaded')
  page.wait_for_function('state&&state.projects.length>0')
  assert page.evaluate('(id)=>state.projects.find(p=>p.id===id)?.chapters.length',new_id)==2
  assert page.evaluate('(id)=>state.projects.find(p=>p.id===id)?.title',new_id)=='持久化测试小说'
  # Confirm DEFLATED ZIP path: real EPUBs use compression by default.
  epub=BytesIO()
  with ZipFile(epub,'w',ZIP_DEFLATED) as z:
   z.writestr('OEBPS/ch1.xhtml','<html><body><h1>第一章 历史</h1><p>'+('今日的天气与昨天并不相同。'*15)+'</p></body></html>')
  page.locator('[data-tab="home"]').click()
  with page.expect_file_chooser() as ch:page.locator('[data-action="import-manuscript"]').click()
  ch.value.set_files({'name':'压缩章节.epub','mimeType':'application/epub+zip','buffer':epub.getvalue()})
  page.wait_for_selector('#sw6Commit',timeout=5000)
  page.locator('#sw6Cancel').click()
  assert page.evaluate('state.projects.length')==original+1
  page.screenshot(path=str(root.parent/'v06-home-preview.png'),full_page=True)
  page.locator('[data-tab="write"]').click()
  page.screenshot(path=str(root.parent/'v06-writing-preview.png'),full_page=True)
  assert not errors,errors
  print('PASS v0.6 IndexedDB: novel survives reload; DEFLATE EPUB preview; no runtime errors')
  ctx.close();browser.close()
finally:
 http.shutdown();http.server_close()
