(() => {
  'use strict';
  const shared = new Set(['documents','skills','skillPresets','distillationJobs']);
  const chapterKeys = work => [...work.chapters.map(row=>row.id),...(work.chapterTrash||[]).map(row=>row.chapter.id)];
  let reading = false;

  function verifyIdentities(data) {
    const books = new Set(), chapters = new Set();
    for (const work of data.projects) {
      if (!work.id || books.has(work.id)) throw Error('备份含有重复或空白的作品 ID');
      books.add(work.id);
      for (const key of chapterKeys(work)) {
        if (!key || chapters.has(key)) throw Error('备份含有重复或空白的章节 ID');
        chapters.add(key);
      }
    }
  }

  function appendBackup(local, incoming) {
    const existing = new Set(local.projects.map(work=>work.id));
    const books = incoming.projects.filter(work=>!existing.has(work.id));
    if (local.projects.length+books.length>2000) throw Error('合并后的作品数量超过上限');
    const incomingBooks = new Set(books.map(work=>work.id));
    const occupiedChapters = new Set(local.projects.flatMap(chapterKeys));
    for (const work of books) {
      if (chapterKeys(work).some(key=>occupiedChapters.has(key))) throw Error('新作品含与本机重复的章节 ID，无法安全追加');
    }
    const updates = {projects:[...local.projects,...books]};
    let records = 0;
    for (const [name,rows] of Object.entries(incoming)) {
      if (name==='projects'||!Array.isArray(rows)) continue;
      const kept = local[name]||[];
      const occupied = new Map(kept.map(row=>[row?.id,row]));
      const added = [];
      for (const row of rows) {
        if (!row || !(row.projectId==null ? shared.has(name) : incomingBooks.has(row.projectId))) continue;
        if (typeof row.id!=='string'||!row.id) throw Error('备份中有资料缺少 ID，无法安全追加');
        if (occupied.has(row.id)) {
          const prior=occupied.get(row.id);
          if (row.projectId!=null||prior?.projectId!=null) throw Error('有作品资料与本机使用相同 ID，无法安全追加');
          if (name==='documents'&&prior.text!==row.text) throw Error('同一参考书 ID 对应不同原文，无法安全追加');
          continue;
        }
        occupied.set(row.id,row);
        added.push(row);
      }
      if (added.length) {
        updates[name]=[...kept,...added];
        records+=added.length;
      }
    }
    if (!existing.has(local.selected)) updates.selected=books.find(work=>work.id===incoming.selected)?.id||books[0]?.id||local.projects[0]?.id||null;
    return {updates,added:books.length,skipped:incoming.projects.length-books.length,records};
  }

  function preview(incoming,filename,exportedAt) {
    const chapters=incoming.projects.reduce((sum,work)=>sum+work.chapters.length,0);
    const recycled=incoming.projects.reduce((sum,work)=>sum+work.chapterTrash.length,0);
    const localIds=new Set(state.projects.map(work=>work.id));
    const listed=incoming.projects.slice(0,60);
    modal('预览备份',`<p class="small-note sw22-backup-filename">${esc(filename)}</p>
      ${exportedAt?`<p class="small-note">备份时间 ${esc(exportedAt)}</p>`:''}
      <p>备份中有 ${incoming.projects.length} 部作品、${chapters} 章、${incoming.documents.length} 份参考书和 ${incoming.skills.length} 项写作技能。${recycled?` 回收站有 ${recycled} 章。`:''}</p>
      <ul class="sw22-backup-list">${listed.map(work=>`<li><strong>${esc(work.title)}</strong>
        <span>${work.chapters.length} 章${localIds.has(work.id)?' · 本机已有':''}</span></li>`).join('')}</ul>
      ${listed.length<incoming.projects.length?'<p class="small-note">此处列出前 60 部作品。</p>':''}
      <fieldset class="sw22-backup-mode"><legend>导入方式</legend>
        <label><input type="radio" name="sw22-restore-mode" value="append" checked> 追加新作品和资料</label>
        <label><input type="radio" name="sw22-restore-mode" value="replace"> 整库恢复</label>
      </fieldset>
      <p id="sw22-backup-summary" class="small-note" role="status"></p>
      <div id="sw22-replace-check" hidden>
        <button type="button" class="button outline" id="sw22-backup-first">导出当前备份</button>
        <label><input type="checkbox" id="sw22-confirm-replace"> 我确认用备份替换本机作品、资料与模型配置</label>
      </div>
      <p class="small-note" id="sw22-backup-status" role="status"></p>
      <button type="button" class="button primary" id="sw22-restore-backup">追加导入</button>`,root=>{
      root.classList.add('sw22-backup-preview');
      const summary=root.querySelector('#sw22-backup-summary'),status=root.querySelector('#sw22-backup-status');
      const restore=root.querySelector('#sw22-restore-backup'),close=root.querySelector('#modalClose');
      const modes=root.querySelector('fieldset'),check=root.querySelector('#sw22-confirm-replace');
      const replacePanel=root.querySelector('#sw22-replace-check');
      let busy=false, plan=null;
      const isReplacing=()=>modes.querySelector('input:checked').value==='replace';
      function paint(){
        const replace=isReplacing();
        replacePanel.hidden=!replace;
        restore.textContent=replace?'确认整库恢复':'追加导入';
        if (replace) summary.textContent=`将替换本机现有的 ${state.projects.length} 部作品及其资料。`;
        else {
          try {
            plan=appendBackup(state,incoming);
            summary.textContent=`将追加 ${plan.added} 部作品和 ${plan.records} 条资料，跳过 ${plan.skipped} 部本机已有作品。本机模型配置优先保留。`;
          } catch (error) { plan=null;summary.textContent=error.message; }
        }
        restore.disabled=busy||(replace?!check.checked:!plan||!(plan.added||plan.records));
      }
      modes.onchange=()=>{check.checked=false;status.textContent='';paint();};
      check.onchange=paint;
      root.querySelector('#sw22-backup-first').onclick=StoryWeaveEditor.quickBackup;
      root.closest('.modal-backdrop').addEventListener('click',event=>{
        if(busy&&event.target.classList.contains('modal-backdrop'))event.stopImmediatePropagation();
      },true);
      restore.onclick=async()=>{
        if(restore.disabled||busy)return;
        const replace=isReplacing();
        busy=close.disabled=modes.disabled=check.disabled=restore.disabled=true;
        status.textContent='正在写入本机…';
        try {
          await StoryWeaveWorkspace.transact(next=>{
            if (replace) {
              for (const name of Object.keys(next)) delete next[name];
              Object.assign(next,incoming);
            } else {
              const latest=appendBackup(next,incoming);
              if(!latest.added&&!latest.records) throw Error('没有可追加的作品或资料');
              Object.assign(next,latest.updates);
            }
          });
          chapterId=StoryWeaveDesk.resumeChapter(project())||project()?.chapters[0]?.id||null;
          closeModal();go('home');
          toast(replace?'整库恢复已完成':'备份已追加，本机原有作品已保留');
        } catch (error) {
          status.textContent='导入失败，本机资料保持原样。'+error.message;
        } finally {
          busy=close.disabled=modes.disabled=check.disabled=false;
          if(root.isConnected)paint();
        }
      };
      paint();
    });
  }

  async function read(event) {
    const input=event.target,file=input.files?.[0];
    input.value='';
    if (!file||reading) return;
    if (file.size>35*1024*1024) return toast('备份超过 35 MB，无法预览');
    reading=true;
    try {
      const data=JSON.parse(await file.text());
      const incoming=normalizeBackup(data);
      verifyIdentities(incoming);
      const stamp=typeof data.exportedAt==='string'?Date.parse(data.exportedAt):NaN;
      preview(incoming,file.name,Number.isFinite(stamp)?new Date(stamp).toLocaleString('zh-CN'):'');
    } catch (error) { toast('无法读取备份：'+short(error.message,90)); }
    finally {reading=false;}
  }
  window.StoryWeaveBackup={read};
})();
