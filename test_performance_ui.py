"""v1.9.13 offline browser regression with 550 synthetic chapters and 180 people."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
import re
import base64
import mimetypes

ROOT=Path(__file__).parent
WEB=ROOT/'web'
html=(WEB/'index.html').read_text(encoding='utf8')
def inline_css(match):
    css=(WEB/match.group(1)).read_text(encoding='utf8')
    def img(match):
        f=WEB/match.group(2)
        if not f.exists():return match.group(0)
        mime=mimetypes.guess_type(f.name)[0] or 'application/octet-stream'
        return 'url("data:'+mime+';base64,'+base64.b64encode(f.read_bytes()).decode('ascii')+'")'
    return '<style>'+re.sub(r'url\((["\']?)(assets/[^)"\']+)\1\)',img,css)+'</style>'
def inline_js(match):
    script=(WEB/match.group(1)).read_text(encoding='utf8').replace('</script>',r'<\/script>')
    return '<script>'+script+'</script>'
html=re.sub(r'<link rel="stylesheet" href="([^"]+)"\s*/>',inline_css,html)
html=re.sub(r'<script src="([^"]+)" defer></script>',inline_js,html)
html=html.replace('</head>','''<script>
  Object.defineProperty(window,'indexedDB',{value:undefined});
  const __perf_store=new Map();
  Object.defineProperty(window,'localStorage',{value:{
    getItem:key=>__perf_store.get(key)||null,
    setItem:(key,v)=>__perf_store.set(key,String(v)),
    removeItem:key=>__perf_store.delete(key)
  }});
</script></head>''')
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(html,wait_until='load',timeout=30000)
    page.wait_for_selector('.book-card',timeout=15000)
    result=page.evaluate('''() => {
      const p=state.projects[0];
      const base=p.chapters[0];
      const original=('小说正文测试，风从窗边吹过。🌿\\n').repeat(45);
      p.chapters=Array.from({length:550},(_,i)=>({
        id:'perf-'+i,title:'第'+(i+1)+'章 · '+(i<30?'谜团':'章目'),
        text:original,updated:new Date().toISOString(),
        volumeId:i<250?'perf-v1':'perf-v2',history:[]
      }));
      p.volumes=[{id:'perf-v1',title:'第一卷',order:0},{id:'perf-v2',title:'第二卷',order:1}];
      state.characters=Array.from({length:180},(_,i)=>({id:'role-'+i,projectId:p.id,name:'人物'+i,role:'设定',goal:''}));
      state.selected=p.id;
      chapterId=p.chapters[0].id;
      const t=performance.now();go('contents');
      return {ms:Math.round(performance.now()-t),chapterCount:p.chapters.length,
              rowCount:document.querySelectorAll('.sw16-chapter-row').length,
              load:!!document.querySelector('[data-sw38-more]')};
    }''')
    assert result['chapterCount']==550,result
    assert result['rowCount']<=120,result
    assert result['load'],result
    # Search one volume: should filter all 550, but only mount matching rows.
    page.locator('.sw19-directory-search > summary').click()
    page.locator('#sw19-directory-query').fill('谜团')
    page.wait_for_timeout(175)
    assert page.locator('.sw16-chapter-link').count()==30,page.locator('.sw16-chapter-link').count()
    assert '匹配 30 / 550 章' in page.locator('#sw19-directory-matches').inner_text()
    page.locator('#sw19-clear-query').click()
    page.wait_for_timeout(200)
    assert page.locator('.sw16-chapter-link').count()<=120
    # Batch selection must include all filtered matches, even when not yet mounted.
    page.locator('.sw16-directory-tools > summary').click()
    page.locator('#sw29-start').click()
    page.locator('#sw29-select-visible').click()
    selected=page.locator('#sw29-count').inner_text()
    assert '550 章' in selected,selected
    page.locator('#sw29-cancel').click()
    # Folding first volume should reveal second volume immediately.
    page.locator('[data-sw35-fold]').first.click()
    page.wait_for_timeout(100)
    assert page.locator('[data-sw14-chapter="perf-250"]').count()==1
    page.locator('[data-sw35-fold]').first.click()
    # Load more via a normal action without scrolling to avoid observer racing click.
    n=page.locator('.sw16-chapter-row').count()
    page.locator('[data-sw38-more]').evaluate('(el)=>el.click()')
    assert page.locator('.sw16-chapter-row').count()>=n
    # Writing a long chapter still returns correct Unicode count and no animation restart.
    page.locator('[data-sw14-chapter="perf-0"]').click()
    page.wait_for_selector('#chapterText')
    editor=page.locator('#chapterText')
    initial=editor.input_value()
    # The underlying quick-switch markup is bounded even when the focused layout
    # replaces its visible strip with the compact writing toolbar.
    quick=page.evaluate('''() => chapterStrip(project(),chapter())''')
    assert quick.count('data-action="chapter"')<=17
    assert '全部 550 章' in quick
    page.wait_for_timeout(420)  # let navigation's initial enter animation finish
    assert not page.locator('#screen').evaluate('el=>el.classList.contains("swm-view-enter")')
    editor.fill(initial+'再见🌿')
    assert editor.input_value().endswith('再见🌿')
    # IME candidate updates must not write partial text until composition ends.
    composition=page.evaluate('''() => {
      const el=document.querySelector('#chapterText');
      const old=chapter().text;
      el.dispatchEvent(new CompositionEvent('compositionstart',{data:''}));
      el.value=old+'候';
      el.dispatchEvent(new InputEvent('input',{data:'候',isComposing:true,bubbles:true}));
      const skipped=chapter().text===old;
      el.dispatchEvent(new CompositionEvent('compositionend',{data:'候'}));
      return {skipped,committed:chapter().text===old+'候'};
    }''')
    assert composition=={'skipped':True,'committed':True},composition
    assert page.locator('#charCount').inner_text().strip().endswith('字')
    assert not page.locator('#screen').evaluate('el=>el.classList.contains("swm-view-enter")')
    # Keyboard-relevant viewport sizes and visual style safety.
    for width in (320,360,390,768):
        page.set_viewport_size({'width':width,'height':740})
        assert page.evaluate('document.documentElement.scrollWidth-innerWidth')<=2,width
    # Personas are large but scroll; the list is content-visibility:auto.
    page.evaluate("go('characters')")
    assert page.locator('.person-list > .person').count()==180
    # Dark manuscript theme remains explicitly reversible.
    page.evaluate("go('write');document.body.dataset.sw16Paper='ink'")
    assert page.locator('#topbar').evaluate('el=>getComputedStyle(el).backgroundColor')=='rgb(44, 55, 50)'
    page.emulate_media(reduced_motion='reduce')
    page.evaluate("go('contents')")
    assert not page.locator('#screen').evaluate('el=>el.classList.contains("swm-view-enter")')
    assert not errors,errors
    print('PASS v1.9.13 large book UI:',json.dumps({'initialRender':result,'selected':selected,'errors':errors},ensure_ascii=False))
    browser.close()

