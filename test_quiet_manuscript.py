"""v1.9.14 editor-specific dark/light responsive visual + preference regression."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import re,base64,mimetypes
ROOT=Path(__file__).parent; WEB=ROOT/'web'
html=(WEB/'index.html').read_text()
def inline_css(m):
    css=(WEB/m.group(1)).read_text()
    def asset(m):
        f=WEB/m.group(2)
        if not f.is_file():return m.group(0)
        return 'url("data:'+ (mimetypes.guess_type(str(f))[0] or 'application/octet-stream')+';base64,'+base64.b64encode(f.read_bytes()).decode()+'")'
    return '<style>'+re.sub(r'url\((["\']?)(assets/[^)"\']+)\1\)',asset,css)+'</style>'
def inline_js(m):return '<script>'+(WEB/m.group(1)).read_text().replace('</script>',r'<\/script>')+'</script>'
html=re.sub(r'<link rel="stylesheet" href="([^"]+)"\s*/>',inline_css,html)
html=re.sub(r'<script src="([^"]+)" defer></script>',inline_js,html)
html=html.replace('</head>', '''<script>
Object.defineProperty(window,'indexedDB',{value:undefined});
const __quietStore=new Map([
 ['storyweave_writer_display',JSON.stringify({paper:'ink',background:'pine'})],
 ['storyweave_interface_preferences',JSON.stringify({ruled:true})]
]);
Object.defineProperty(window,'localStorage',{value:{getItem:k=>__quietStore.get(k)||null,setItem:(k,v)=>__quietStore.set(k,String(v)),removeItem:k=>__quietStore.delete(k)}});
</script></head>''')
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=2)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(html,wait_until='load',timeout=30000)
    page.locator('.book-card').first.click()
    page.locator('.sw16-chapter-link').first.click()
    page.wait_for_selector('#chapterText')
    page.wait_for_timeout(360)
    assert page.locator('body').get_attribute('data-sw17-quiet')=='true'
    assert page.locator('body').get_attribute('data-sw16-paper')=='ink'
    assert page.locator('body').get_attribute('data-sw20-background')=='pine'
    assert page.locator('body').get_attribute('data-sw17-ruled')=='true'
    assert page.locator('#chapterText').evaluate('e=>getComputedStyle(e).backgroundImage')=='none'
    assert page.locator('.sw15-secondary > summary').evaluate('e=>getComputedStyle(e).backgroundColor')=='rgba(0, 0, 0, 0)'
    for w in (320,360,390,430,768):
        page.set_viewport_size({'width':w,'height':844})
        overflow=page.evaluate('document.documentElement.scrollWidth-innerWidth')
        assert overflow<=2,(w,overflow)
    page.set_viewport_size({'width':390,'height':844})
    page.locator('#toastRoot').evaluate('el=>el.innerHTML=""')
    page.screenshot(path='/mnt/data/StoryWeave-Editor-v1.9.14-dark.png',full_page=True)
    # Submit new user text and preserve cursor; update does not start transition animation.
    editor=page.locator('#chapterText')
    editor.fill('窗外下着雨。\n灯光落在桌面上。')
    assert editor.input_value().endswith('灯光落在桌面上。')
    assert not page.locator('#screen').evaluate('e=>e.classList.contains("swm-view-enter")')
    # Click existing settings action; can opt out of quiet mode without losing paper background.
    page.locator('[data-action="v15-tools"]').first.click()
    page.locator('[data-sw15-tool="v14-display"]').first.click()
    toggle=page.locator('#sw17-quiet')
    assert toggle.is_checked()
    toggle.uncheck()
    page.locator('#sw14-display-save').click()
    assert page.locator('body').get_attribute('data-sw17-quiet')=='false'
    assert page.locator('#chapterText').evaluate('e=>getComputedStyle(e).backgroundImage')!='none'
    page.evaluate('document.body.dataset.sw17Quiet="true";document.body.dataset.sw16Paper="paper"')
    page.locator('#toastRoot').evaluate('el=>el.innerHTML=""')
    page.screenshot(path='/mnt/data/StoryWeave-Editor-v1.9.14-light.png',full_page=True)
    page.emulate_media(reduced_motion='reduce')
    assert page.locator('.sw14-editor-bar button').first.evaluate('e=>getComputedStyle(e).transitionDuration') in ('0s','0s, 0s','0s, 0s, 0s')
    assert not errors,errors
    print('PASS v1.9.14 manuscript: ink/quiet, 320–768 responsive, edit, quiet override, reduced motion')
    browser.close()
