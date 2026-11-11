"""Capture actual mobile-sized workshop pages; no AI/network dependencies."""
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent
WEB=ROOT/'web'
html=(WEB/'index.html').read_text().replace('<link rel="stylesheet" href="styles.css"/>','<style>'+(WEB/'styles.css').read_text()+'</style>')
for f in ['app.js','v05.js','v06.js','v07.js','distill-core.js','v08.js']:
    html=html.replace(f'<script src="{f}" defer></script>', '<script>'+(WEB/f).read_text().replace('</script>',r'<\/script>')+'</script>')
html=html.replace('</head>', '<script>const __stored={};Object.defineProperty(window,"localStorage",{configurable:true,value:{getItem:k=>__stored[k]??null,setItem:(k,v)=>{__stored[k]=v}}});</script></head>')
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,has_touch=True,is_mobile=True)
    page=context.new_page();page.set_content(html)
    page.wait_for_selector('[data-tab="skills"]')
    page.evaluate('''async()=>{
      const d={id:'screenshot-source',projectId:state.selected,title:'雾城手记 · 叙事参考',type:'txt',text:Array.from({length:110},(_,i)=>`第${i+1}节。人物在阴暗的走廊里交谈，话语平静却彼此试探。\\n`).join('\\n'),created:time()};
      state.documents.push(d);
      state.distillationJobs=[{id:'job-preview',projectId:state.selected,docId:d.id,sourceTitle:d.title,sourceFingerprint:StoryWeaveDistillCore.fingerprint(d.text),samples:StoryWeaveDistillCore.planSamples(d.text,5,1200),nextIndex:3,validated:[{category:'人物对白',title:'保留弦外之音',evidence:{start:30,end:39,sampleIndex:0,reason:'动作与停顿保留了人物的试探'}},{category:'叙事节奏',title:'使用错落句式',evidence:{start:500,end:510,sampleIndex:2,reason:'短句和叙述交替'}},{category:'场景细节',title:'用道具暗示冲突',evidence:{start:1100,end:1110,sampleIndex:3,reason:'环境是人物行为的提示'}}],status:'paused',created:time()}];
      state.skillPresets=[{id:'preset-preview',projectId:state.selected,name:'低声的悬念',description:'克制语言、潜台词、具体动作',skillIds:state.skills.filter(s=>s.status==='ready').map(s=>s.id)}];
      go('skills');
    }''')
    page.wait_for_selector('.sw8-lab')
    page.screenshot(path=str(ROOT/'v08-skill-workshop.png'),full_page=True)
    page.locator('[data-action="distill"][data-id="screenshot-source"]').click()
    page.wait_for_selector('#sw8Start')
    page.screenshot(path=str(ROOT/'v08-distillation-setup.png'),full_page=True)
    print('Captured real mobile browser UI screenshots.')
    browser.close()
