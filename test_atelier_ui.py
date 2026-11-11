"""v1.9.12 Chromium smoke test: mobile navigation, motion guards and layouts."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import re
import base64
import mimetypes

ROOT=Path(__file__).resolve().parent
WEB=ROOT/'web'
html=(WEB/'index.html').read_text(encoding='utf-8')
# Inline original assets into about:blank so tests are independent of a web server.
def css_replace(match):
    name=match.group(1)
    css=(WEB/name).read_text(encoding='utf-8')
    def inline_image(match):
        file=WEB/match.group(2)
        if not file.is_file(): return match.group(0)
        mime=mimetypes.guess_type(file.name)[0] or 'application/octet-stream'
        return 'url("data:'+mime+';base64,'+base64.b64encode(file.read_bytes()).decode('ascii')+'")'
    css=re.sub(r'url\((["\']?)(assets/[^)"\']+)\1\)',inline_image,css)
    return '<style>'+css+'</style>'
def js_replace(match):
    name=match.group(1)
    script=(WEB/name).read_text(encoding='utf-8').replace('</script>',r'<\/script>')
    return '<script>'+script+'</script>'
html=re.sub(r'<link rel="stylesheet" href="([^\"]+)"\s*/>',css_replace,html)
html=re.sub(r'<script src="([^\"]+)" defer></script>',js_replace,html)
html=html.replace('</head>', '''<script>
  Object.defineProperty(window,'indexedDB',{value:undefined});
  const __store=new Map();
  Object.defineProperty(window,'localStorage',{value:{
    getItem:key=>__store.get(key)||null,
    setItem:(key,v)=>__store.set(key,String(v)),
    removeItem:key=>__store.delete(key)
  }});
</script></head>''')
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,
                               args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.set_content(html,wait_until='load',timeout=30000)
    page.wait_for_selector('.book-card',timeout=15000)
    assert page.locator('.book-card').count()>=1
    assert page.locator('body').get_attribute('data-sw16-view')=='home'
    assert 'ui-fluid.css' in (WEB/'index.html').read_text()
    assert 'ui-atelier.css' in (WEB/'index.html').read_text()
    assert page.locator('body').evaluate('el=>getComputedStyle(el).backgroundColor')=='rgb(246, 245, 240)'
    page.screenshot(path='/mnt/data/StoryWeave-UI-v1.9.12-shelf.png',full_page=True)
    for width in (320,360,390,768):
        page.set_viewport_size({'width':width,'height':820})
        overflow=page.evaluate('Math.max(0, document.documentElement.scrollWidth-innerWidth)')
        assert overflow <= 2, f'shelf overflow at {width}: {overflow}'
    page.set_viewport_size({'width':390,'height':844})
    page.locator('[data-action="shelf-menu"]').click()
    assert page.locator('#modalRoot .modal').is_visible()
    assert page.locator('#modalRoot .modal').evaluate('el=>getComputedStyle(el).animationName')=='swm-sheet-in'
    page.locator('#modalClose').click()
    assert page.locator('#modalRoot .modal').count()==0
    # Opening a book changes the view and runs one short animation.
    page.locator('.book-card').first.click()
    page.wait_for_selector('#bottomNav .nav-item[aria-current="page"]')
    assert page.locator('body').get_attribute('data-sw16-view')=='contents'
    assert page.locator('#screen').evaluate('el=>el.classList.contains("swm-view-enter")')
    page.wait_for_timeout(360)
    assert not page.locator('#screen').evaluate('el=>el.classList.contains("swm-view-enter")')
    # No new navigation animation when re-rendering the same page.
    page.evaluate('render()')
    assert not page.locator('#screen').evaluate('el=>el.classList.contains("swm-view-enter")')
    page.screenshot(path='/mnt/data/StoryWeave-UI-v1.9.12-directory.png',full_page=True)
    assert page.locator('.sw16-chapter-link').first.evaluate('el=>getComputedStyle(el).minHeight')=='63px'
    # Tabs and writing must still open; input does not restart the page animation.
    page.locator('[data-tab="characters"]').click()
    page.wait_for_timeout(330)
    assert page.locator('body').get_attribute('data-sw16-view')=='characters'
    page.locator('[data-tab="contents"]').click()
    page.wait_for_timeout(330)
    # Click chapter navigation, not hidden reference controls.
    chapter_link=page.locator('.sw16-chapter-link').first
    assert chapter_link.count()
    chapter_link.click()
    page.wait_for_selector('#chapterText',timeout=6000)
    assert page.locator('body').get_attribute('data-sw16-view')=='write'
    page.wait_for_timeout(200)
    page.locator('#chapterText').fill('测试新增文字')
    assert not page.locator('#screen').evaluate('el=>el.classList.contains("swm-view-enter")')
    assert page.locator('#chapterText').input_value()=='测试新增文字'
    # Editing on narrow viewport doesn't overflow horizontally.
    for width in [320,360,390,768]:
        page.set_viewport_size({'width':width,'height':820})
        overflow=page.evaluate('Math.max(0,document.documentElement.scrollWidth-innerWidth)')
        assert overflow <= 2, f'Overflow at {width}px: {overflow}'
    page.set_viewport_size({'width':390,'height':844})
    page.screenshot(path='/mnt/data/StoryWeave-UI-v1.9.12-editor.png',full_page=True)
    page.evaluate('document.body.dataset.sw16Paper="ink"')
    assert page.locator('#topbar').evaluate('el=>getComputedStyle(el).backgroundColor')=='rgb(44, 55, 50)'
    page.evaluate('document.body.dataset.sw16Paper="paper"')
    # Reduced-motion OS preference disables transitions while preserving navigation.
    page.emulate_media(reduced_motion='reduce')
    page.evaluate("go('contents')")
    assert not page.locator('#screen').evaluate('el=>el.classList.contains("swm-view-enter")')
    duration=page.locator('.book-card').first.evaluate('el=>getComputedStyle(el).transitionDuration') if page.locator('.book-card').count() else '0s'
    assert all(float(t.strip().rstrip('s'))==0 for t in duration.split(',')),duration
    assert not errors, errors
    print('PASS v1.9.12 Quiet Atelier UI: shelf, directory, navigation, editor input, reduced motion, 320–768px; screenshots created')
    browser.close()
