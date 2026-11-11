/* StoryWeave v0.7 — Writing Desk Plus. Offline author-controlled utilities.
 * Feature changes are additive and do not alter the v0.6 persisted schema.
 */
'use strict';
(function(){
  const MAX_RESULTS=72, MAX_REPLACEMENTS=5000, HISTORY_LIMIT=30;
  let drawerEscapeListener=null;
  let searchSession=null;
  const norm=(value)=>String(value??'').toLocaleLowerCase();
  const editorText=text=>String(text||'').replace(/\r\n?/g,'\n');
  function findMatches(text,query,max=MAX_RESULTS){
    const source=String(text??''),term=String(query??'').trim();
    if(!term||!max)return [];
    const pattern=new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'giu');
    const positions=[];
    for(let match;positions.length<max&&(match=pattern.exec(source));){
      positions.push({start:match.index,end:match.index+match[0].length});
    }
    return positions;
  }
  function textSnippet(text,start,end,margin=37){
    const raw=String(text||'');
    let a=Math.max(0,start-margin),b=Math.min(raw.length,end+margin);
    return {before:(a?'…':'')+raw.slice(a,start),hit:raw.slice(start,end),after:raw.slice(end,b)+(b<raw.length?'…':'')};
  }
  function resultPreview(text,start,end){const s=textSnippet(text,start,end);return `<span>${esc(s.before)}<mark>${esc(s.hit)}</mark>${esc(s.after)}</span>`;}
  function chapterMatches(query,limit=MAX_RESULTS,chapterKey=''){
    const found=[];
    for(const c of chapters()){
      if(chapterKey&&c.id!==chapterKey)continue;
      const body=editorText(c.text);
      const matches=findMatches(body,query,limit-found.length);
      for(const hit of matches)found.push({kind:'chapter',chapterId:c.id,title:c.title,text:body,...hit});
      if(!chapterKey&&!matches.length&&findMatches(c.title,query,1).length){
        found.push({kind:'chapter',chapterId:c.id,title:c.title,text:body,start:0,end:0,titleHit:true});
      }
      if(found.length>=limit)break;
    }
    return found.slice(0,limit);
  }
  function searchReferences(query){
    const found=[];
    for(const r of characters()){
      const text=[r.name,r.role,r.personality,r.goal,r.knowledge].join(' · ');
      const hit=findMatches(text,query,1)[0];
      if(hit)found.push({kind:'role',id:r.id,title:'人物 · '+r.name,text,start:hit.start,end:hit.end});
    }
    for(const entry of (state.plots||[]).filter(x=>x.projectId===state.selected)){
      const text=[entry.title,entry.note].join(' · ');const hit=findMatches(text,query,1)[0];
      if(hit)found.push({kind:'plot',id:entry.id,title:'线索 · '+entry.title,text,start:hit.start,end:hit.end});
    }
    for(const f of (state.canonFacts||[]).filter(x=>x.projectId===state.selected)){
      const text=[f.title,f.truth].join(' · ');const hit=findMatches(text,query,1)[0];
      if(hit)found.push({kind:'fact',id:f.id,title:'事实 · '+f.title,text,start:hit.start,end:hit.end});
    }
    return found;
  }
  function jumpToSearchHit(index){
    const session=searchSession, hit=session?.hits[index];
    if(!hit||session.work!==project())return;
    session.index=index;
    closeModal();
    if(tab!=='write'||chapter()?.id!==hit.chapterId){
      chapterId=hit.chapterId;go('write');
    }
    const editor=document.getElementById('chapterText');
    if(editor){
      editor.focus({preventScroll:true});
      StoryWeaveDesk.revealSelection(editor,hit.start,hit.end);
      paintSearchBar(editor);
    }
  }
  function beginSearch(term,hits,index,chapterKey='',includeRefs=true){
    searchSession={work:project(),term,hits,index,chapterKey,includeRefs,dirty:false};
    jumpToSearchHit(index);
  }
  function stepSearch(delta){
    const session=searchSession, editor=document.getElementById('chapterText');
    if(!session||!editor||session.work.id!==state.selected)return;
    if(session.dirty||session.work!==project()){
      const hit=session.hits[session.index];
      const hits=chapterMatches(session.term,MAX_REPLACEMENTS,session.chapterKey);
      if(!hits.length){
        searchSession=null;
        paintSearchBar(editor);
        toast('当前范围内已没有匹配内容');
        return;
      }
      const index=hits.findIndex(row=>row.chapterId===hit?.chapterId&&row.start===hit.start&&row.end===hit.end&&row.text===hit.text);
      Object.assign(session,{work:project(),hits,index,dirty:false});
      if(index<0){
        const order=new Map(chapters().map((row,position)=>[row.id,position]));
        const currentKey=chapter()?.id, current=order.get(currentKey);
        const candidates=hits.map((row,position)=>({row,position}));
        if(delta<0)candidates.reverse();
        const next=candidates.find(({row})=>delta>0
          ? order.get(row.chapterId)>current||(row.chapterId===currentKey&&row.start>=editor.selectionEnd)
          : order.get(row.chapterId)<current||(row.chapterId===currentKey&&row.end<=editor.selectionStart));
        jumpToSearchHit(next?.position??(delta>0?0:hits.length-1));
        return;
      }
    }
    const {hits,index}=session;
    jumpToSearchHit((index+delta+hits.length)%hits.length);
  }
  function paintSearchBar(editor){
    document.getElementById('sw28-search-nav')?.remove();
    const session=searchSession;
    if(!session||session.work.id!==state.selected||(session.chapterKey&&session.chapterKey!==chapter()?.id))return;
    const bar=document.createElement('div');
    bar.id='sw28-search-nav';
    bar.setAttribute('role','group');
    bar.setAttribute('aria-label','搜索结果导航');
    bar.innerHTML=`<span role="status">${esc(session.term)} · ${session.index+1} / ${session.hits.length}</span>
      <div><button type="button" data-sw28-prev>上一处</button><button type="button" data-sw28-next>下一处</button>
      <button type="button" data-sw28-results>${session.chapterKey?'查找与替换':'全部结果'}</button><button type="button" data-sw28-close>关闭</button></div>`;
    bar.querySelector('[data-sw28-prev]').onclick=()=>stepSearch(-1);
    bar.querySelector('[data-sw28-next]').onclick=()=>stepSearch(1);
    bar.querySelector('[data-sw28-results]').onclick=()=>session.chapterKey ? openChapterFind(session.term) :
      openRichSearch(session.term,session.includeRefs,session.index);
    bar.querySelector('[data-sw28-close]').onclick=()=>{
      searchSession=null;
      bar.remove();
      editor.focus({preventScroll:true});
    };
    editor.before(bar);
  }
  function openRichSearch(initial='',includeRefs=true,initialIndex=0){
    if(!project())return toast('请先创建作品');
    const work=project();
    modal('全文检索',`<div class="field"><label for="sw7FullSearch">搜索内容</label>
      <input id="sw7FullSearch" type="search" autocomplete="off" placeholder="输入人物、台词或线索关键词" maxlength="90" value="${esc(initial)}"></div>
      <label class="sw7-switch"><input type="checkbox" id="sw7IncludeRefs" ${includeRefs?'checked':''}> 同时搜索人物与设定档案</label>
      <div id="sw7SearchSummary" class="sw7-small-meta" role="status">请输入关键词</div>
      <div id="sw7SearchResults" class="sw7-search-results"></div>
      <div id="sw28-result-pages" class="sw15-actions" hidden><button type="button" class="button outline" id="sw28-page-prev">上一页</button>
      <button type="button" class="button outline" id="sw28-page-next">下一页</button></div>`,root=>{
      const input=root.querySelector('#sw7FullSearch'),results=root.querySelector('#sw7SearchResults');
      const option=root.querySelector('#sw7IncludeRefs'),summary=root.querySelector('#sw7SearchSummary');
      const pages=root.querySelector('#sw28-result-pages');
      const prev=root.querySelector('#sw28-page-prev'), next=root.querySelector('#sw28-page-next');
      let shown=[], manuscript=[], term='', capped=false, page=0, resultWork;
      const paint=()=>{
        const start=page*MAX_RESULTS, totalPages=Math.ceil(shown.length/MAX_RESULTS);
        pages.hidden=totalPages<=1;
        prev.disabled=page===0;next.disabled=page+1>=totalPages;
        summary.textContent=term ? `找到 ${shown.length} 条结果${capped?'（已达到搜索上限）':''}${totalPages>1?` · 第 ${page+1}/${totalPages} 页`:''}` : '请输入关键词';
        results.innerHTML=shown.length?shown.slice(start,start+MAX_RESULTS).map((h,i)=>`<button class="sw7-result" data-sw7-hit="${start+i}"><span class="sw7-result-index">${String(start+i+1).padStart(2,'0')}</span><span class="sw7-result-main"><strong>${esc(h.title)}</strong><small>${h.titleHit?'章节标题匹配':resultPreview(h.text,h.start,h.end)}</small></span>${ico('chevron')}</button>`).join(''):
          `<div class="empty-mini">${term?'没有找到匹配内容。':'全文检索在本机进行。'}</div>`;
        results.scrollTop=0;
      };
      const renderResults=()=>{
        term=input.value.trim();
        manuscript=term?chapterMatches(term,MAX_REPLACEMENTS+1):[];
        capped=manuscript.length>MAX_REPLACEMENTS;
        if(capped)manuscript.length=MAX_REPLACEMENTS;
        shown=term&&option.checked?[...manuscript,...searchReferences(term)]:manuscript;
        resultWork=project();
        page=0;
        paint();
      };
      results.onclick=event=>{
          const button=event.target.closest('[data-sw7-hit]');
          const index=Number(button?.dataset.sw7Hit), hit=shown[index];
          if(!hit||state.selected!==work.id)return;
          if(hit.kind==='chapter'){
            const live=chapters().find(ch=>ch.id===hit.chapterId);
            if(resultWork!==project()||!live||editorText(live.text)!==hit.text||live.title!==hit.title){
              renderResults();toast('正文已变化，请重新选择结果');return;
            }
            return beginSearch(term,manuscript,index,'',option.checked);
          }
          closeModal();
          if(hit.kind==='role'){go('characters');openRole(hit.id);}
          else if(hit.kind==='plot'){go('world');openPlotEntry(hit.id);}
          else {go('world');act('canon-edit',hit.id);}
      };
      prev.onclick=()=>{page--;paint();};
      next.onclick=()=>{page++;paint();};
      input.addEventListener('input',renderResults);option.addEventListener('change',renderResults);
      renderResults();
      if(initialIndex>0&&initialIndex<shown.length){
        page=Math.floor(initialIndex/MAX_RESULTS);
        paint();
      }
      setTimeout(()=>{if(root.isConnected)input.focus();},80);
    });
  }
  // Search now gives multiple precise matches within a chapter rather than one entry.
  openSearch=openRichSearch;
  function chapterIndexOfCurrent(){return project()?.chapters.findIndex(c=>c.id===chapterId)??-1;}
  function moveChapter(delta){
    const p=project(),i=chapterIndexOfCurrent();
    if(!p||i<0||!p.chapters[i+delta])return;
    chapterId=p.chapters[i+delta].id;render();
    document.getElementById('chapterText')?.focus();
  }
  /** Save the proposed chapter and the pre-change undo snapshot in ONE storage write.
      The UI / in-memory state only switches after storage confirms the commit. */
  async function commitChapterEdit(chapterKey,updatedText,title,reason,expected){
    const p=project();if(!p)throw Error('没有选择作品');
    const c=p.chapters.find(x=>x.id===chapterKey);if(!c)throw Error('章节不存在');
    const original=expected??{text:c.text,title:c.title};
    const nextTitle=title??original.title;
    if(c.text!==original.text||c.title!==original.title)throw Error('章节已变化，请重新核对');
    if(c.text===updatedText&&c.title===nextTitle)return false;
    await StoryWeaveWorkspace.transact(next=>{
      if(next.selected!==p.id)throw Error('作品已切换，请重新打开工具');
      const work=next.projects.find(row=>row.id===p.id);
      const latest=work?.chapters.find(row=>row.id===chapterKey);
      if(!latest||latest.text!==original.text||latest.title!==original.title)throw Error('章节已变化，请重新核对');
      const stamp=time();
      const prior={id:id(),at:stamp,title:latest.title,text:latest.text,automatic:true,reason:reason||'编辑前自动存档'};
      const replacement={...latest,text:updatedText,title:nextTitle,updated:stamp,
        history:[prior,...(latest.history||[])].slice(0,HISTORY_LIMIT)};
      next.projects=next.projects.map(row=>row===work
        ? {...work,updated:stamp,chapters:work.chapters.map(ch=>ch===latest?replacement:ch)} : row);
    });
    return true;
  }
  function sourceMatchPreview(c,matches){
    return matches.slice(0,6).map((m,i)=>`<div class="sw7-replace-preview"><small>${i+1}</small>${resultPreview(c.text,m.start,m.end)}</div>`).join('');
  }
  function openChapterFind(initial){
    const c=chapter(),ta=document.getElementById('chapterText');if(!c)return;
    const selection=ta?.value.slice(ta.selectionStart,ta.selectionEnd).trim()||'';
    modal('本章查找与替换',`<div class="sw7-search-head"><span class="tiny-label">WRITING TOOL · ${esc(c.title)}</span><p>逐处定位，或确认后批量替换。替换前自动保留完整章节快照。</p></div>
      <div class="field"><label for="sw7Find">查找</label><input id="sw7Find" type="search" placeholder="输入要找的文字" maxlength="100" value="${esc(initial??(selection.length<80?selection:''))}"></div>
      <div class="field"><label>替换为（可留空以删除）</label><input id="sw7Replace" placeholder="新的文字" maxlength="1000"></div>
      <div class="sw7-replace-actions"><span id="sw7Count" role="status">尚未搜索</span><button class="button outline" id="sw7Next">定位下一个</button></div>
      <div id="sw7Preview" class="sw7-preview-list"></div>
      <button class="button primary block mt12" id="sw7ReplaceAll" disabled>替换本章全部匹配</button>
      <div class="sw7-tiny-notice">不会改动其他章节。大批量替换限制为 ${MAX_REPLACEMENTS.toLocaleString()} 处。</div>`,root=>{
      const find=root.querySelector('#sw7Find'),replace=root.querySelector('#sw7Replace'),countNode=root.querySelector('#sw7Count');
      const preview=root.querySelector('#sw7Preview'),replaceBtn=root.querySelector('#sw7ReplaceAll');
      const refresh=()=>{
        const matches=findMatches(c.text,find.value,MAX_REPLACEMENTS+1);
        countNode.textContent=matches.length>MAX_REPLACEMENTS?`超过 ${MAX_REPLACEMENTS} 处，请缩小关键词`:`${matches.length} 处匹配`;
        replaceBtn.disabled=!matches.length||matches.length>MAX_REPLACEMENTS;
        preview.innerHTML=matches.length?sourceMatchPreview(c,matches):'<div class="empty-mini">暂无匹配。</div>';
      };
      find.addEventListener('input',refresh);
      root.querySelector('#sw7Next').onclick=()=>{
        const term=find.value.trim(), hits=chapterMatches(term,MAX_REPLACEMENTS,c.id);
        if(!hits.length)return;
        const after=ta?.selectionEnd??0;
        const next=hits.findIndex(hit=>hit.start>=after);
        beginSearch(term,hits,Math.max(0,next),c.id,false);
      };
      replaceBtn.onclick=async()=>{
        if(replaceBtn.disabled)return;
        const term=find.value.trim(),target=replace.value;
        const positions=findMatches(c.text,term,MAX_REPLACEMENTS+1);
        if(!positions.length||positions.length>MAX_REPLACEMENTS)return;
        if(!confirm(`确定把《${c.title}》中的 ${positions.length} 处文字替换吗？\n替换前将自动保存旧稿，稍后可以从「历史版本」恢复。`))return;
        const chunks=[];let previous=0;
        for(const m of positions){chunks.push(c.text.slice(previous,m.start),target);previous=m.end;}
        chunks.push(c.text.slice(previous));const proposed=chunks.join('');
        replaceBtn.disabled=true;replaceBtn.textContent='正在保存更改…';
        try{
          if(await commitChapterEdit(c.id,proposed,c.title,'批量替换之前的全文')){
            closeModal();render();toast(`已替换 ${positions.length} 处；原稿已存入历史版本`);
          } else {replaceBtn.disabled=false;replaceBtn.textContent='内容未发生变化';}
        }catch(err){console.error(err);replaceBtn.disabled=false;replaceBtn.textContent='替换本章全部匹配';toast('保存失败，正文未被替换：'+short(err.message,65));}
      };
      refresh();setTimeout(()=>find.focus(),70);
    });
  }
  function previewComparison(before,after){
    let at=0,max=Math.min(before.length,after.length);
    while(at<max&&before[at]===after[at])at++;
    const margin=155;const a=Math.max(0,at-margin);
    const startMark=a?'…':'';
    return {old:startMark+before.slice(a,Math.min(before.length,at+330))+(at+330<before.length?'…':''),
      proposed:startMark+after.slice(a,Math.min(after.length,at+330))+(at+330<after.length?'…':'')};
  }
  function versionDiff(before,after){
    return sequenceDiff(before.split('\n'),after.split('\n'));
  }
  function sequenceDiff(left,right){
    const blocks=[];
    let start=0,m=left.length,n=right.length;
    while(start<m&&start<n&&left[start]===right[start])start++;
    while(m>start&&n>start&&left[m-1]===right[n-1]){m--;n--;}
    const width=n-start+1,size=(m-start+1)*width;
    if(size>160000)return {left,right,blocks:[[start,m,start,n]],coarse:true};
    const lengths=new Uint16Array(size);
    const slot=(i,j)=>(i-start)*width+j-start;
    for(let i=m-1;i>=start;i--)for(let j=n-1;j>=start;j--){
      lengths[slot(i,j)]=left[i]===right[j] ? 1+lengths[slot(i+1,j+1)] :
        Math.max(lengths[slot(i+1,j)],lengths[slot(i,j+1)]);
    }
    let i=start,j=start;
    while(i<m||j<n){
      if(i<m&&j<n&&left[i]===right[j]){i++;j++;continue;}
      const a=i,b=j;
      while((i<m||j<n)&&!(i<m&&j<n&&left[i]===right[j])){
        if(j===n||(i<m&&lengths[slot(i+1,j)]>=lengths[slot(i,j+1)]))i++;
        else j++;
      }
      blocks.push([a,i,b,j]);
    }
    return {left,right,blocks,coarse:false};
  }
  function revisionDiff(before,after) {
    if(before.length+after.length>24000)return {left:[before],right:[after],
      blocks:before===after?[]:[[0,1,0,1]],coarse:true};
    const segmenter = typeof Intl.Segmenter==='function' ? new Intl.Segmenter('zh',{granularity:'word'}) : null;
    const words = text => segmenter ? Array.from(segmenter.segment(text),part=>part.segment) : Array.from(text);
    const sentences = text => text.match(/[^。！？!?；;\n]*[。！？!?；;\n]|[^。！？!?；;\n]+$/gu) || [];
    const detailed = sequenceDiff(words(before),words(after));
    return detailed.coarse ? sequenceDiff(sentences(before),sentences(after)) : detailed;
  }
  function openVersionArchive(){
    const c=chapter();if(!c)return;
    const workId=state.selected, original={title:c.title,text:c.text};
    const hist=Array.isArray(c.history)?c.history.filter(h=>h&&typeof h.text==='string'):[];
    modal('历史版本',`<p class="small-note">${esc(c.title || '未命名章节')} · ${hist.length} 个版本</p>
      <div class="sw7-archive-items">${hist.length?hist.map((h,i)=>`<button class="sw7-archive-item" data-sw7-version="${esc(h.id)}"><span>${String(i+1).padStart(2,'0')}</span><div><strong>${esc(new Date(h.at).toLocaleString('zh-CN'))}</strong><small>${h.id&&h.id===c.blueprint?.finalId?'定稿快照':h.automatic?'自动快照':'手动存档'} · ${count(h.text)} 字${h.reason?' · '+esc(h.reason):''}</small></div>${ico('chevron')}</button>`).join(''):'<div class="empty-mini">暂无历史版本。可从写作工具手动保存一个版本。</div>'}</div>
      <div id="sw7ArchiveDetail"></div>`,root=>{
      root.classList.add('sw16-paper-modal','sw22-history');
      const detail=root.querySelector('#sw7ArchiveDetail');
      const buttons=[...root.querySelectorAll('[data-sw7-version]')],close=root.querySelector('#modalClose');
      let busy=false;
      root.closest('.modal-backdrop').addEventListener('click',event=>{
        if(busy&&event.target.classList.contains('modal-backdrop'))event.stopImmediatePropagation();
      },true);
      buttons.forEach((btn,index)=>btn.onclick=()=>{
        if(busy)return;
        for(const item of buttons)item.setAttribute('aria-pressed',String(item===btn));
        const h=hist[index],title=h.title??original.title;
        const diff=versionDiff(original.text,h.text);
        detail.innerHTML=`<section class="sw7-archive-diff">
          <div class="sw15-actions sw22-version-modes" role="group" aria-label="版本阅读方式">
          <button class="button outline" data-sw22-view="diff">差异</button>
          <button class="button outline" data-sw22-view="current">当前全文</button>
          <button class="button outline" data-sw22-view="saved">旧版全文</button></div>
          <div id="sw22-version-body"></div>
          <button class="button outline" id="sw7RestoreVersion" ${!diff.blocks.length&&title===original.title?'disabled':''}>恢复这个版本</button>
          <div id="sw22-restore-review" hidden>
            <p>恢复完整章名和正文，当前稿会先保存成快照。</p>
            <div class="sw15-actions"><button class="button outline" id="sw22-restore-cancel">取消</button>
            <button class="button primary" id="sw22-restore-confirm">确认恢复</button></div>
          </div><p class="small-note" id="sw22-version-status" role="status"></p></section>`;
        const body=detail.querySelector('#sw22-version-body'),modes=[...detail.querySelectorAll('[data-sw22-view]')];
        function chunk(lines,start,end,label){
          const excerpt=lines.slice(start,Math.min(end,start+24)).join('\n');
          const summary=end>start?`第 ${start+1}–${end} 行`:'无对应内容';
          return `<div><strong>${label} · ${summary}</strong><pre>${esc(excerpt.slice(0,800))}${excerpt.length>800||end-start>24?'…':''}</pre></div>`;
        }
        function paint(mode){
          for(const button of modes)button.setAttribute('aria-pressed',String(button.dataset.sw22View===mode));
          if(mode==='diff'){
            body.innerHTML=(title!==original.title?`<p>章名从「${esc(original.title)}」改为「${esc(title)}」。</p>`:'')+
              (diff.blocks.length?`<p>${diff.coarse?'差异范围较大，已合并展示。':`${diff.blocks.length} 处差异`} · 可切换全文核对。</p>`+
              diff.blocks.slice(0,40).map(([a,b,d,e])=>`<div class="sw7-diff-grid">${chunk(diff.left,a,b,'当前')}${chunk(diff.right,d,e,'旧版')}</div>`).join('')+
              (diff.blocks.length>40?'<p>仅显示前 40 处，全文仍可查看。</p>':''):'<p>正文相同。</p>');
          }else{
            body.innerHTML=`<h4>${esc((mode==='current'?original.title:title)||'未命名章节')}</h4><pre class="sw22-version-full" tabindex="0"></pre>`;
            body.querySelector('pre').textContent=(mode==='current'?original.text:h.text)||'（空白正文）';
          }
        }
        for(const button of modes)button.onclick=()=>paint(button.dataset.sw22View);
        paint('diff');
        const restore=detail.querySelector('#sw7RestoreVersion'),review=detail.querySelector('#sw22-restore-review');
        const confirm=detail.querySelector('#sw22-restore-confirm'),cancel=detail.querySelector('#sw22-restore-cancel');
        const status=detail.querySelector('#sw22-version-status');
        restore.onclick=()=>{review.hidden=false;restore.hidden=true;cancel.focus();};
        cancel.onclick=()=>{review.hidden=true;restore.hidden=false;status.textContent='';restore.focus();};
        confirm.onclick=async()=>{
          if(busy)return;
          if(state.selected!==workId||chapter()?.id!==c.id){status.textContent='当前章节已切换，请重新打开历史版本。';return;}
          busy=confirm.disabled=cancel.disabled=close.disabled=true;
          status.textContent='正在保存…';
          try{
            await commitChapterEdit(c.id,h.text,title,'恢复历史版本之前的当前稿',original);
            closeModal();render();toast('已恢复旧版本；恢复前的正文已保留');
          }catch(error){status.textContent='恢复失败：'+error.message;}
          finally{busy=confirm.disabled=cancel.disabled=close.disabled=false;}
        };
      });
      buttons[0]?.click();
    });
  }
  openHistory=openVersionArchive;
  function closeReferenceDrawer(){
    document.getElementById('sw7DrawerRoot')?.remove();
    if(drawerEscapeListener){document.removeEventListener('keydown',drawerEscapeListener);drawerEscapeListener=null;}
  }
  function openReferenceDrawer(back){
    const p=project(),c=chapter();if(!p||!c)return toast('请先打开一章正文');
    closeReferenceDrawer();
    const ta=document.getElementById('chapterText');const selection=ta?{start:ta.selectionStart,end:ta.selectionEnd}:null;
    const container=document.createElement('div');container.id='sw7DrawerRoot';
    container.innerHTML=`<div class="sw7-drawer-mask" data-sw7-close="1"></div><aside class="sw7-reference-drawer" role="dialog" aria-modal="true" aria-label="人物速查">
      <header class="sw7-drawer-top"><div><span class="tiny-label">CHARACTER REFERENCE · 作者视角</span><h2>人物速查</h2><p>不离开正文，核对人物的行为、关系和当下认知。</p></div><button class="sw7-close" id="sw7DrawerClose" aria-label="关闭人物速查">×</button></header>
      <div class="sw7-drawer-filter"><input type="search" placeholder="搜索人物姓名或身份" id="sw7RoleFilter" aria-label="查找人物"></div>
      <div id="sw7RoleCards" class="sw7-role-cards"></div><div id="sw7RoleDetail"></div>
      <div class="sw7-drawer-foot">当前为作者资料视图；人物 Agent 仍必须使用独立的角色认知权限。</div>
      </aside>`;
    document.body.append(container);
    const close=()=>{
      closeReferenceDrawer();
      if(typeof back==='function'&&tab==='write'&&project()?.id===p.id&&chapter()?.id===c.id)back();
      else ta?.focus();
    };
    container.querySelector('#sw7DrawerClose').onclick=close;
    container.querySelector('.sw7-drawer-mask').onclick=close;
    drawerEscapeListener=e=>{if(e.key==='Escape')close();};document.addEventListener('keydown',drawerEscapeListener);
    const cards=container.querySelector('#sw7RoleCards'),details=container.querySelector('#sw7RoleDetail');
    const people=characters().slice().sort((a,b)=>Number(Boolean(c.text?.includes(b.name)))-Number(Boolean(c.text?.includes(a.name))));
    let current=people[0]?.id||null;
    function paintDetail(){
      const r=people.find(x=>x.id===current);
      if(!r){details.innerHTML='<div class="empty-mini">还没有人物档案。可从「人物」页面创建。</div>';return;}
      let beliefs=[];
      try{beliefs=window.StoryWeaveCanon?.roleBoundContext(r.id,c.id)?.subjectiveKnowledge||[];}catch(err){console.warn(err);}
      details.innerHTML=`<section class="sw7-person-summary"><div class="sw7-person-identity"><span class="sw7-person-monogram">${esc(short(r.name,1))}</span><div><h3>${esc(r.name)}</h3><p>${esc(r.role||'身份尚未设置')}</p></div></div>
        <div class="sw7-person-facts"><div><span>性格与行事风格</span><p>${esc(r.personality||'暂无记录')}</p></div><div><span>当前目标</span><p>${esc(r.goal||'暂无记录')}</p></div><div><span>人物自己的知识</span><p>${esc(r.knowledge||'暂无记录')}</p></div><div><span>作者设定的秘密</span><p>${esc(r.secret||'暂无记录')}</p></div></div>
        <div class="sw7-knows"><strong>截至本章的认知</strong>${beliefs.length?beliefs.slice(0,12).map(b=>`<p><em>${esc(b.certainty)}</em>${esc(b.description)}</p>`).join(''):'<p>没有单独记录本章之前的事实认知。</p>'}</div>
        <div class="sw7-role-buttons"><button class="button light" id="sw7InsertName">插入人物名</button><button class="button outline" id="sw7OpenRole">编辑完整档案</button></div></section>`;
      details.querySelector('#sw7InsertName').onclick=()=>{
        if(!ta){toast('找不到正文输入框');return;}
        const a=selection?.start??ta.value.length,b=selection?.end??a;
        closeReferenceDrawer();ta.focus();ta.setRangeText(r.name,a,b,'end');ta.dispatchEvent(new Event('input',{bubbles:true}));toast('已插入人物姓名');
      };
      details.querySelector('#sw7OpenRole').onclick=()=>{closeReferenceDrawer();go('characters');openRole(r.id);};
    }
    function paintList(){const query=norm(container.querySelector('#sw7RoleFilter').value.trim());
      const filtered=people.filter(r=>norm(r.name+' '+(r.role||'')).includes(query));
      cards.innerHTML=filtered.map(r=>`<button data-sw7-role="${esc(r.id)}" class="sw7-role-chip ${r.id===current?'is-active':''}">${esc(r.name)}${c.text?.includes(r.name)?'<i>本章</i>':''}</button>`).join('')||'<span class="empty-mini">没有找到人物。</span>';
      cards.querySelectorAll('[data-sw7-role]').forEach(button=>button.onclick=()=>{current=button.dataset.sw7Role;paintList();paintDetail();});
    }
    container.querySelector('#sw7RoleFilter').addEventListener('input',paintList);paintList();paintDetail();
  }
  function quickBackup(){
    if(!state)return toast('尚无可备份的数据');
    const filename=`StoryWeave-安全备份-${new Date().toISOString().slice(0,10)}.json`;
    downloadFile(filename,JSON.stringify({...state,exportedAt:time()},null,2),'application/json;charset=utf-8');
    toast('已请求导出完整 JSON 备份，请确认文件实际保存成功');
  }
  const oldWritePage=writePage;
  writePage=function(){
    let page=oldWritePage(),p=project(),c=chapter();if(!p||!c)return page;
    const idx=p.chapters.findIndex(x=>x.id===c.id);
    const compact=`<div class="sw7-chapter-navigator"><div><span class="tiny-label">MANUSCRIPT WORKSPACE · ${String(idx+1).padStart(2,'0')} / ${String(p.chapters.length).padStart(2,'0')}</span><strong>${esc(c.title||'未命名章节')}</strong><small>全书 ${wordsIn(p).toLocaleString()} 字 · 当前章 ${count(c.text).toLocaleString()} 字</small></div><div class="sw7-nav-pair"><button data-action="sw7-prev" aria-label="上一章" ${idx<=0?'disabled':''}>${ico('chevron')}</button><button data-action="sw7-next" aria-label="下一章" ${idx>=p.chapters.length-1?'disabled':''}>${ico('chevron')}</button></div></div>`;
    const tools=`<div class="sw7-editor-utilities"><button data-action="sw7-find">${ico('search')}<span>查找替换</span></button><button data-action="sw7-reference">${ico('users')}<span>人物速查</span></button><button data-action="sw7-backup">${ico('download')}<span>备份</span></button></div>`;
    page=page.replace('<div class="editor-shell">',compact+'<div class="editor-shell">');
    page=page.replace('<div class="editor-footer">',tools+'<div class="editor-footer">');
    return page;
  };
  const oldWireWriter=wireWriter;
  wireWriter=function(){
    oldWireWriter();const textArea=document.getElementById('chapterText');if(!textArea)return;
    paintSearchBar(textArea);
    const invalidateSearch=()=>{if(searchSession?.work.id===state.selected)searchSession.dirty=true;};
    textArea.addEventListener('input',invalidateSearch);
    document.getElementById('chapterTitle')?.addEventListener('input',invalidateSearch);
    textArea.addEventListener('keydown',e=>{
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'){e.preventDefault();openChapterFind();}
      if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='b'){e.preventDefault();quickBackup();}
    });
  };
  const oldAct=act;
  act=function(action,x){
    if(action==='sw7-find')return openChapterFind();
    if(action==='sw7-reference')return openReferenceDrawer(x);
    if(action==='sw7-backup')return quickBackup();
    if(action==='sw7-prev')return moveChapter(-1);
    if(action==='sw7-next')return moveChapter(1);
    return oldAct(action,x);
  };
  window.StoryWeaveEditor={findMatches,chapterMatches,searchReferences,commitChapterEdit,previewComparison,revisionDiff,quickBackup};
})();
