"""v1.0 mobile browser end-to-end tests. AI calls are mocked, not real model validation."""
from pathlib import Path
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parent; W=R/'web'
html=(W/'index.html').read_text()
html=html.replace('<link rel="stylesheet" href="styles.css"/>','<style>'+ (W/'styles.css').read_text() + '</style>')
files=['app.js','v05.js','v06.js','v07.js','distill-core.js','v08.js','plot-core.js','v09.js','narrative-core.js','v10.js']
for file in files:
    html=html.replace(f'<script src="{file}" defer></script>','<script>'+ (W/file).read_text().replace('</script>',r'<\/script>')+'</script>')
html=html.replace('</head>', '<script>const __storage={};Object.defineProperty(window,"localStorage",{configurable:true,value:{getItem(k){return __storage[k]??null},setItem(k,v){__storage[k]=String(v)},removeItem(k){delete __storage[k]}}});</script></head>')
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=1)
    page=context.new_page();errors=[]
    page.on('pageerror',lambda err:errors.append(str(err)))
    page.set_content(html);page.wait_for_selector('[data-tab="world"]')
    page.evaluate('''()=>{
      window.__auditPayload='';
      chatAPI=async function(system,prompt){
        if(system.includes('长篇小说连续性审稿编辑')){
          window.__auditPayload=prompt;const d=JSON.parse(prompt),ch=d.chapters[0];
          return JSON.stringify({findings:[{chapterId:ch.id,severity:'warning',title:'人物信息来源需要核对',detail:'本章这句话可能让人物掌握了尚未交代来源的信息，请核对前文。',quote:ch.text.slice(0,Math.min(24,ch.text.length)),suggestion:'补充人物获得信息的过程。'}]});
        }
        return '{}';
      };
      const p=project(),c=p.chapters;if(c.length<3)c.push({id:'chapter3-v10',title:'第三章 · 新线索',text:'这一章继续调查失踪列车。'.repeat(12),history:[],updated:time()});
      state.plots=[{id:'plot-v10',projectId:p.id,title:'十三年前的车票',type:'伏笔',status:'发展中',note:'车票来源尚未揭示'}];
      state.plotChapterLinks=[];state.relationshipHistory=[];state.timelineEvents=[];state.auditFindings=[];state.events=[{id:'legacy-event-v10',projectId:p.id,title:'旧版记录保留',description:'这是旧版录入记录，不等于故事内日期。',created:time()}];
      state.relations=state.relations.map(r=>({...r,initialType:undefined}));
      state.characters.forEach(r=>{if(r.name==='林澈')r.secret='秘密：不允许发送到 AI 审查 payload';});
    }''')
    # Chapter-level foreshadow links
    page.locator('[data-tab="world"]').click()
    page.locator('[data-action="v10-plot-links"]').click()
    page.locator('#v10CreateLink').click()
    page.locator('[name="plot"]').select_option('plot-v10')
    page.locator('[name="chapter"]').select_option(page.evaluate('project().chapters[0].id'))
    page.locator('[name="stage"]').select_option('planted')
    page.locator('[name="note"]').fill('第一章在书店出现车票')
    page.locator('#v10SaveLink').click()
    page.wait_for_function("state.plotChapterLinks.length===1")
    page.locator('#modalClose').click()
    page.locator('[data-action="v10-plot-links"]').click()
    page.locator('#v10CreateLink').click()
    page.locator('[name="chapter"]').select_option(page.evaluate('project().chapters[1].id'))
    page.locator('[name="stage"]').select_option('payoff')
    page.locator('[name="note"]').fill('第二章揭示车票来历')
    page.locator('#v10SaveLink').click()
    page.wait_for_function("state.plotChapterLinks.length===2")
    assert page.evaluate("StoryWeaveNarrativeCore.auditPlotLinks(state.plots,state.plotChapterLinks,project().chapters).length") == 0
    page.locator('#modalClose').click()
    # Relationship history and point-in-story reconstruction
    page.locator('[data-action="v10-relation-history"]').click()
    page.locator('#v10AddRelation').click()
    relation_id=page.evaluate('state.relations[0].id')
    page.locator('[name="relation"]').select_option(relation_id)
    page.locator('[name="chapter"]').select_option(page.evaluate('project().chapters[0].id'))
    page.locator('[name="afterType"]').fill('互相试探')
    page.locator('[name="afterTrust"]').fill('22')
    page.locator('[name="aAttitude"]').fill('愿意合作但保留')
    page.locator('[name="bAttitude"]').fill('仍然怀疑对方')
    page.locator('[name="cause"]').fill('两人发现对方都隐瞒了车票来源')
    page.locator('#v10SaveRelation').click()
    page.wait_for_function("state.relationshipHistory.length===1")
    assert page.evaluate("rid=>state.relations.find(x=>x.id===rid).type",relation_id)=='互相试探'
    assert page.evaluate("rid=>StoryWeaveNarrativeCore.relationStateAt(state.relations.find(x=>x.id===rid),project().chapters[0].id,project().chapters,state.relationshipHistory).trust",relation_id)==22
    page.locator('#modalClose').click()
    # World event chronology with explicit flashback handling
    page.locator('.world-tile[data-action="v10-timeline"]').click()
    page.locator('#v10NewEvent').click()
    page.locator('[name="title"]').fill('车票首次出现')
    page.locator('[name="storyDate"]').fill('1042-01-03')
    page.locator('[name="chapter"]').select_option(page.evaluate('project().chapters[0].id'))
    page.locator('[name="location"]').fill('雾城旧书店')
    page.locator('[name="description"]').fill('林澈在门口发现车票。')
    page.locator('#v10SaveEvent').click();page.wait_for_function("state.timelineEvents.length===1")
    page.locator('#v10NewEvent').click()
    page.locator('[name="title"]').fill('录音公开')
    page.locator('[name="storyDate"]').fill('1041-12-01')
    page.locator('[name="chapter"]').select_option(page.evaluate('project().chapters[1].id'))
    page.locator('[name="description"]').fill('沈雾公开了录音。')
    page.locator('#v10SaveEvent').click();page.wait_for_function("state.timelineEvents.length===2")
    assert page.evaluate("StoryWeaveNarrativeCore.auditTimeline(state.timelineEvents,project().chapters).some(x=>x.id.includes('time-reverse'))")
    assert '早期记录' in page.locator('#modalRoot').inner_text() and '旧版记录保留' in page.locator('#modalRoot').inner_text()
    page.locator('#modalClose').click()
    # Deterministic and AI audit, with explicit consent and exact quote verification
    page.locator('[data-action="v10-audit"]').click()
    page.locator('[name="auditChapter"]').first.check()
    assert page.locator('#v10RunAudit').is_disabled()
    page.locator('#v10AuditConsent').check()
    page.once('dialog',lambda d:d.accept())
    page.locator('#v10RunAudit').click()
    page.wait_for_function("state.auditFindings.length===1")
    assert page.evaluate("state.auditFindings[0].status")=='pending'
    assert '秘密：不允许发送到 AI 审查 payload' not in page.evaluate('__auditPayload')
    page.locator('#v10ReviewFindings').click()
    page.locator('[data-v10-finding="acknowledged"]').click()
    page.wait_for_function("state.auditFindings[0].status==='acknowledged'")
    page.locator('#modalClose').click()
    # On-device IRIDIS mode respects its smaller context budget and limits one audit to two chapters.
    page.evaluate("state.settings.aiProvider='iridis';state.settings.localContextChars=4000")
    page.locator('[data-tab="world"]').click();page.locator('[data-action="v10-audit"]').click()
    picks=page.locator('[name="auditChapter"]')
    assert picks.count()>=3
    picks.nth(0).check();picks.nth(1).check();picks.nth(2).click()
    assert not picks.nth(2).is_checked()
    page.locator('#modalClose').click()
    page.evaluate("state.settings.aiProvider='cloud'")
    # Writer panel shows chapter-related information.
    page.locator('[data-tab="write"]').click()
    page.wait_for_selector('.sw10-chapter')
    assert '本章关联资料' in page.locator('.sw10-chapter').inner_text()
    # Backup schema keeps valid new records and rejects cross-project references.
    assert page.evaluate('''()=>{const d={...state,plotChapterLinks:[...state.plotChapterLinks,{id:'bad',projectId:'foreign',plotId:'plot-v10',chapterId:project().chapters[0].id,stage:'planted'}]};const n=normalizeBackup(d);return n.plotChapterLinks.length===2&&n.relationshipHistory.length===1&&n.timelineEvents.length===2&&n.auditFindings.length===1}''')
    # Legacy single-chapter plot references are migrated without losing the old record.
    page.evaluate('''()=>{const c=project().chapters[0];state.plots.push({id:'legacy-plot',projectId:state.selected,title:'旧版伏笔',status:'发展中',chapterId:c.id});state.plotChapterLinks=state.plotChapterLinks.filter(x=>x.plotId!=='legacy-plot');}''')
    page.locator('[data-tab="world"]').click()
    page.wait_for_function("state.plotChapterLinks.some(x=>x.plotId==='legacy-plot')")
    assert page.evaluate("state.plots.find(x=>x.id==='legacy-plot').chapterId===project().chapters[0].id")
    assert not errors,errors
    print('PASS v1.0 UI: multi-chapter foreshadow links, relationship history and trust reconstruction, story chronology, explicit-consent AI audit, exact-quote validation, private-secret exclusion, author review, backup normalization, mobile no-JS-errors')
    browser.close()
