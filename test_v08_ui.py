"""v0.8 mobile browser integration; model calls mocked and never reach external APIs."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import tempfile
ROOT=Path(__file__).resolve().parent
WEB=ROOT/'web'
SCRIPTS=['app.js','v05.js','v06.js','v07.js','distill-core.js','v08.js','v14.js','writing-prompts.js','v15.js']
html=(WEB/'index.html').read_text()
html=html.replace('<link rel="stylesheet" href="styles.css"/>','<style>'+(WEB/'styles.css').read_text()+'</style>')
for f in SCRIPTS:
    html=html.replace(f'<script src="{f}" defer></script>','<script>'+(WEB/f).read_text().replace('</script>',r'<\/script>')+'</script>')
# This browser document has an opaque origin, so mock a persistent localStorage.
html=html.replace('</head>', '<script>const __v08Storage={};Object.defineProperty(window,"localStorage",{configurable:true,value:{getItem(k){return __v08Storage[k]??null},setItem(k,v){__v08Storage[k]=String(v)},removeItem(k){delete __v08Storage[k]}}});</script></head>')
# Prevent actual network requests and collect inputs for validating skill recipes.
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=1,accept_downloads=True)
    page=context.new_page();errors=[]
    page.on('pageerror',lambda err:errors.append(str(err)))
    page.set_content(html)
    page.wait_for_selector('[data-tab="skills"]')
    # Use a non-repeating long book so chunks come from distinct positions.
    page.evaluate('''async()=>{
      const text=Array.from({length:140},(_,i)=>`第${i+1}段。钟楼的声音渐渐隐没，林澈留意到窗前的一把旧伞。\\n沈雾默默看了片刻，随后换了一个话题。\\n`).join('\\n');
      state.documents.push({id:'doc-v08',projectId:state.selected,title:'测试用原创小说',type:'txt',text,created:time()});
      if(db)await kvWrite('state',state);else localStorage.setItem('storyweave_fallback',JSON.stringify(state));
      window.__queries=[];window.__failOne=false;
      chatAPI=async function(system,prompt,max){
        window.__queries.push({system,prompt});
        if(system.includes('文学技法分析师')){
          if(window.__failOne){window.__failOne=false;return JSON.stringify({techniques:[{category:'场景细节',title:'细节揭示人物',description:'在环境中设置角色实际观察到的物件，推进故事发展',situation:'对话悬疑场景',rules:['选择有行为联系的细节','让人物对此作出反应'],quote:'从未出现过的幻觉证据',reason:'错误'}]});}
          const match=prompt.match(/<source_text>\\n([\\s\\S]*?)\\n<\\/source_text>/);
          if(!match)throw Error('prompt 没带源文');
          const line=match[1].split('\\n').find(s=>s.length>=16)||match[1];
          return JSON.stringify({techniques:[{category:'场景细节',title:'用细节使情节前进',description:'让角色注意到具体物件并由此产生行为，避免纯解释性叙述',situation:'悬疑冲突或人物会面',rules:['设置可信的可见细节','由人物行动带出线索'],quote:line.slice(0,13),reason:'原句展示了人物注意具体细节与行动'}]});
        }
        return '模型生成的原创写作片段，作为候选草稿。';
      };
      go('skills');
    }''')
    page.wait_for_selector('[data-action="distill"][data-id="doc-v08"]')
    page.locator('[data-action="distill"][data-id="doc-v08"]').click()
    page.wait_for_selector('#sw8ChunkCount')
    page.locator('#sw8ChunkCount').select_option('3')
    assert '3 个区段' in page.locator('#sw8PlanPreview').inner_text()
    assert page.locator('#sw8Start').is_disabled()
    page.locator('#sw8NewConsent').check()
    page.locator('#sw8Start').click()
    page.wait_for_selector('#sw8ResumeConsent')
    assert page.locator('#sw8Resume').is_disabled()
    # Simulate hallucinated quote on first try. Job must pause without progress.
    page.evaluate('window.__failOne=true')
    page.locator('#sw8ResumeConsent').check()
    page.locator('#sw8Resume').click()
    page.wait_for_function("document.querySelector('#sw8JobBody')?.textContent.includes('未找到能在本区段原文定位的证据')")
    assert page.evaluate("state.distillationJobs[state.distillationJobs.length-1].nextIndex") == 0
    assert page.evaluate('state.skills.filter(x=>x.analysisType==="evidence-pipeline").length')==0
    # Resume: mocked model returns exact short references.
    page.locator('#sw8ResumeConsent').check()
    page.locator('#sw8Resume').click()
    page.wait_for_function("state.distillationJobs.some(j=>j.docId==='doc-v08'&&j.status==='complete')",timeout=12000)
    assert page.evaluate('state.distillationJobs.at(-1).nextIndex')==3
    assert page.evaluate('state.distillationJobs.at(-1).validated.length')==3
    assert page.evaluate('state.skills.filter(x=>x.analysisType==="evidence-pipeline"&&x.status==="candidate").length')==1
    assert page.evaluate('state.skills.find(x=>x.analysisType==="evidence-pipeline").sourceCoverage')==3
    # No AI skill is automatically approved.
    page.locator('#modalClose').click()
    page.locator('[data-tab="skills"]').click()
    skill_id=page.evaluate('state.skills.find(x=>x.analysisType==="evidence-pipeline").id')
    page.locator(f'[data-action="skill"][data-id="{skill_id}"]').click()
    assert page.locator('#sw8EvidenceLink').is_visible()
    page.locator('#sw8EvidenceLink').click()
    assert page.locator('.sw8-proof').count()==3
    assert '位置有效' in page.locator('.sw8-proof').first.inner_text()
    page.locator('#modalClose').click()
    page.locator(f'[data-action="skill"][data-id="{skill_id}"]').click()
    page.locator('#saveSkill').click()
    assert page.evaluate('state.skills.find(x=>x.id==="'+skill_id+'").status')=='ready'
    # Preset combination and actual writing assistant selection.
    page.locator('[data-action="sw8-preset-new"]').click()
    page.locator('[name="presetName"]').fill('隐性线索技法')
    page.locator(f'[data-sw8-skill="{skill_id}"]').check()
    page.locator('#sw8SavePreset').click()
    assert page.evaluate('state.skillPresets.length')==1
    page.locator('[data-tab="write"]').click()
    page.locator('.sw14-editor-bar [data-action="ai-assist"]').click()
    page.get_by_text('附带资料与技能', exact=True).click()
    assert page.locator('#sw8ActivePreset').is_visible()
    preset_id=page.evaluate('state.skillPresets[0].id')
    page.locator('#sw8ActivePreset').select_option('preset:'+preset_id)
    page.locator('#sw8Ask').click()
    page.wait_for_selector('#sw8CopyAnswer')
    assert page.evaluate('window.__queries.at(-1).prompt.includes("用细节使情节前进")')
    page.locator('#modalClose').click()
    # A/B comparison requires explicit action and makes two distinct requests.
    page.locator('[data-tab="skills"]').click()
    page.locator('[data-action="sw8-abtest"]').click()
    page.locator('#sw8TestSkill').select_option(skill_id)
    page.locator('#sw8TestPrompt').fill('让角色围绕旧伞的来源发生争执')
    before=page.evaluate('window.__queries.length')
    page.locator('#sw8RunAB').click()
    page.wait_for_selector('#sw8CopyB')
    assert page.evaluate('window.__queries.length')==before+2
    assert page.locator('.sw8-ab-result>div').count()==2
    assert not errors,errors
    with tempfile.TemporaryDirectory() as tmp:
        page.locator('#modalClose').click()
        page.screenshot(path=tmp+'/v08-skills.png',full_page=True)
    print('PASS v0.8 UI: 3-sample async distillation, consent gate, unsupported evidence rejection without progress, resumable job, verified source offsets, candidate approval, evidence viewer, skill preset, writing assistant uses recipe, dual AI test, mobile UI, zero JS exceptions')
    browser.close()
