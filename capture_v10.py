from pathlib import Path
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parent;W=R/'web'
html=(W/'index.html').read_text().replace('<link rel="stylesheet" href="styles.css"/>','<style>'+ (W/'styles.css').read_text()+'</style>')
for f in ['app.js','v05.js','v06.js','v07.js','distill-core.js','v08.js','plot-core.js','v09.js','narrative-core.js','v10.js']:
 html=html.replace(f'<script src="{f}" defer></script>','<script>'+ (W/f).read_text().replace('</script>',r'<\/script>')+'</script>')
html=html.replace('</head>','<script>const __storage={};Object.defineProperty(window,"localStorage",{configurable:true,value:{getItem(k){return __storage[k]??null},setItem(k,v){__storage[k]=String(v)},removeItem(k){delete __storage[k]}}});</script></head>')
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=b.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
 page.set_content(html);page.wait_for_selector('[data-tab="world"]')
 page.evaluate('''()=>{const p=project(),c=p.chapters,chars=state.characters.filter(x=>x.projectId===p.id),r=state.relations.filter(x=>x.projectId===p.id)[0];state.plots=[{id:'p1',projectId:p.id,title:'十三年前的失踪车票',type:'伏笔',status:'发展中',note:'车票上的日期与失踪案相同'}];state.plotChapterLinks=[{id:'l1',projectId:p.id,plotId:'p1',chapterId:c[0].id,stage:'planted',note:'首次出现'},{id:'l2',projectId:p.id,plotId:'p1',chapterId:c[1].id,stage:'developed',note:'记者找到相关记录'}];state.relationshipHistory=[];state.timelineEvents=[{id:'e1',projectId:p.id,title:'失踪列车最后一次发车',type:'历史背景',storyDate:'2013-10-21',chapterId:c[0].id,location:'雾城旧站',participants:[],description:'列车离站后再未抵达终点。',isFlashback:false},{id:'e2',projectId:p.id,title:'林澈发现旧车票',type:'剧情事件',storyDate:'2026-11-08',chapterId:c[0].id,location:'旧书店',participants:chars.slice(0,1).map(x=>x.id),description:'旧车票再次出现。',isFlashback:false}];if(r){r.initialType=r.type;r.initialTrust=0;state.relationshipHistory=[{id:'rh1',projectId:p.id,relationId:r.id,a:r.a,b:r.b,chapterId:c[0].id,beforeType:r.type,beforeTrust:0,afterType:'互相试探',afterTrust:18,cause:'两人发现彼此都隐瞒了信息。',created:new Date().toISOString()}];r.type='互相试探';r.trust=18;}}''')
 page.locator('[data-tab="world"]').click();page.screenshot(path=str(R/'v10-world-preview.png'),full_page=True)
 page.locator('[data-action="v10-plot-links"]').click();page.screenshot(path=str(R/'v10-foreshadow-preview.png'),full_page=True)
 page.locator('#modalClose').click();page.locator('[data-action="v10-relation-history"]').click();page.screenshot(path=str(R/'v10-relationship-preview.png'),full_page=True)
 page.locator('#modalClose').click();page.locator('.world-tile[data-action="v10-timeline"]').click();page.screenshot(path=str(R/'v10-timeline-preview.png'),full_page=True)
 page.locator('#modalClose').click();page.locator('[data-tab="write"]').click();page.screenshot(path=str(R/'v10-writer-preview.png'),full_page=True)
 b.close()
