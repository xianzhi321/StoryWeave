"""Real Chromium screenshots, not a generated concept design."""
from pathlib import Path
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parent;W=R/'web'
html=(W/'index.html').read_text().replace('<link rel="stylesheet" href="styles.css"/>','<style>'+ (W/'styles.css').read_text()+'</style>')
for f in ['app.js','v05.js','v06.js','v07.js','distill-core.js','v08.js','plot-core.js','v09.js']:
    html=html.replace(f'<script src="{f}" defer></script>','<script>'+(W/f).read_text().replace('</script>',r'<\/script>')+'</script>')
html=html.replace('</head>','<script>const __storage={};Object.defineProperty(window,"localStorage",{configurable:true,value:{getItem(k){return __storage[k]??null},setItem(k,v){__storage[k]=String(v)},removeItem(k){delete __storage[k]}}});</script></head>')
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,device_scale_factor=1,has_touch=True)
    page=context.new_page();page.set_content(html);page.wait_for_selector('[data-tab="world"]')
    page.evaluate('''()=>{
       const p=project(), c=chapter(), b=window.StoryWeavePlotCore.createBranch({newId:'illustration-branch',projectId:p.id,chapterId:c.id,title:'另一种结局 · 沈雾的决定',premise:'沈雾在旧书店门口坦白了自己的调查，而林澈决定相信她。',baseText:c.text,created:time()});
       b.draft+='\\n\\n沈雾摘下围巾。\\n\\n“我知道是谁给你写的信。”她说。\\n\\n林澈没有接话。店里的钟停了，窗外的雨反而更大。';
       state.storyBranches=[b];state.canonFacts=[{id:'screenshot-fact',projectId:p.id,title:'那封信的真正来源',truth:'仅作者知道的答案',views:{},created:time()}];
       state.knowledgeProposals=[{id:'screenshot-approval',projectId:p.id,branchId:b.id,roleId:characters()[0].id,factId:'screenshot-fact',targetStatus:'suspected',status:'pending',belief:'有人在刻意引导他回到车站',reason:'沈雾说出有关那封信的信息',expectedViewSignature:'null',created:time()}];
       go('world');
    }''')
    page.screenshot(path=str(R/'v09-world-preview.png'),full_page=True)
    page.locator('[data-action="sw9-branch"]').click()
    page.wait_for_selector('#sw9Draft')
    page.screenshot(path=str(R/'v09-branch-preview.png'),full_page=True)
    page.locator('#modalClose').click()
    page.locator('[data-tab="skills"]').click()
    page.screenshot(path=str(R/'v09-skills-preview.png'),full_page=True)
    print('Screenshots:',[(p.name,p.stat().st_size) for p in [R/'v09-world-preview.png',R/'v09-branch-preview.png',R/'v09-skills-preview.png']])
    browser.close()
