"""v0.7 end-to-end regression: inline browser/compatibility storage, writer tools, safe edits, responsive."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json

ROOT=Path(__file__).resolve().parent
BASE=ROOT/'web'

def inline_html(seed=None):
    html=(BASE/'index.html').read_text()
    html=html.replace('<link rel="stylesheet" href="styles.css"/>','<style>'+(BASE/'styles.css').read_text()+'</style>')
    for name in ('app.js','v05.js','v06.js','v07.js'):
      html=html.replace(f'<script src="{name}" defer></script>', '<script>'+(BASE/name).read_text().replace('</script>',r'<\/script>')+'</script>')
    init='''<script>(function(){const data=SEED;let store={};if(data!==null)store.storyweave_fallback=data;
      Object.defineProperty(window,"localStorage",{configurable:true,value:{getItem(k){return store[k]??null;},setItem(k,v){store[k]=String(v);},removeItem(k){delete store[k];}}});})();</script>'''
    html=html.replace('</head>',init.replace('SEED',json.dumps(seed))+'</head>')
    return html

with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    ctx=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True,accept_downloads=True)
    page=ctx.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(inline_html())
    page.wait_for_selector('[data-action="import-manuscript"]')
    page.locator('[data-tab="write"]').click()
    page.wait_for_selector('.sw7-chapter-navigator')
    assert page.locator('.sw7-chapter-navigator').count()==1
    assert page.locator('[data-action="sw7-find"]').count()==1
    assert page.locator('[data-action="sw7-reference"]').count()==1
    assert page.locator('[data-action="sw7-prev"]').is_disabled()
    assert page.locator('[data-action="sw7-next"]').is_enabled()
    # Persistent editing: immediate text is first guarded by old-version snapshot.
    old=page.locator('#chapterText').input_value()
    original='在钟楼前，夜雨拍打窗棂。夜雨让人看不清远方。'
    page.locator('#chapterText').fill(original)
    page.wait_for_function('document.querySelector("#saveStatus")?.textContent.includes("已保存")')
    # Search replace: save original as historical undo before changing the chapter.
    page.locator('[data-action="sw7-find"]').click()
    page.locator('#sw7Find').fill('夜雨')
    assert '2 处匹配' in page.locator('#sw7Count').inner_text()
    page.locator('#sw7Replace').fill('暴雨')
    page.once('dialog',lambda d:d.accept())
    page.locator('#sw7ReplaceAll').click()
    page.wait_for_function('document.querySelector("#chapterText")?.value.includes("暴雨拍打")')
    assert page.locator('#chapterText').input_value().count('暴雨')==2
    assert page.evaluate('chapter().history.some(h=>h.text.includes("夜雨拍打"))')
    # History preview and safe restore back to the original.
    page.locator('[data-action="view-history"]').click()
    page.locator('[data-sw7-version]').first.click()
    assert '旧版全文' in page.locator('#modalRoot').inner_text()
    page.locator('#sw7RestoreVersion').click()
    page.locator('#sw22-restore-confirm').click()
    page.wait_for_function('document.querySelector("#chapterText")?.value.includes("夜雨拍打")')
    assert page.evaluate('chapter().history.some(h=>h.text.includes("暴雨拍打"))'), 'Undo point for previous state was not stored'
    # Search result jumps to the exact matched region in text, not only a chapter.
    page.locator('[data-action="search"]').click()
    page.locator('#sw7FullSearch').fill('夜雨')
    assert page.locator('[data-sw7-hit]').count()>=2
    page.locator('[data-sw7-hit]').nth(1).click()
    page.wait_for_selector('#chapterText')
    selected=page.evaluate('(()=>{const e=document.querySelector("#chapterText");return e.value.slice(e.selectionStart,e.selectionEnd)})()')
    assert selected=='夜雨', f'wrong selection: {selected!r}'
    # In-writer drawer: inserting a character name triggers the normal save path.
    page.locator('[data-action="sw7-reference"]').click()
    page.wait_for_selector('#sw7DrawerRoot')
    assert '林澈' in page.locator('#sw7DrawerRoot').inner_text()
    page.locator('[data-sw7-role]').first.click()
    role=page.locator('#sw7DrawerRoot .sw7-person-identity h3').inner_text()
    page.locator('#sw7InsertName').click()
    assert role in page.locator('#chapterText').input_value()
    page.wait_for_function('document.querySelector("#saveStatus")?.textContent.includes("已保存")')
    # Backups really produce a file through browser download UI.
    with page.expect_download() as download:
      page.locator('[data-action="sw7-backup"]').click()
    assert download.value.suggested_filename.endswith('.json')
    # Load persisted data through IndexedDB rather than in-memory JS state.
    text_after=page.locator('#chapterText').input_value()
    serialized=page.evaluate('localStorage.getItem("storyweave_fallback")')
    assert serialized and '夜雨' in serialized
    page.close()
    page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(inline_html(serialized))
    page.wait_for_selector('[data-tab="write"]')
    page.locator('[data-tab="write"]').click()
    assert page.locator('#chapterText').input_value()==text_after, 'Reload lost newly written text'
    # Replacements that fail to save must leave the original intact.
    current=page.locator('#chapterText').input_value()
    page.evaluate('window.__originalStorage=localStorage.setItem;localStorage.setItem=()=>{throw Error("quota-test")};void 0')
    page.locator('[data-action="sw7-find"]').click()
    page.locator('#sw7Find').fill('夜雨')
    page.locator('#sw7Replace').fill('晨雾')
    page.once('dialog',lambda d:d.accept())
    page.locator('#sw7ReplaceAll').click()
    page.wait_for_function('document.querySelector("#sw7ReplaceAll")?.textContent.includes("替换本章")')
    assert page.evaluate('chapter().text')==current, 'Failed storage write mutated in-memory state'
    page.evaluate('localStorage.setItem=window.__originalStorage;void 0')
    page.locator('#modalClose').click()
    page.locator('[data-action="sw7-next"]').click()
    assert '第二章' in page.locator('.sw7-chapter-navigator').inner_text()
    # Landscape desktop layout, drawer anchored to the right.
    page.set_viewport_size({'width':1190,'height':900})
    page.locator('[data-action="sw7-reference"]').click()
    assert page.locator('#sw7DrawerRoot').is_visible()
    width=page.locator('.sw7-reference-drawer').evaluate('(e)=>e.getBoundingClientRect().width')
    assert width<550, f'desktop drawer incorrectly stretches across full screen: {width}'
    page.locator('#sw7DrawerClose').click()
    assert not errors,errors
    print('PASS v0.7 UI: editor toolbar, navigation, literal search+replace, snapshot diff, safe restore, result jump, author drawer, JSON backup download, simulated localStorage reload, save failure rollback, desktop drawer, no JS errors')
    browser.close()

