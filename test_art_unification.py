"""StoryWeave v1.9.15: visual regression across main views + drawers in two themes."""
from pathlib import Path
import base64, mimetypes, re
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).parent; WEB = ROOT / 'web'
source = (WEB / 'index.html').read_text()
def css(m):
    file = WEB / m.group(1)
    text = file.read_text()
    def embedded(match):
        path = WEB / match.group(2)
        if not path.is_file(): return match.group(0)
        mime = mimetypes.guess_type(str(path))[0] or 'application/octet-stream'
        return 'url("data:' + mime + ';base64,' + base64.b64encode(path.read_bytes()).decode() + '")'
    text = re.sub(r'url\((["\']?)(assets/[^)"\']+)\1\)', embedded, text)
    return '<style>' + text + '</style>'
def js(m): return '<script>' + (WEB / m.group(1)).read_text().replace('</script>', r'<\/script>') + '</script>'
source = re.sub(r'<link rel="stylesheet" href="([^"]+)"\s*/>', css, source)
source = re.sub(r'<script src="([^"]+)" defer></script>', js, source)
source = source.replace('</head>', '''<script>
Object.defineProperty(window,'indexedDB',{value:undefined});
const swTestStore = new Map([['storyweave_writer_display',JSON.stringify({paper:'ink',background:'plain'})]]);
Object.defineProperty(window,'localStorage',{value:{getItem:k=>swTestStore.get(k)||null,setItem:(k,v)=>swTestStore.set(k,String(v)),removeItem:k=>swTestStore.delete(k)}});
</script></head>''')

def get_colors(page, selector):
    return page.locator(selector).first.evaluate('el=>({bg:getComputedStyle(el).backgroundColor,fg:getComputedStyle(el).color})')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
    errors=[]; page.on('pageerror',lambda err:errors.append(str(err)))
    page.set_content(source,wait_until='load',timeout=45000)
    page.locator('.book-card').first.click()
    print('initial tabs', [x.inner_text() for x in page.locator('#bottomNav button').all()])
    cases=[('目录','contents','directory'),('人物','characters','characters'),('世界','world','world')]
    for tab,action,label in cases:
        page.locator('#bottomNav [data-tab="'+action+'"]').click()
        page.wait_for_timeout(150)
        assert page.locator('body').get_attribute('data-sw16-paper')=='ink'
        bg=get_colors(page,'#screen')['bg']
        assert bg not in ('rgb(255, 255, 255)','rgb(246, 245, 240)'),(label,bg)
        assert page.evaluate('document.documentElement.scrollWidth-innerWidth') <= 2, label
        page.screenshot(path=str(ROOT / ('StoryWeave-v1.9.15-%s-dark.png' % label)),full_page=True)
        print(label, 'screen',bg)
    page.locator('#bottomNav [data-tab="characters"]').click()
    page.locator('.person').first.click()
    page.wait_for_timeout(400)
    assert page.locator('.modal').count() or page.locator('.sw7-reference-drawer').count()
    if page.locator('.modal').count():
        print('person modal',get_colors(page,'.modal'))
    page.screenshot(path=str(ROOT/'StoryWeave-v1.9.15-person-detail-dark.png'),full_page=True)
    # Close whichever detail and open writing editor.
    if page.locator('#modalClose').count(): page.locator('#modalClose').click()
    elif page.locator('.sw7-close').count(): page.locator('.sw7-close').first.click()
    page.locator('#bottomNav [data-tab="contents"]').click()
    page.locator('.sw16-chapter-link').first.click()
    page.wait_for_selector('#chapterText')
    assert page.locator('#chapterText').evaluate('el=>getComputedStyle(el).backgroundImage')=='none'
    page.locator('#chapterText').fill('夜色将至，窗台上还有雨水。')
    assert '夜色将至' in page.locator('#chapterText').input_value()
    page.locator('[data-action="ai-assist"]').first.click() if page.locator('[data-action="ai-assist"]').count() and page.locator('[data-action="ai-assist"]').first.is_visible() else None
    if page.locator('.modal').count():
        page.wait_for_timeout(400)
        print('AI modal',get_colors(page,'.modal'))
        page.screenshot(path=str(ROOT/'StoryWeave-v1.9.15-ai-dark.png'),full_page=True)
    for width in [320,360,390,430,768]:
        page.set_viewport_size({'width':width,'height':844})
        assert page.evaluate('document.documentElement.scrollWidth-innerWidth')<=2,width
    page.emulate_media(reduced_motion='reduce')
    assert get_colors(page,'#topbar')['bg'] != 'rgb(246, 245, 240)'
    assert not errors, errors[:4]
    # Light theme is a forced preference, restore screen and check forms / text.
    page.evaluate("document.body.dataset.sw16Paper='paper'")
    assert get_colors(page,'#topbar')['bg'] in ('rgb(246, 246, 241)','rgb(246, 245, 240)','rgb(248, 248, 244)'),get_colors(page,'#topbar')
    # A genuinely fresh light-theme run (not a transient dataset override).
    light=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
    light.set_content(source.replace("paper:'ink'", "paper:'paper'"),wait_until='load',timeout=45000)
    light.locator('.book-card').first.click()
    light.locator('#bottomNav [data-tab="characters"]').click()
    assert light.locator('body').get_attribute('data-sw16-paper')=='paper'
    assert get_colors(light,'#screen')['bg']=='rgb(246, 246, 241)'
    light.screenshot(path=str(ROOT/'StoryWeave-v1.9.15-characters-light.png'),full_page=True)
    light.locator('#bottomNav [data-tab="world"]').click()
    light.screenshot(path=str(ROOT/'StoryWeave-v1.9.15-world-light.png'),full_page=True)
    print('PASS cross-view design system, typing, ink/light, reduced motion, 320–768px')
    browser.close()
