from pathlib import Path
import os
import shutil
import mimetypes
from playwright.sync_api import sync_playwright

base=Path(__file__).resolve().parent/'web'
with sync_playwright() as pw:
    browser=pw.chromium.launch(**({'executable_path':os.environ.get('CHROMIUM_BIN') or shutil.which('chromium') or shutil.which('google-chrome')} if (os.environ.get('CHROMIUM_BIN') or shutil.which('chromium') or shutil.which('google-chrome')) else {}),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,device_scale_factor=1)
    page=context.new_page();errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
    def serve(route):
        item=route.request.url.split('storyweave.test/',1)[-1].split('?',1)[0] or 'index.html'
        path=(base/item).resolve()
        if path.is_file() and path.is_relative_to(base):route.fulfill(body=path.read_bytes(),content_type=mimetypes.guess_type(str(path))[0] or 'application/octet-stream')
        else:route.fulfill(status=404,body='not found')
    html=(base/'index.html').read_text()
    html=html.replace('<link rel="stylesheet" href="styles.css"/>','<style>'+(base/'styles.css').read_text()+'</style>')
    for name in ('app.js','v05.js'):
        html=html.replace(f'<script src="{name}" defer></script>', '<script>'+(base/name).read_text().replace('</script>',r'<\/script>')+'</script>')
    page.set_content(html);page.wait_for_selector('.hero',timeout=10000)

    page.locator('[data-tab="world"]').click()
    assert page.locator('.v5-ledger').count()==1
    page.locator('[data-action="canon-new"]').click()
    m=page.locator('#modalRoot .modal')
    assert '新增世界事实' in m.inner_text()
    m.locator('[name="title"]').fill('谁给出了密信')
    m.locator('[name="truth"]').fill('真正的写信人是周远山')
    roles=m.locator('[data-knowledge-role]')
    roles.nth(0).locator('[data-k="status"]').select_option('known')
    second_chapter=page.evaluate('chapters()[1].id')
    roles.nth(0).locator('[data-k="since"]').select_option(second_chapter)
    roles.nth(1).locator('[data-k="status"]').select_option('mistaken')
    roles.nth(1).locator('[data-k="belief"]').fill('她以为寄信人是林澈')
    m.locator('#v5SaveFact').click()
    assert page.locator('.v5-fact-line').count()==1
    assert page.evaluate('state.canonFacts.length')==1
    page.locator('[data-tab="write"]').click()
    page.locator('[data-action="role-lens"]').first.click()
    root=page.locator('#modalRoot .modal')
    assert '角色认知沙盘' in root.inner_text()
    assert '真正的写信人是周远山' not in root.locator('#v5LensPreview').inner_text()
    root.locator('[name="chapter"]').select_option(second_chapter)
    assert '真正的写信人是周远山' in root.locator('#v5LensPreview').inner_text()
    root.locator('[name="role"]').select_option(page.evaluate('characters()[1].id'))
    assert '她以为寄信人是林澈' in root.locator('#v5LensPreview').inner_text()
    assert '真正的写信人是周远山' not in root.locator('#v5LensPreview').inner_text()
    root.locator('#modalClose').click()
    # Intercept model calls; each role must get its own bounded knowledge.
    page.evaluate('window.__calls=[]; chatAPI=async (sys,usr,max)=>{window.__calls.push({sys,usr,max});return "角色完成行动。"}; void 0')
    page.locator('[data-action="scene-rehearsal"]').first.click()
    root=page.locator('#modalRoot .modal')
    root.locator('[name="chapter"]').select_option(second_chapter)
    root.locator('[name="premise"]').fill('两人在警署相遇，谈起密信。')
    root.locator('#v5RunScene').click()
    root.locator('#v5CopyScene').wait_for(timeout=10000)
    assert page.evaluate('window.__calls.length')==3
    calls=page.evaluate('window.__calls')
    assert '真正的写信人是周远山' in calls[0]['usr']
    assert '真正的写信人是周远山' not in calls[1]['usr']
    assert '真正的写信人是周远山' not in calls[2]['usr']
    root.locator('#modalClose').click()
    page.locator('[data-tab="world"]').click()
    page.evaluate('document.querySelector("#toastRoot").innerHTML=""')
    page.screenshot(path=str(Path(__file__).resolve().parent/'v05-world-preview.png'),full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+2'), 'Horizontal overflow'
    assert not errors, errors
    print('PASS v0.5 UI: canon CRUD, per-chapter view, role-scoped three-call rehearsal, mobile no-overflow')
    context.close();browser.close()
