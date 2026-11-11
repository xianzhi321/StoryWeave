(() => {
  'use strict';
  const archived = ['sceneCards','annotations','plotChapterLinks','relationshipHistory','characterGrowth',
    'storyBranches','archiveRecords','auditFindings'];
  const detached = ['timelineEvents','plots','events'];
  const entries = work => Array.isArray(work?.chapterTrash) ? work.chapterTrash : [];
  const scoped = (row, work, ch) => row?.projectId === work.id && row.chapterId === ch.id;

  function updateWork(projectId, change) {
    return StoryWeaveWorkspace.transact(next => {
      const work = next.projects.find(row => row.id === projectId);
      if (!work || next.selected !== projectId) throw Error('作品已切换');
      next.projects = next.projects.map(row => row === work ? change(next,work) : row);
    });
  }
  function moveToTrash(projectId, key) {
    return updateWork(projectId, (next,work) => {
      const index = work.chapters.findIndex(row => row.id === key);
      if (index < 0) throw Error('章节已不在目录');
      const ch = work.chapters[index];
      const sameVolume = row => (row.volumeId || '') === (ch.volumeId || '');
      const beforeId = work.chapters.slice(index+1).find(sameVolume)?.id || '';
      const afterId = work.chapters.slice(0,index).reverse().find(sameVolume)?.id || '';
      const canon = (next.canonFacts || []).some(row => row.projectId === work.id &&
        Object.values(row.views || {}).some(view => view?.sinceChapterId === key));
      const proposal = (next.knowledgeProposals || []).some(row => row.projectId === work.id &&
        row.status === 'pending' && row.sinceChapterId === key);
      if (canon || proposal) throw Error('本章是人物认知的生效章节，或有待审核的认知建议。请先在世界设定中调整或处理这些记录。');
      const records = {}, references = {};
      for (const name of archived) {
        const rows = next[name] || [];
        records[name] = rows.filter(row => scoped(row,work,ch));
        next[name] = rows.filter(row => !scoped(row,work,ch));
      }
      for (const name of detached) {
        const rows = next[name] || [];
        references[name] = rows.filter(row => scoped(row,work,ch)).map(row => row.id);
        next[name] = rows.map(row => scoped(row,work,ch) ? {...row,chapterId:''} : row);
      }
      const knowledgeCards = (work.knowledgeCards || []).map(row => {
        if (!row.chapterIds?.includes(key)) return row;
        (references.knowledgeCards ||= []).push(row.id);
        return {...row,chapterIds:row.chapterIds.filter(value => value !== key)};
      });
      const entry = {chapter:ch,index,beforeId,afterId,deletedAt:time(),records,references};
      return {...work,knowledgeCards,chapters:work.chapters.filter(row => row.id !== key),
        chapterTrash:[entry,...entries(work)]};
    });
  }
  function restore(projectId, key) {
    return updateWork(projectId, (next,work) => {
      const entry = entries(work).find(row => row.chapter.id === key);
      if (!entry || work.chapters.some(row => row.id === key)) throw Error('回收站中的章节已变化');
      const volumeRanks = new Map((work.volumes || []).map((row,index) => [row.id,index]));
      const volumeOf = row => volumeRanks.has(row.volumeId) ? row.volumeId : '';
      const ch = {...entry.chapter,volumeId:volumeOf(entry.chapter)};
      const chapters = work.chapters.slice();
      const anchor = id => chapters.findIndex(row => row.id === id && volumeOf(row) === ch.volumeId);
      const before = anchor(entry.beforeId), after = anchor(entry.afterId);
      const index = before >= 0 ? before : after >= 0 ? after+1 : Math.min(entry.index,chapters.length);
      chapters.splice(index,0,ch);
      chapters.sort((a,b) => (volumeRanks.get(a.volumeId) ?? volumeRanks.size) - (volumeRanks.get(b.volumeId) ?? volumeRanks.size));
      for (const name of detached) {
        const links = new Set(entry.references[name] || []);
        next[name] = (next[name] || []).map(row => row.projectId === work.id && !row.chapterId && links.has(row.id)
          ? {...row,chapterId:key} : row);
      }
      const cards = new Set(entry.references.knowledgeCards || []);
      const knowledgeCards = (work.knowledgeCards || []).map(row => cards.has(row.id)
        ? {...row,chapterIds:[...new Set([...(row.chapterIds || []),key])]} : row);
      const updated = {...work,chapters,knowledgeCards,chapterTrash:entries(work).filter(row => row !== entry)};
      const incoming = {};
      const roles = next.characters.filter(row => row.projectId === work.id);
      const events = next.timelineEvents.filter(row => row.projectId === work.id);
      for (const name of archived) {
        const existing = new Set((next[name] || []).map(row => row.id));
        incoming[name] = (entry.records[name] || []).filter(row => !existing.has(row.id));
        if (name === 'sceneCards') incoming[name] = incoming[name].map(row => StoryWeaveArchiveCore.cleanScene(row,roles,events));
      }
      const candidate = {...next,projects:next.projects.map(row => row === work ? updated : row)};
      for (const name of archived) candidate[name] = [...(next[name] || []),...incoming[name]];
      // Reuse the normal backup checks to avoid restoring links to records removed in the meantime.
      const checked = normalizeBackup(candidate);
      for (const name of archived) {
        const ids = new Set(incoming[name].map(row => row.id));
        next[name] = [...(next[name] || []),...(checked[name] || []).filter(row => ids.has(row.id))];
      }
      return updated;
    });
  }
  function wire(root, button, operation, done) {
    const close = root.querySelector('#modalClose');
    root.closest('.modal-backdrop').addEventListener('click',event => {
      if (close.disabled && event.target.classList.contains('modal-backdrop')) event.stopImmediatePropagation();
    },true);
    button.onclick = async () => {
      if (close.disabled) return;
      close.disabled = button.disabled = true;
      try {
        await operation();
        if (root.isConnected) done();
      } catch (error) {
        root.querySelector('[role="status"]').textContent = '操作失败：' + error.message;
      } finally {
        close.disabled = button.disabled = false;
      }
    };
  }
  function askMove(key = chapter()?.id) {
    const work = project(), ch = work?.chapters.find(row => row.id === key);
    if (!ch) return;
    modal('移入章节回收站', `<p>《${esc(ch.title || '未命名章节')}》将从目录移除，正文、历史版本和专属记录可从回收站恢复。世界事件和伏笔本身会保留。</p>
      <p role="status"></p><button class="button primary" id="sw17-confirm-trash">移入回收站</button>`, root => {
      wire(root,root.querySelector('#sw17-confirm-trash'),() => moveToTrash(work.id,key),() => {
        closeModal();
        if (chapterId === key) chapterId = chapters()[0]?.id || null;
        go('contents');
        toast('已移入章节回收站');
      });
    });
  }
  function openTrash() {
    const work = project();
    if (!work) return;
    modal('章节回收站', `<p role="status" class="small-note">回收站内容随作品备份保存。</p>
      ${entries(work).map(row => `<div class="context-card"><strong>${esc(row.chapter.title || '未命名章节')}</strong>
        <small>${count(row.chapter.text)} 字 · ${esc(dated(row.deletedAt))}</small>
        <button class="button outline" data-sw17-restore="${esc(row.chapter.id)}">恢复章节</button></div>`).join('') || '<p>回收站为空。</p>'}`,
    root => {
      for (const button of root.querySelectorAll('[data-sw17-restore]')) {
        wire(root,button,() => restore(work.id,button.dataset.sw17Restore),() => {
          closeModal();go('contents');toast('章节已恢复');
        });
      }
    });
  }
  const priorNormalize = normalizeBackup;
  normalizeBackup = function (data) {
    const clean = priorNormalize(data);
    const projects = clean.projects.map(work => {
      const seen = new Set(work.chapters.map(row => row.id)), chapterTrash = [];
      for (const entry of entries(work)) {
        const ch = entry?.chapter;
        if (!ch || typeof ch.id !== 'string' || !ch.id || seen.has(ch.id) ||
          typeof ch.text !== 'string' || typeof ch.title !== 'string') continue;
        seen.add(ch.id);
        const records = {}, references = {};
        for (const name of archived) {
          const rows = entry.records?.[name];
          records[name] = Array.isArray(rows) ? rows.filter(row => scoped(row,work,ch) && typeof row.id === 'string') : [];
        }
        for (const name of [...detached,'knowledgeCards']) {
          const ids = entry.references?.[name];
          references[name] = Array.isArray(ids) ? [...new Set(ids.filter(value => typeof value === 'string'))] : [];
        }
        chapterTrash.push({chapter:ch,index:Number.isInteger(entry.index) ? Math.max(0,entry.index) : work.chapters.length,
          beforeId:typeof entry.beforeId === 'string' ? entry.beforeId : '',
          afterId:typeof entry.afterId === 'string' ? entry.afterId : '',
          deletedAt:typeof entry.deletedAt === 'string' ? entry.deletedAt : '',records,references});
      }
      return {...work,chapterTrash};
    });
    return {...clean,projects,version:17};
  };
  const priorAct = act;
  act = function (action,key) {
    if (action === 'v17-trash') return openTrash();
    if (action === 'v17-remove-chapter') return askMove(key);
    return priorAct(action,key);
  };
})();
