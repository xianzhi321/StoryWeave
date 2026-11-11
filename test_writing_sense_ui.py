"""Self-contained real Chromium smoke test of the Writing Sense UI.

Run: python test_writing_sense_ui.py (requires playwright and chromium).
"""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright

BASE = Path(__file__).resolve().parent
HTML = '''<!doctype html><html lang="zh-CN"><head>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>body{margin:0;background:#f8f6f1;color:#574f46;font:14px system-ui}
#screen{padding:18px 12px;max-width:720px;margin:auto}
.editor-shell{display:flex;flex-direction:column;border:1px solid #e7e0d4;border-radius:16px;overflow:hidden;background:#fffdf8}
.editor-banner{padding:14px 16px;background:#f4f0e7;border-bottom:1px solid #e7e0d4}
.editor-title{border:0;background:none;font-size:20px;color:inherit;width:100%}
.editor-body{border:0;outline:0;resize:none;min-height:260px;padding:18px;font:17px/2 Georgia,serif;background:transparent;color:inherit}
.editor-footer{padding:8px 13px;border-top:1px solid #e7e0d4;font-size:11px}
body[data-sw16-paper="ink"]{background:#222b29;color:#ede8d9;--sw16-sheet:#222b29;--sw16-edge:#4b5c54;--sw16-panel:#2c3732;--sw16-text:#ede8d9;--sw16-subtle:#bbc7bc}
body[data-sw16-paper="ink"] .editor-shell{background:var(--sw16-sheet);border-color:var(--sw16-edge)}
body[data-sw16-paper="ink"] .editor-banner{background:var(--sw16-panel);border-color:var(--sw16-edge)}
</style></head><body><main id="screen"></main></body></html>'''

with sync_playwright() as pw:
    chromium = os.environ.get('CHROMIUM_BIN') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
    browser = pw.chromium.launch(headless=True, **({'executable_path': chromium} if chromium else {}), args=['--no-sandbox', '--disable-dev-shm-usage'])
    ctx = browser.new_context(viewport={'width': 390, 'height': 820}, device_scale_factor=1)
    page = ctx.new_page()
    page.set_content(HTML)
    page.add_style_tag(content=(BASE / 'web/writing-sense.css').read_text())
    page.evaluate('''() => {
      window.tab = 'write';
      window.project = () => ({id:'demo',title:'测试作品'});
      window.chapter = () => ({id:'test',title:'雨夜'});
      window.writePage = () => `<div class="editor-shell"><div class="editor-banner"><input class="editor-title" value="第三章 · 雨夜" aria-label="章节标题"></div><textarea id="chapterText" class="editor-body" aria-label="正文">门外的雨还没有停。</textarea><div class="editor-footer">已保存至本机</div></div>`;
      window.wireWriter = () => {};
      window.render = () => {document.getElementById('screen').innerHTML=writePage();wireWriter()};
    }''')
    page.add_script_tag(content=(BASE / 'web/writing-sense-core.js').read_text())
    page.add_script_tag(content=(BASE / 'web/writing-sense.js').read_text())
    page.evaluate('render()')
    assert page.locator('#sw-sense').count() == 1, 'Writing Sense bar missing'
    assert page.locator('.sw-sense-detail').is_hidden(), 'Details should start collapsed'
    page.locator('#chapterText').click()
    page.keyboard.type('abcd', delay=55)
    page.wait_for_timeout(150)
    assert float(page.locator('#sw-sense-speed').inner_text()) > 0, 'Trusted keystrokes not counted'
    page.locator('.sw-sense-line').click()
    assert page.locator('#sw-sense').get_attribute('open') is not None, 'Summary did not expand'
    assert '字/分' in page.locator('#sw-sense-minute').inner_text()
    assert '峰值' in page.locator('#sw-sense-peak').inner_text()
    curve = page.locator('#sw-sense-curve').get_attribute('points')
    assert len(curve.split(' ')) == 12, 'Expected 12 graph buckets'
    assert 'L 300 80' in page.locator('#sw-sense-area').get_attribute('d')
    assert page.locator('.sw-sense-totals .sw-sense-total').count() == 3
    assert page.locator('#chapterText').input_value() == '门外的雨还没有停。abcd'
    # Same-chapter renderer refresh preserves the expanded state without overwriting body text.
    page.evaluate('render()')
    assert page.locator('#sw-sense').get_attribute('open') is not None, 'Expanded state lost on editor rerender'
    for width in [320, 360, 390, 768]:
        page.set_viewport_size({'width': width, 'height': 820})
        page.wait_for_timeout(30)
        overflow = page.evaluate('''() => {
          const bar=document.querySelector('.sw-sense-line'), box=bar.getBoundingClientRect();
          return Math.max(0,bar.scrollWidth-bar.clientWidth,box.right-innerWidth);
        }''')
        assert overflow <= 1, f'Writing Sense bar overflow at {width}px: {overflow}'
    page.set_viewport_size({'width':390,'height':820})
    page.evaluate("document.body.dataset.sw16Paper = 'ink'")
    color = page.locator('#sw-sense').evaluate('(element) => getComputedStyle(element).getPropertyValue("--sense-accent").trim()')
    assert color == '#afceb6', f'Dark paper colors missing: {color}'
    page.evaluate("document.body.dataset.sw16Paper = ''")
    page.evaluate('''() => {
      const el=document.getElementById('sw-sense');
      el.dataset.state='typing';el.dataset.empty='false';
      document.getElementById('sw-sense-speed').textContent='3.2';
      document.getElementById('sw-sense-state').textContent='输入中';
      document.getElementById('sw-sense-thinking').textContent='00:12';
      document.getElementById('sw-sense-minute').firstChild.nodeValue='186';
      document.getElementById('sw-sense-peak').textContent='峰值 218 字/分';
      document.getElementById('sw-sense-typing').textContent='06:12';
      document.getElementById('sw-sense-thought-total').textContent='02:38';
      document.getElementById('sw-sense-editing').textContent='01:10';
      document.getElementById('sw-sense-curve').setAttribute('points','0,65 27,33 54,24 82,78 109,80 136,54 164,22 191,16 218,20 245,42 273,31 300,25');
      document.getElementById('sw-sense-area').setAttribute('d','M 0 65 L 27 33 L 54 24 L 82 78 L 109 80 L 136 54 L 164 22 L 191 16 L 218 20 L 245 42 L 273 31 L 300 25 L 300 80 L 0 80 Z');
      document.getElementById('sw-sense-stack-typing').style.width='62%';
      document.getElementById('sw-sense-stack-thinking').style.width='26%';
      document.getElementById('sw-sense-stack-editing').style.width='12%';
    }''')
    out = Path('/mnt/data/StoryWeave-WritingSense-UI-v1.9.10-preview.png')
    page.locator('.editor-shell').screenshot(path=str(out))
    page.evaluate("document.body.dataset.sw16Paper = 'ink'")
    dark = Path('/mnt/data/StoryWeave-WritingSense-UI-v1.9.10-dark-preview.png')
    page.locator('.editor-shell').screenshot(path=str(dark))
    print('Dark preview:', dark)
    print('PASS writing sense UI: keyboard input, graph, summary, rerender, 320-768px, dark paper')
    print('Preview:', out)
    browser.close()
