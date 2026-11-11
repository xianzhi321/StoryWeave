(() => {
  'use strict';
  const normalize = value => String(value??'').normalize('NFKC').trim().replace(/\s+/gu,' ');
  const rulesOf = skill => Array.isArray(skill.rules) ? skill.rules.filter(rule=>typeof rule==='string'&&rule.trim()) : [];
  const unique = values => [...new Map(values.map(value=>[normalize(value),value])).values()];

  function duplicateGroups(skills) {
    const groups=new Map();
    for(const skill of skills) {
      if(!skill?.id||!normalize(skill.title))continue;
      const evidence=Array.isArray(skill.evidenceRefs)
        ? skill.evidenceRefs.map(ref=>[ref?.docId,ref?.start,ref?.end,ref?.sampleIndex,ref?.reason]) : [];
      const key=JSON.stringify([normalize(skill.title),normalize(skill.category),normalize(skill.description),
        normalize(skill.situation),rulesOf(skill).map(normalize),skill.projectId??null,skill.source??'',
        skill.sourceId??'',skill.sourceFingerprint??'',skill.analysisType??'',skill.evidence??'',
        skill.sampleRanges??[],evidence,skill.mergedSources??[]]);
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(skill);
    }
    return [...groups].filter(([,group])=>group.length>1).map(([signature,group])=>{
      const keep=group.find(skill=>skill.status==='ready')||group[0];
      return {signature,keep,remove:group.filter(skill=>skill!==keep)};
    });
  }

  function evidenceCheck(next) {
    const documents=new Map((next.documents||[]).map(doc=>[doc.id,doc]));
    const fingerprints=new Map(), core=StoryWeaveDistillCore;
    return skill=>{
      if(skill.analysisType!=='evidence-pipeline')return true;
      const doc=documents.get(skill.sourceId);
      if(doc&&!fingerprints.has(doc.id))fingerprints.set(doc.id,core.fingerprint(doc.text));
      return Boolean(doc&&Array.isArray(skill.evidenceRefs)&&skill.evidenceRefs.length&&
        (!skill.sourceFingerprint||fingerprints.get(doc.id)===skill.sourceFingerprint)&&
        core.verifyRefs(doc,skill.evidenceRefs).every(ref=>ref.valid));
    };
  }

  function approve(next,selected) {
    const validEvidence=evidenceCheck(next);
    let approved=0, skipped=0;
    next.skills=next.skills.map(skill=>{
      if(!selected.has(skill.id)||skill.status!=='candidate')return skill;
      const evidenceValid=validEvidence(skill)&&(!Array.isArray(skill.mergedSources)||skill.mergedSources.every(source=>!source||validEvidence(source)));
      if(!evidenceValid||!normalize(skill.title)||!rulesOf(skill).length){skipped++;return skill;}
      approved++;
      const entry={at:time(),title:skill.title,description:skill.description,rules:skill.rules.slice(),status:skill.status};
      return {...skill,status:'ready',version:(Number(skill.version)||1)+1,history:[...(Array.isArray(skill.history)?skill.history:[]),entry].slice(-20)};
    });
    return `已审核通过 ${approved} 项。${skipped?`${skipped} 项缺少有效证据或执行规则，仍待审核。`:''}`;
  }

  function combine(next,skills,scope) {
    if(skills.length<2||skills.some(skill=>skill.status!=='ready'))throw Error('组合需要至少两项已审核技能');
    if(scope&&!next.projects.some(work=>work.id===scope))throw Error('当前作品已删除，请重新选择');
    const skillIds=skills.map(skill=>skill.id);
    const existing=next.skillPresets.find(row=>row.projectId===scope&&row.skillIds?.length===skillIds.length&&
      row.skillIds.every(key=>skillIds.includes(key)));
    if(existing)return `已有相同组合「${existing.name}」。`;
    if(next.skillPresets.length>=300)throw Error('已达到 300 个配方上限');
    const name=skills.map(skill=>skill.title).join(' ＋ ').slice(0,65);
    next.skillPresets.push({id:id(),projectId:scope,name,description:'从技能工坊组合',skillIds,created:time(),updated:time()});
    return `已创建配方「${name}」。`;
  }

  function mergeDraft(skills) {
    if(skills.length<2||skills.length>12)throw Error('请选择 2 至 12 项技能合并');
    const rules=unique(skills.flatMap(rulesOf));
    if(!rules.length)throw Error('所选技能缺少执行规则');
    const categories=unique(skills.map(skill=>skill.category).filter(Boolean));
    const description=unique(skills.map(skill=>skill.description).filter(Boolean)).join('\n\n');
    const situation=unique(skills.map(skill=>skill.situation).filter(Boolean)).join('\n\n');
    const snapshots=skills.flatMap(({mergedSources,...skill})=>[
      skill,...(Array.isArray(mergedSources)?mergedSources.filter(Boolean):[])
    ]);
    const sources=[...new Map(snapshots.map(source=>[JSON.stringify(source),source])).values()];
    const scope=skills[0].projectId??null;
    return {title:`合并稿 · ${skills[0].title}`.slice(0,90),category:categories.length===1?categories[0]:'综合技巧',
      description,situation,rules,source:`合并自 ${skills.length} 项技能`,
      projectId:skills.every(skill=>(skill.projectId??null)===scope)?scope:null,mergedSources:sources};
  }

  function canReplace(skills) {
    return skills.length>=2&&skills.every(skill=>skill.status==='ready'&&
      (skill.projectId??null)===(skills[0].projectId??null));
  }

  function merge(next,skills,title,replace) {
    const draft={...mergeDraft(skills),title};
    if(replace&&!canReplace(skills))throw Error('只有同一范围内的已审核技能可以替换');
    const skillId=id();
    next.skills.push({...draft,id:skillId,status:replace?'ready':'candidate',replacesSources:replace,version:1,created:time()});
    if(replace){
      replaceReferences(next,new Map(skills.map(skill=>[skill.id,skillId])));
      return {skillId,message:`已合并并替换 ${skills.length} 项技能，关联已迁移。`};
    }
    return {skillId,message:`已生成待审合并稿，共 ${draft.rules.length} 条规则。`};
  }

  function duplicateMap(groups) {
    return new Map(groups.flatMap(({keep,remove})=>remove.map(skill=>[skill.id,keep.id])));
  }
  function removeDuplicates(next,expected) {
    const keys=new Set(expected.map(group=>group.keep.id));
    const groups=duplicateGroups(next.skills).filter(group=>keys.has(group.keep.id));
    const replacements=duplicateMap(groups),previous=duplicateMap(expected);
    const signatures=new Map(expected.map(group=>[group.keep.id,group.signature]));
    if(groups.length!==expected.length||groups.some(group=>signatures.get(group.keep.id)!==group.signature)||
      replacements.size!==previous.size||[...previous].some(([key,value])=>replacements.get(key)!==value)) {
      throw Error('技能库已变化，请重新检查重复项');
    }
    const kept=new Map(groups.map(({keep,remove})=>{
      const versions=[keep,...remove];
      const entries=versions.flatMap(skill=>Array.isArray(skill.history)?skill.history:[]);
      const history=[...new Map(entries.map(entry=>[JSON.stringify(entry),entry])).values()]
        .sort((a,b)=>String(a?.at||'').localeCompare(String(b?.at||'')));
      return [keep.id,{...keep,history,version:Math.max(...versions.map(skill=>Number(skill.version)||1))}];
    }));
    next.skills=next.skills.map(skill=>kept.get(skill.id)||skill);
    replaceReferences(next,replacements);
    return `已移除 ${replacements.size} 项重复技能，相关配方和任务已接到保留项。`;
  }

  function replaceReferences(next,replacements) {
    const remap=key=>replacements.get(key)||key;
    const remapIds=ids=>[...new Set(ids.map(remap))];
    next.skills=next.skills.filter(skill=>!replacements.has(skill.id));
    next.skillPresets=next.skillPresets.map(row=>row.skillIds?.some(key=>replacements.has(key))
      ? {...row,skillIds:remapIds(row.skillIds)} : row);
    next.distillationJobs=next.distillationJobs.map(row=>row.outputSkillIds?.some(key=>replacements.has(key))
      ? {...row,outputSkillIds:remapIds(row.outputSkillIds)} : row);
    if(Array.isArray(next.writingFeedback))next.writingFeedback=next.writingFeedback.map(row=>replacements.has(row.skillId)
      ? {...row,skillId:remap(row.skillId)} : row);
  }

  function open(scope=null,initial=[],{message='',skillId='',term='',filter='all',recipeScope=''}={}) {
    const work=project();
    const included=scope&&new Set(scope),checked=new Set(initial);
    const rows=state.skills.filter(skill=>!included||included.has(skill.id));
    modal('批量管理技能',`<p class="small-note">勾选需要处理的技能。审核由你确认，组合只使用已审核技能。合并会生成待审核的新卡。</p>
      <div class="sw23-filters"><input type="search" id="sw23-search" aria-label="搜索技能" placeholder="搜索技能、来源或规则" value="${esc(term)}">
        <select id="sw23-filter" aria-label="筛选审核状态"><option value="all">全部状态</option><option value="candidate">待审核</option><option value="ready">已审核</option></select></div>
      <div class="sw15-actions"><button class="button outline" id="sw23-select-pending">勾选可见待审</button>
        <button class="button outline" id="sw23-clear">清除选择</button><span id="sw23-selection" class="small-note" aria-live="polite"></span></div>
      <div class="sw23-skill-list">${rows.map(skill=>`<div class="sw23-skill-row"><label><input type="checkbox" data-sw23-id="${esc(skill.id)}" ${checked.has(skill.id)?'checked':''}>
        <span><strong>${esc(skill.title)}</strong><small>${skill.status==='ready'?'已审核':'待审核'} · ${esc(skill.category||'通用')}</small>
        <small>${esc(short(skill.description||rulesOf(skill)[0]||'',140))}</small></span></label>
        <details><summary>查看规则</summary><ul>${rulesOf(skill).map(rule=>`<li>${esc(rule)}</li>`).join('')}</ul></details></div>`).join('')}<p id="sw23-empty" class="small-note" hidden>没有符合条件的技能。</p></div>
      <div class="sw23-filters">
        <label for="sw23-recipe-scope">组合使用范围</label>
        <select id="sw23-recipe-scope"><option value="">所有作品</option>${work?'<option value="work">当前作品 · '+esc(work.title)+'</option>':''}</select>
      </div>
      <div class="sw15-actions">
        <button class="button primary" id="sw23-approve">一键审核</button>
        <button class="button outline" id="sw23-combine">一键组合</button>
        <button class="button outline" id="sw23-merge">预览合并</button>
        ${scope?'':'<button class="button outline" id="sw23-find-duplicates">检查重复技能</button>'}
      </div>
      <div id="sw23-merge-preview" hidden></div>
      <div id="sw23-duplicates" hidden></div>
      <p class="small-note" role="status">${esc(message)}</p>
      ${skillId?'<button class="button outline" id="sw23-edit-merged">查看合并技能</button>':''}`,root=>{
      const fields=[...root.querySelectorAll('[data-sw23-id]')], close=root.querySelector('#modalClose');
      const approveButton=root.querySelector('#sw23-approve'),combineButton=root.querySelector('#sw23-combine');
      const mergeButton=root.querySelector('#sw23-merge'),status=root.querySelector('[role="status"]');
      const search=root.querySelector('#sw23-search'),filterField=root.querySelector('#sw23-filter');
      const scopeField=root.querySelector('#sw23-recipe-scope');
      const mergePreview=root.querySelector('#sw23-merge-preview');
      const selectPending=root.querySelector('#sw23-select-pending');
      const cards=fields.map(field=>field.closest('.sw23-skill-row'));
      const searchable=rows.map(skill=>[skill.title,skill.category,skill.source,skill.description,...rulesOf(skill)].map(normalize).join(' ').toLowerCase());
      filterField.value=filter;
      scopeField.value=work?recipeScope:'';
      const selection=()=>new Set(fields.filter(field=>field.checked).map(field=>field.dataset.sw23Id));
      let busy=false;
      function refresh(){
        const ids=selection(),skills=rows.filter(row=>ids.has(row.id));
        const hidden=fields.filter((field,index)=>field.checked&&cards[index].hidden).length;
        root.querySelector('#sw23-selection').textContent=`已选 ${ids.size} 项${hidden?`（含筛选外 ${hidden} 项）`:''}`;
        selectPending.disabled=busy||!rows.some((skill,index)=>!cards[index].hidden&&skill.status==='candidate');
        approveButton.disabled=busy||!skills.some(skill=>skill.status==='candidate');
        combineButton.disabled=busy||skills.length<2||skills.some(skill=>skill.status!=='ready');
        mergeButton.disabled=busy||skills.length<2||skills.length>12;
      }
      function applyFilter(){
        const query=normalize(search.value).toLowerCase();
        const statusFilter=filterField.value;
        cards.forEach((card,index)=>{
          card.hidden=(statusFilter!=='all'&&rows[index].status!==statusFilter)||!searchable[index].includes(query);
        });
        root.querySelector('#sw23-empty').hidden=cards.some(card=>!card.hidden);
        refresh();
      }
      async function save(change){
        if(busy)return;
        const ids=selection();
        busy=close.disabled=true;refresh();status.textContent='正在保存…';
        try {
          let result;
          await StoryWeaveWorkspace.transact(next=>{
            const skills=next.skills.filter(row=>ids.has(row.id));
            if(skills.length!==ids.size)throw Error('所选技能已变化，请重新打开面板');
            result=change(next,skills,ids);
          });
          if(root.isConnected){
            render();
            open(scope,[...ids],{term:search.value,filter:filterField.value,recipeScope:scopeField.value,
              ...(typeof result==='string'?{message:result}:result)});
          }
        } catch(error){status.textContent='保存失败：'+error.message;}
        finally{busy=close.disabled=false;refresh();}
      }
      root.closest('.modal-backdrop').addEventListener('click',event=>{
        if(busy&&event.target.classList.contains('modal-backdrop'))event.stopImmediatePropagation();
      },true);
      selectPending.onclick=()=>{
        fields.forEach((field,index)=>{if(!cards[index].hidden&&rows[index].status==='candidate')field.checked=true;});
        selectionChanged();
      };
      const selectionChanged=()=>{mergePreview.hidden=true;refresh();};
      root.querySelector('#sw23-clear').onclick=()=>{fields.forEach(field=>field.checked=false);selectionChanged();};
      search.oninput=filterField.onchange=applyFilter;
      fields.forEach(field=>field.onchange=selectionChanged);
      approveButton.onclick=()=>save((next,_skills,ids)=>approve(next,ids));
      combineButton.onclick=()=>{
        const workId=scopeField.value==='work'?work?.id:null;
        save((next,skills)=>combine(next,skills,workId));
      };
      mergeButton.onclick=()=>{
        if(busy)return;
        const selected=selection();
        const skills=state.skills.filter(skill=>selected.has(skill.id));
        let draft;
        try{draft=mergeDraft(skills);}catch(error){status.textContent=error.message;return;}
        const original=JSON.stringify(skills);
        mergePreview.innerHTML=`<div class="panel"><h3>合并预览</h3>
          <p class="small-note">${skills.map(skill=>esc(skill.title)).join('、')}</p>
          <div class="field"><label for="sw23-merge-title">新技能名称</label>
          <input id="sw23-merge-title" value="${esc(draft.title)}" maxlength="90"></div>
          <p>${esc(draft.description)}</p><ol>${draft.rules.map(rule=>`<li>${esc(rule)}</li>`).join('')}</ol>
          <div class="sw15-actions"><button class="button outline" id="sw23-merge-copy">保留原卡，生成待审稿</button>
          ${canReplace(skills)?'<button class="button primary" id="sw23-merge-replace">确认合并并替换原卡</button>':''}</div>
          <p class="small-note">${canReplace(skills)?'替换后，新卡沿用已审核状态，原卡内容与来源可在新卡里查看。配方、蒸馏任务和反馈会关联到新卡。':'同一范围内的已审核技能可以直接替换。'}</p></div>`;
        mergePreview.hidden=false;
        const submit=replace=>{
          const title=mergePreview.querySelector('#sw23-merge-title').value.trim();
          if(!title){status.textContent='请填写新技能名称。';return;}
          save((next,current)=>{
            if(JSON.stringify(current)!==original)throw Error('所选技能已变化，请重新预览');
            return merge(next,current,title,replace);
          });
        };
        mergePreview.querySelector('#sw23-merge-copy').onclick=()=>submit(false);
        const replaceButton=mergePreview.querySelector('#sw23-merge-replace');
        if(replaceButton)replaceButton.onclick=()=>submit(true);
      };
      const editMerged=root.querySelector('#sw23-edit-merged');
      if(editMerged)editMerged.onclick=()=>{if(!busy)openSkill(skillId);};
      const find=root.querySelector('#sw23-find-duplicates'),preview=root.querySelector('#sw23-duplicates');
      if(find)find.onclick=()=>{
        if(busy)return;
        const groups=duplicateGroups(state.skills), count=duplicateMap(groups).size;
        preview.hidden=false;
        preview.innerHTML=count ? `<p>检测到 ${count} 项重复。勾选要处理的组。</p>
          <div class="sw23-skill-list">${groups.map(({keep,remove},index)=>`<div class="sw23-skill-row"><label>
            <input type="checkbox" data-sw23-duplicate="${index}">
            <span><strong>保留「${esc(keep.title)}」，移除 ${remove.length} 项</strong>
            <small>${esc(keep.category||'通用')} · ${esc(keep.source||'手动创建')} · ${keep.status==='ready'?'已审核':'待审核'}</small></span>
          </label></div>`).join('')}</div>
          <div class="sw15-actions"><button class="button outline" id="sw23-select-duplicates">全选重复组</button>
          <button class="button primary" id="sw23-delete-duplicates" disabled>确认移除所选重复项</button></div>` : '<p>没有找到可安全移除的完全重复项。</p>';
        const remove=preview.querySelector('#sw23-delete-duplicates');
        if(!remove)return;
        const groupFields=[...preview.querySelectorAll('[data-sw23-duplicate]')];
        const chosen=()=>groups.filter((group,index)=>groupFields[index].checked);
        const refreshDuplicates=()=>{remove.disabled=!chosen().length;};
        groupFields.forEach(field=>field.onchange=refreshDuplicates);
        preview.querySelector('#sw23-select-duplicates').onclick=()=>{
          groupFields.forEach(field=>field.checked=true);
          refreshDuplicates();
        };
        remove.onclick=()=>{
          const selected=chosen();
          if(selected.length)save(next=>removeDuplicates(next,selected));
        };
      };
      applyFilter();
    });
  }
  const beforeAct=act;
  act=function(action,key){
    if(action==='sw23-manage')return open();
    if(action==='sw23-audit')return open(null,state.skills.filter(skill=>skill.status==='candidate').map(skill=>skill.id),{filter:'candidate'});
    return beforeAct(action,key);
  };
  window.StoryWeaveSkillBatch={open};
})();
