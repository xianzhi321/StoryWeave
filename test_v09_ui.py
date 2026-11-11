"""v0.9 mobile browser end-to-end tests. Model calls mocked; no real network."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import tempfile
R=Path(__file__).resolve().parent; W=R/'web'
html=(W/'index.html').read_text()
html=html.replace('<link rel="stylesheet" href="styles.css"/>','<style>'+ (W/'styles.css').read_text() + '</style>')
for file in ['app.js','v05.js','v06.js','v07.js','distill-core.js','v08.js','plot-core.js','v09.js']:
    html=html.replace(f'<script src="{file}" defer></script>','<script>'+ (W/file).read_text().replace('</script>',r'<\/script>')+'</script>')
html=html.replace('</head>', '<script>const __storage={};Object.defineProperty(window,"localStorage",{configurable:true,value:{getItem(k){return __storage[k]??null},setItem(k,v){__storage[k]=String(v)},removeItem(k){delete __storage[k]}}});</script></head>')
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=1)
    page=context.new_page();errors=[]
    page.on('pageerror',lambda err:errors.append(str(err)))
    page.set_content(html);page.wait_for_selector('[data-tab="world"]')
    page.evaluate('''()=>{
       window.__aiCalls=[];
       chatAPI=async function(system,prompt){window.__aiCalls.push({system,prompt});
         if(system.includes('辅助小说作者审查')){const d=JSON.parse(prompt);return JSON.stringify({changes:[{roleId:d.roles[0].roleId,factId:d.facts[0].factId,status:'suspected',belief:'他认为信件被人伪造',reason:'人物在会面中直接表示对信件来源的怀疑'}]});}
         if(system.includes('写作编辑'))return JSON.stringify({title:'用动作带出冲突',category:'个性化写作',description:'把人物直接解释的心理改写为有因果关系的行为细节',situation:'人物对话与悬疑场景',rules:['使用人物可察觉到的动作描写替代直接解释','在对白中保留可以推断人物动机的线索']});
         return '林澈拿起那张车票，递给她。钟声响起时，沈雾仍没有伸手。';
       };
       state.canonFacts=[{id:'fact9',projectId:state.selected,title:'秘密来信',truth:'真正来自沈雾',views:{},created:time()}];
    }''')
    page.locator('[data-tab="world"]').click();page.locator('[data-action="sw9-new"]').click()
    page.locator('[name="title"]').fill('另外一条路');page.locator('[name="premise"]').fill('沈雾提前接到了来信')
    page.locator('#sw9Create').click();page.wait_for_selector('#sw9Draft')
    branch=page.evaluate('state.storyBranches.at(-1).id')
    main_text=page.evaluate('project().chapters[0].text')
    page.locator('#sw9Draft').fill('另一条故事分支的正文，不应写入原章节。')
    page.locator('#sw9SaveDraft').click()
    page.wait_for_function("state.storyBranches.at(-1).draft.includes('另一条故事分支')")
    assert page.evaluate('project().chapters[0].text')==main_text
    # AI can suggest a knowledge change, but cannot commit it without author approval.
    page.once('dialog',lambda d:d.accept())
    page.locator('#sw9Suggest').click()
    page.wait_for_selector('#sw9QueueSuggested')
    page.locator('#sw9QueueSuggested').click()
    page.wait_for_function('state.knowledgeProposals.length===1')
    assert page.evaluate('Object.keys(state.canonFacts[0].views).length')==0
    page.locator('#modalClose').click()
    page.locator('[data-action="sw9-branch"]').click()
    # Create a proposal, approve it, and ensure only then canon is updated.
    page.locator('#sw9Knowledge').click();page.wait_for_selector('#sw9SubmitKnowledge')
    page.locator('[name="status"]').select_option('suspected')
    page.locator('[name="belief"]').fill('他认为车票只是一场恶作剧')
    page.locator('#sw9SubmitKnowledge').click()
    page.wait_for_function('state.knowledgeProposals.length===2')
    assert page.evaluate('Object.keys(state.canonFacts[0].views).length')==0
    page.locator('[data-action="sw9-proposals"]').click()
    page.once('dialog',lambda d:d.accept())
    page.locator('[data-review="approve"]').first.click()
    page.wait_for_function("state.knowledgeProposals.some(p=>p.status==='approved')")
    assert page.evaluate('Object.values(state.canonFacts[0].views)[0].status')=='suspected'
    # Conflict protection: if the original chapter changes, promotion is disabled.
    page.locator('#modalClose').click()
    page.evaluate("project().chapters[0].text+='（刚刚在正式正文里改了一句）'")
    page.locator('[data-action="sw9-branch"]').first.click();page.wait_for_selector('#sw9Promote')
    assert page.locator('#sw9Promote').is_disabled()
    page.locator('#modalClose').click()
    # Create a new branch after the changed main; promoting must save a history snapshot.
    page.locator('[data-action="sw9-new"]').click()
    page.locator('[name="title"]').fill('恢复章节')
    page.locator('#sw9Create').click();page.wait_for_selector('#sw9Draft')
    page.locator('#sw9Draft').fill('作者认可的新章节内容。')
    page.locator('#sw9SaveDraft').click()
    page.wait_for_function("state.storyBranches.at(-1).draft==='作者认可的新章节内容。'")
    before=page.evaluate('project().chapters[0].text')
    page.once('dialog',lambda d:d.accept())
    page.locator('#sw9Promote').click()
    page.wait_for_function("project().chapters[0].text==='作者认可的新章节内容。'")
    assert page.evaluate('project().chapters[0].history[0].text')==before
    # User feedback learner. No original text is written to persistent records.
    page.locator('[data-tab="skills"]').click();page.locator('[data-action="sw9-learn"]').click()
    before_sample='这件事让他很悲伤，他实在不愿意承认自己伤心。他一时间想了很多很多。'
    after_sample='他没再看那封信，只把纸折了两次塞进衣袋。出门时，他将灯也忘了关。'
    page.locator('#sw9Before').fill(before_sample);page.locator('#sw9After').fill(after_sample)
    assert page.locator('#sw9Analyze').is_disabled()
    page.locator('#sw9FeedbackConsent').check();page.locator('#sw9Analyze').click()
    page.wait_for_selector('#sw9SaveLearning');page.locator('#sw9SaveLearning').click()
    page.wait_for_function("state.skills.some(s=>s.analysisType==='author-feedback')")
    new_skill=page.evaluate("state.skills.find(s=>s.analysisType==='author-feedback')")
    assert new_skill['status']=='candidate'
    assert before_sample not in str(page.evaluate('state.writingFeedback'))
    assert after_sample not in str(page.evaluate('state.writingFeedback'))
    # Backup normalization retains new v0.8 and v0.9 collections.
    page.evaluate('''()=>{state.skillPresets=[{id:'p9',projectId:state.selected,name:'备份测试',skillIds:[]}];state.distillationJobs=[{id:'d9',projectId:state.selected,docId:'doc',samples:[]}];}''')
    assert page.evaluate('''()=>{const n=normalizeBackup(state);return n.storyBranches.length===2&&n.knowledgeProposals.length===2&&n.writingFeedback.length===1&&n.distillationJobs.length===1&&n.skillPresets.length===1}''')
    assert not errors,errors
    with tempfile.TemporaryDirectory() as tmp:
        page.locator('[data-tab="world"]').click()
        page.screenshot(path=str(Path(tmp)/'v09-world.png'),full_page=True)
    print('PASS v0.9 UI: branch creation/edit, protected canon, approval, conflict, promotion with history, consented feedback->candidate, backup schema, responsive no JS exception')
    browser.close()
