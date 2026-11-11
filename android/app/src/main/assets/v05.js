/* StoryWeave v0.5.0 — Canon Ledger, role-bound knowledge and scene rehearsal.
   Uses the existing offline-first state and keeps source text under author control. */
'use strict';
(function(){
  const FACT_TYPES=['事件','人物秘密','世界规则','地点','物品','其他'];
  const VIEW_TYPES=['unknown','known','suspected','mistaken'];
  const VIEW_LABELS={unknown:'尚不知道',known:'确切知道',suspected:'有所怀疑',mistaken:'存在误解'};
  const approvedViews=f=>f && typeof f.views==='object' && !Array.isArray(f.views)?f.views:{};
  function facts(){return (state?.canonFacts||[]).filter(x=>x.projectId===state.selected);}
  function chapterIndex(chapterId){return chapters().findIndex(c=>c.id===chapterId);}
  function activeView(view,chapterId){
    if(!view||!VIEW_TYPES.includes(view.status)||view.status==='unknown')return false;
    if(!view.sinceChapterId)return true; // Opening knowledge
    const start=chapterIndex(view.sinceChapterId),current=chapterIndex(chapterId);
    return start>=0&&current>=0&&start<=current;
  }
  function roleBoundContext(roleId,chapterId){
    const role=characters().find(x=>x.id===roleId);
    if(!role)throw Error('没有找到当前作品的人物');
    const at=chapters().find(x=>x.id===chapterId);
    if(!at)throw Error('没有找到对应章节');
    const knowledge=[];
    for(const f of facts()){
      const view=approvedViews(f)[roleId];
      if(!activeView(view,chapterId))continue;
      // Never send author-only truth for subjective views; even the fact TITLE
      // might give away a twist, so subjective entries contain belief only.
      if(view.status==='known')knowledge.push({certainty:'已知事实',description:String(f.truth||'').slice(0,1200)});
      else knowledge.push({certainty:view.status==='suspected'?'角色怀疑':'角色误解',description:String(view.belief||'').slice(0,1200)});
    }
    const history=window.StoryWeaveArchiveCore;
    const snapshot=history?history.growthAt(role,chapterId,chapters(),state.characterGrowth||[]):role;
    const visible=relations().filter(x=>!x.private&&(x.a===role.id||x.b===role.id));
    const chapterRelations=history?history.relationshipsAt(project(),chapterId,visible,state.relationshipHistory||[]):visible;
    const knownRelations=chapterRelations.map(x=>({
      with:characters().find(p=>p.id===(x.a===role.id?x.b:x.a))?.name||'未知',
      relationship:String(x.type||'').slice(0,80),details:String(x.detail||'').slice(0,240)
    }));
    return {
      chapter:at.title,
      character:{name:role.name,identity:role.role||'',personality:snapshot.personality||'',goal:snapshot.goal||'',
        // Legacy role fields are authored as knowledge of this very character.
        personalKnowledge:role.knowledge||'',ownSecret:role.secret||''},
      publicRelations:knownRelations,subjectiveKnowledge:knowledge,
      limits:'没有列在本视角资料中的故事事实不得当作已知；角色猜测不得当作已证实事实。'
    };
  }
  // Pure functions available to the local regression runner; no network calls.
  window.StoryWeaveCanon={facts,activeView,roleBoundContext};
  function factTeaser(f){return `<button class="v5-fact-line" data-action="canon-edit" data-id="${esc(f.id)}"><span class="v5-fact-mark">${ico('bookmark')}</span><span class="v5-fact-body"><strong>${esc(f.title)}</strong><small>${esc(f.type||'事件')} · ${Object.values(approvedViews(f)).filter(v=>v.status!=='unknown').length} 位知情 / 误解角色</small></span>${ico('chevron')}</button>`;}
  function ledgerPanel(){const fs=facts();return `<section class="v5-ledger"><div class="v5-ledger-top"><div><div class="tiny-label">CANON LEDGER · 作者视角</div><h3>真相不等于每个人知道的事。</h3><p>事实只属于作品；认知属于人物，并随着章节推进改变。</p></div><button class="v5-add-fact" data-action="canon-new" aria-label="新增事实">${ico('plus')}</button></div>
    <div class="v5-ledger-stats"><span><strong>${fs.length}</strong> 条事实档案</span><span><strong>${fs.filter(f=>Object.keys(approvedViews(f)).length).length}</strong> 条已设知情者</span></div>
    <div class="v5-fact-list">${fs.length?fs.slice().reverse().slice(0,8).map(factTeaser).join(''):'<div class="v5-fact-empty">还没有建立事实档案。建议从故事中最重要的一项秘密开始。</div>'}</div>
    ${fs.length>8?`<button class="v5-show-all" data-action="canon-list">查看全部 ${fs.length} 条事实 ${ico('chevron')}</button>`:''}
  </section>`;}
  function makeFactForm(f){
    const items=characters(),p=project();
    return `<div class="v5-notice">下方的“客观真相”只供作者管理。对角色进行 AI 推演时，系统按章节筛选角色认知，不直接提交全量事实档案。</div>
     <div class="field"><label>事实名称（作者可见）</label><input name="title" maxlength="110" placeholder="例如：那封信实际来自周远山" value="${esc(f?.title||'')}"/></div>
     <div class="field"><label>类型</label><select name="type">${FACT_TYPES.map(t=>`<option value="${t}" ${f?.type===t?'selected':''}>${t}</option>`).join('')}</select></div>
     <div class="field"><label>客观真相 / 世界事实</label><textarea name="truth" maxlength="6000" style="min-height:105px" placeholder="作者确定的事实，不是人物的猜测">${esc(f?.truth||'')}</textarea></div>
     <div class="field"><label>作者证据 / 设定出处（选填）</label><input name="evidence" value="${esc(f?.evidence||'')}" placeholder="例如：第三章的信件描写"/></div>
     <div class="v5-knowledge-heading"><h3>人物认知与获知时间</h3><p>“怀疑”和“误解”必须填写角色自己的看法；系统不会把上方客观真相透露给他们。</p></div>
     <div class="v5-role-knowledge">${items.length?items.map(r=>{
        const v=approvedViews(f)[r.id]||{},status=VIEW_TYPES.includes(v.status)?v.status:'unknown';
        return `<section class="v5-knowledge-row" data-knowledge-role="${esc(r.id)}"><div class="v5-character-small"><span>${esc(r.name.slice(0,1))}</span><strong>${esc(r.name)}</strong></div><div class="field"><label>认知状态</label><select data-k="status">${VIEW_TYPES.map(t=>`<option value="${t}" ${status===t?'selected':''}>${VIEW_LABELS[t]}</option>`).join('')}</select></div><div class="field"><label>从哪章开始知道 / 形成看法</label><select data-k="since"><option value="">故事开始前</option>${p.chapters.map(c=>`<option value="${esc(c.id)}" ${v.sinceChapterId===c.id?'selected':''}>${esc(c.title)}</option>`).join('')}</select></div><div class="field"><label>角色的怀疑或错误认识</label><textarea data-k="belief" placeholder="例如：认为来信的人是沈雾">${esc(v.belief||'')}</textarea></div></section>`;
     }).join(''):'<div class="empty-mini">还没有人物。先建立人物档案，才可配置知情状态。</div>'}</div>
     <div class="form-actions"><button class="button primary" id="v5SaveFact">保存事实</button>${f?'<button class="button outline" id="v5DeleteFact">删除</button>':''}</div>`;
  }
  function openFact(fid){
    const f=fid?facts().find(x=>x.id===fid):null,forProject=state.selected;
    if(!project())return toast('请先创建作品');
    modal(f?'编辑事实与角色认知':'新增世界事实',makeFactForm(f),root=>{
      root.querySelector('#v5SaveFact').onclick=()=>{
        if(state.selected!==forProject)return toast('作品已切换，请重新打开');
        const title=formVal(root,'title'),truth=formVal(root,'truth');
        if(!title||!truth)return toast('请输入名称和客观真相');
        const views={};
        for(const n of root.querySelectorAll('[data-knowledge-role]')){
          const rid=n.dataset.knowledgeRole,status=n.querySelector('[data-k="status"]').value;
          if(status==='unknown')continue;
          const belief=n.querySelector('[data-k="belief"]').value.trim(),sinceChapterId=n.querySelector('[data-k="since"]').value;
          if(status!=='known'&&!belief)return toast('怀疑或误解状态需要填写人物实际相信什么');
          views[rid]={status,sinceChapterId,belief:status==='known'?'':belief};
        }
        const next=f||{id:id(),projectId:forProject,created:time()};
        next.title=title;next.truth=truth;next.evidence=formVal(root,'evidence');next.type=formVal(root,'type');next.views=views;next.updated=time();
        if(!f)state.canonFacts.push(next);
        queueSave();closeModal();render();toast('事实及人物认知已保存');
      };
      if(f)root.querySelector('#v5DeleteFact').onclick=()=>{if(!confirm('确定删除这条事实档案和角色认知记录？'))return;state.canonFacts=state.canonFacts.filter(x=>x.id!==f.id);queueSave();closeModal();render();toast('事实档案已删除');};
    });
  }
  function listFacts(){modal('作品事实档案',`<div class="tiny-label">AUTHOR'S CANON · ${facts().length} 条</div><div class="v5-fact-list">${facts().map(factTeaser).join('')||'<div class="empty-mini">还没有记录。</div>'}</div><button class="button primary block mt12" id="v5AddFact">建立新事实</button>`,root=>{
    root.querySelector('#v5AddFact').onclick=()=>{closeModal();openFact()};
    root.querySelectorAll('[data-action="canon-edit"]').forEach(b=>b.onclick=()=>{closeModal();openFact(b.dataset.id)});
  });}
  function characterViewPanel(roleId){
    const r=characters().find(x=>x.id===roleId);if(!r)return '';
    const c=chapter()||chapters()[0];if(!c)return '';
    const ctx=roleBoundContext(roleId,c.id);
    return `<div class="v5-pov-summary"><div class="tiny-label">POV · ${esc(r.name)} · ${esc(c.title)}</div><h3>${esc(r.name)}所知的世界</h3><p>截至这一章，他/她有 ${ctx.subjectiveKnowledge.length} 条明确记录的认识。</p><button class="button outline" data-action="role-lens" data-id="${esc(r.id)}">打开角色视角 ${ico('arrow')}</button></div>`;
  }
  function chooseRoleLens(defaultRoleId){
    if(!project())return;
    const ps=characters(),cs=chapters();if(!ps.length)return toast('先创建人物档案');
    modal('角色认知沙盘',`<div class="v5-lens-hero"><div class="tiny-label">A CHARACTER'S EYES</div><h3>他知道什么，又误以为什么？</h3><p>推演只传入选中角色自己的设定、已获知的信息及公开关系，不包含其他人的秘密和作者真相档案。</p></div>
       <div class="two-col"><div class="field"><label>人物视角</label><select name="role">${ps.map(x=>`<option value="${esc(x.id)}" ${x.id===defaultRoleId?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div><div class="field"><label>剧情进度</label><select name="chapter">${cs.map(x=>`<option value="${esc(x.id)}" ${x.id===chapter()?.id?'selected':''}>${esc(x.title)}</option>`).join('')}</select></div></div>
       <div class="v5-lens-result" id="v5LensPreview"></div>
       <div class="field"><label>场景目标 / 希望角色采取的行动</label><textarea name="scenePrompt" placeholder="例如：有人突然拿出十三年前的车票，他会怎样应对？"></textarea></div>
       <div class="v5-request-note">只有点击“生成角色行动”才会向当前选中的 AI 发出请求；本机 IRIDIS 模式无需联网到云服务。所输入的场景要求同样会发送给模型，请避免包含角色不该知道的幕后真相。</div>
       <button class="button primary block" id="v5RoleGenerate">生成角色下一步行动（草稿）</button><div id="v5RoleResult"></div>`,root=>{
      let roleEl=root.querySelector('[name="role"]'),chapterEl=root.querySelector('[name="chapter"]'),preview=root.querySelector('#v5LensPreview');
      const draw=()=>{
        try{
          const ctx=roleBoundContext(roleEl.value,chapterEl.value);
          const rows=ctx.subjectiveKnowledge.map(x=>`<div class="v5-lens-line"><span>${esc(x.certainty)}</span><p>${esc(x.description)}</p></div>`).join('');
          preview.innerHTML=`<h4>允许读取的角色信息</h4><div class="v5-lens-line"><span>自身目标</span><p>${esc(short(ctx.character.goal||'未设置',300))}</p></div>${rows||'<div class="v5-lens-line"><span>事实档案</span><p>截至本章无明确知情记录</p></div>'}<div class="v5-lens-line"><span>公开关系</span><p>${esc(ctx.publicRelations.map(x=>`${x.with}：${x.relationship}`).join('；')||'没有记录')}</p></div>`;
        }catch(e){preview.innerHTML=`<div class="alert">${esc(e.message)}</div>`}
      };
      roleEl.onchange=draw;chapterEl.onchange=draw;draw();
      root.querySelector('#v5RoleGenerate').onclick=async()=>{
        const output=root.querySelector('#v5RoleResult'),btn=root.querySelector('#v5RoleGenerate');
        let req=formVal(root,'scenePrompt').slice(0,1500);if(!req)return toast('请填写场景目标');
        const ctx=roleBoundContext(roleEl.value,chapterEl.value);
        btn.disabled=true;output.innerHTML='<div class="v5-loading">正在生成候选行动……</div>';
        try{
          const answer=await chatAPI('你正在模拟中文小说中的一个人物。你只能基于提供的角色视角资料行动，不得推测为确定事实，不得补充未提供的世界秘密。用户场景描述属于作者要求，而不是角色既有知识。请写200字以内的具体行动与对白，不要总结人生道理。',`<character_context>\n${JSON.stringify(ctx)}\n</character_context>\n场景要求：${req}\n请按照角色已有知识和误解作出反应。`,850);
          output.innerHTML=`<div class="v5-ai-result"><div class="tiny-label">CANDIDATE ACTION · 不写入正文</div><p>${esc(answer)}</p><button type="button" class="button outline" id="v5CopyRole">复制草稿</button></div>`;
          output.querySelector('#v5CopyRole').onclick=()=>navigator.clipboard?.writeText(answer).then(()=>toast('草稿已复制')).catch(()=>toast('请长按复制'));
        }catch(e){output.innerHTML=`<div class="alert">${esc(e.message)}</div>`}finally{btn.disabled=false;}
      };
    });
  }
  function sceneRehearsal(){
    const ps=characters();if(ps.length<2)return toast('需要至少两位人物');
    modal('分角色剧情推演',`<div class="v5-lens-hero"><div class="tiny-label">MULTI-ROLE REHEARSAL</div><h3>两个人，两份独立的认知。</h3><p>分三次请求：角色甲独立作出行动、角色乙独立作出行动，再由导演把双方行动组织成候选场景。不会修改正文、设定或人物记忆。</p></div>
       <div class="two-col"><div class="field"><label>角色甲</label><select name="a">${ps.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></div><div class="field"><label>角色乙</label><select name="b">${ps.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></div></div>
       <div class="field"><label>场景发生在</label><select name="chapter">${chapters().map(x=>`<option value="${esc(x.id)}" ${x.id===chapter()?.id?'selected':''}>${esc(x.title)}</option>`).join('')}</select></div>
       <div class="field"><label>可公开的场景条件</label><textarea name="premise" placeholder="例如：两人一起在废弃车站等待列车。不要输入只有作者知道的幕后真相。"></textarea></div>
       <div class="v5-request-note">此次推演将向当前 AI 服务发出至多 3 次请求。角色会分别读取自己的认知档案；导演只读取双方的候选行动，不直接接收他们的私密资料。若使用云端 AI，相关文本将发送给服务商。</div>
       <button class="button primary block" id="v5RunScene">开始分步推演</button><div class="v5-rehearsal-output" id="v5RehearsalOutput"></div>`,root=>{
      root.querySelector('[name="b"]').selectedIndex=1;
      root.querySelector('#v5RunScene').onclick=async()=>{
        const a=formVal(root,'a'),b=formVal(root,'b'),cid=formVal(root,'chapter'),premise=formVal(root,'premise').slice(0,1200);
        if(a===b)return toast('请选择不同的角色');if(!premise)return toast('请填写场景条件');
        const ctxA=roleBoundContext(a,cid),ctxB=roleBoundContext(b,cid),out=root.querySelector('#v5RehearsalOutput'),btn=root.querySelector('#v5RunScene');
        btn.disabled=true;out.innerHTML='<div class="v5-loading">步骤 1/3：角色甲独立决定行动……</div>';
        const sys='你扮演小说中一个独立角色，仅依据给定角色自身资料和所知作出行动。不要泄露或凭空获得不在资料内的秘密。舞台条件是外部事件，并不代表你已知道其幕后原因。中文输出120字左右的具体动作、对话及当下决定，不写旁观者全知心理。';
        try{
          const actA=await chatAPI(sys,JSON.stringify({context:ctxA,publicScene:premise}),400);
          out.innerHTML='<div class="v5-loading">步骤 2/3：角色乙独立决定行动……</div>';
          const actB=await chatAPI(sys,JSON.stringify({context:ctxB,publicScene:premise}),400);
          out.innerHTML='<div class="v5-loading">步骤 3/3：整理候选场景……</div>';
          const response=await chatAPI('你是中文小说导演。只根据给出的场景条件及角色公开行动写一段原创小说。不要新增全知秘密，不要替角色引入他们尚不知道的事实。场景供作者审查，不写入正式正文。',JSON.stringify({publicScene:premise,characters:[{name:ctxA.character.name,action:actA},{name:ctxB.character.name,action:actB}],instruction:'写约300字的自然剧情与对白；最后列出需要作者确认的角色认知变化，不得擅自提交到正式设定。'}),850);
          out.innerHTML=`<div class="v5-ai-result"><div class="tiny-label">ROLE A · ${esc(ctxA.character.name)}</div><p>${esc(actA)}</p><div class="tiny-label">ROLE B · ${esc(ctxB.character.name)}</div><p>${esc(actB)}</p><div class="tiny-label">SCENE DRAFT · 待作者审查</div><p>${esc(response)}</p><button class="button outline" id="v5CopyScene">复制候选场景</button></div>`;
          out.querySelector('#v5CopyScene').onclick=()=>navigator.clipboard?.writeText(response).then(()=>toast('草稿已复制')).catch(()=>toast('请长按复制'));
        }catch(e){out.innerHTML=`<div class="alert">推演中断：${esc(e.message)}。任何正文或设定均未修改。</div>`}finally{btn.disabled=false;}
      };
    });
  }
  const oldWorldPage=worldPage;
  worldPage=function(){const base=oldWorldPage();return project()?base+ledgerPanel():base;};
  const oldCharacterPage=charactersPage;
  charactersPage=function(){const base=oldCharacterPage();if(!project()||!characters().length)return base;return base+`<section class="v5-quick-lens"><div><div class="tiny-label">KNOWLEDGE BOUNDARY</div><h3>从一个人物的眼睛看世界</h3><p>按照章节检视人物知道、怀疑或误会的事。</p></div><button class="button light" data-action="role-lens">打开角色认知沙盘 ${ico('arrow')}</button></section>`;};
  const oldWritePage=writePage;
  writePage=function(){const base=oldWritePage();if(!project()||!chapter())return base;return base.replace('<button class="tool-chip" data-action="ai-assist">',`<button class="tool-chip" data-action="role-lens">${ico('users')} 角色视角</button><button class="tool-chip" data-action="scene-rehearsal">${ico('network')} 分步推演</button><button class="tool-chip" data-action="ai-assist">`);};
  const oldAct=act;
  act=function(action,x){
    if(action==='canon-new')return openFact();
    if(action==='canon-edit')return openFact(x);
    if(action==='canon-list')return listFacts();
    if(action==='role-lens')return chooseRoleLens(x);
    if(action==='scene-rehearsal'||action==='scene')return sceneRehearsal();
    return oldAct(action,x);
  };
  const oldNormalize=normalizeBackup;
  normalizeBackup=function(data){
    const cleaned=oldNormalize(data),projectIds=new Set(cleaned.projects.map(p=>p.id));
    cleaned.canonFacts=Array.isArray(data.canonFacts)?data.canonFacts.filter(f=>f&&typeof f.id==='string'&&typeof f.projectId==='string'&&projectIds.has(f.projectId)&&typeof f.title==='string'&&typeof f.truth==='string').slice(0,25000).map(f=>({
      id:f.id,projectId:f.projectId,title:f.title.slice(0,110),truth:f.truth.slice(0,6000),type:FACT_TYPES.includes(f.type)?f.type:'其他',
      evidence:String(f.evidence||'').slice(0,1000),created:f.created||time(),updated:f.updated||time(),
      views:Object.fromEntries(Object.entries(approvedViews(f)).filter(([roleId,v])=>cleaned.characters.some(r=>r.id===roleId&&r.projectId===f.projectId)&&VIEW_TYPES.includes(v?.status)).map(([roleId,v])=>[roleId,{status:v.status,belief:String(v.belief||'').slice(0,1200),sinceChapterId:cleaned.projects.find(p=>p.id===f.projectId)?.chapters.some(c=>c.id===v.sinceChapterId)?v.sinceChapterId:''}]))
    })):[];
    // Local provider settings are configuration, not credentials. Never restore API keys.
    cleaned.settings.aiProvider=data.settings?.aiProvider==='iridis'?'iridis':'cloud';
    cleaned.settings.localModel=String(data.settings?.localModel||'default').slice(0,200);
    cleaned.settings.localContextChars=[2000,4000,6000,8000].includes(Number(data.settings?.localContextChars))?Number(data.settings.localContextChars):4000;
    cleaned.version=5;
    return cleaned;
  };
  const oldBootstrap=bootstrap;
  bootstrap=async function(){
    await oldBootstrap();
    if(!Array.isArray(state.canonFacts))state.canonFacts=[];
    if(state.version<5)state.version=5;
    queueSave();
  };
})();

const startWorkspace = () => bootstrap().catch(showStartupFailure);
if (document.readyState === 'complete') startWorkspace();
else document.addEventListener('DOMContentLoaded', startWorkspace, {once:true});
