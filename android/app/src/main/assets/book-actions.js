(() => {
  'use strict';
  const ownedCollections = ['characters','relations','documents','events','plots','sceneCards','annotations',
    'canonFacts','storyBranches','knowledgeProposals','writingFeedback','plotChapterLinks','relationshipHistory',
    'timelineEvents','auditFindings','characterGrowth','archiveRecords','worldMaps','worldPlaces','skills','skillPresets','distillationJobs'];
  const getItem = (kind,key) => (kind === 'book' ? state.projects : state.documents).find(row => row.id === key);
  const groupOf = work => typeof work.shelfGroup === 'string' ? work.shelfGroup.trim().slice(0,40) : '';
  let groupFilter = '', shelfQuery = '', filtersOpen = false;
  const shelfText = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase();

  function removeFromState(next,kind,key) {
    const projects = next.projects;
    const documents = next.documents || [];
    if (kind === 'reference') {
      if (!documents.some(row => row.id === key)) throw Error('参考书籍已不存在');
      next.documents = documents.filter(row => row.id !== key);
      next.distillationJobs = (next.distillationJobs || []).filter(row => row.docId !== key);
      return;
    }
    const index = projects.findIndex(row => row.id === key);
    if (index < 0) throw Error('作品已不存在');
    const removedDocuments = new Set(documents.filter(row => row.projectId === key).map(row => row.id));
    const removedSkills = new Set(next.skills.filter(row => row.projectId === key).map(row => row.id));
    next.projects = projects.filter(row => row.id !== key);
    for (const name of ownedCollections) {
      if (Array.isArray(next[name])) next[name] = next[name].filter(row => row?.projectId !== key);
    }
    next.distillationJobs = (next.distillationJobs || []).filter(row => !removedDocuments.has(row.docId));
    next.skillPresets = next.skillPresets.map(row => {
      if (!row.skillIds?.some(id => removedSkills.has(id))) return row;
      return { ...row, skillIds: row.skillIds.filter(id => !removedSkills.has(id)) };
    });
    if (next.selected === key) next.selected = next.projects[Math.min(index,next.projects.length - 1)]?.id || null;
  }
  function confirmRemoval(kind,key) {
    const item = getItem(kind,key);
    if (!item) return toast('书籍已不存在');
    const work = kind === 'book';
    modal(work ? '删除作品' : '删除参考书籍', `<p class="sw18-delete-name">《${esc(item.title || '未命名')}》</p>
      <p>${work ? '将永久删除此作品的正文、章节回收站和专属资料。' : '将删除参考原文和相关分析任务，已保存的写作技能会保留。'}</p>
      <p class="small-note" role="status"></p><div class="sw15-actions">
      <button class="button outline" id="sw18-cancel">取消</button>
      <button class="button primary sw18-danger-button" id="sw18-confirm">永久删除</button></div>`, root => {
      const confirm = root.querySelector('#sw18-confirm'), cancel = root.querySelector('#sw18-cancel');
      const close = root.querySelector('#modalClose'), status = root.querySelector('[role="status"]');
      cancel.onclick = closeModal;
      root.closest('.modal-backdrop').addEventListener('click',event => {
        if (confirm.disabled && event.target.classList.contains('modal-backdrop')) event.stopImmediatePropagation();
      },true);
      confirm.onclick = async () => {
        if (confirm.disabled) return;
        confirm.disabled = cancel.disabled = close.disabled = true;
        status.textContent = '正在保存…';
        try {
          await StoryWeaveWorkspace.transact(next => removeFromState(next,kind,key));
          if (work && !chapters().some(ch => ch.id === chapterId)) {
            chapterId = StoryWeaveDesk.resumeChapter(project()) || chapters()[0]?.id || null;
          }
          if (root.isConnected) closeModal();
          if (work) go('home'); else render();
          toast(work ? '作品已删除' : '参考书籍已删除');
        } catch (error) {
          status.textContent = '删除失败，书籍仍保留。' + error.message;
        } finally {
          confirm.disabled = cancel.disabled = close.disabled = false;
        }
      };
    });
  }
  function changeShelf(key,fields) {
    return StoryWeaveWorkspace.transact(next => {
      if (!next.projects.some(row => row.id === key)) throw Error('作品已不存在');
      next.projects = next.projects.map(row => row.id === key ? {...row,...fields} : row);
    });
  }
  function openGroup(work) {
    const groups = [...new Set(state.projects.map(groupOf).filter(Boolean))];
    modal('移至分组', `<div class="field"><label for="sw18-group">分组名称（留空即取消分组）</label>
      <input id="sw18-group" name="group" maxlength="40" list="sw18-group-list" value="${esc(groupOf(work))}">
      <datalist id="sw18-group-list">${groups.map(group => `<option value="${esc(group)}"></option>`).join('')}</datalist></div>
      <p role="status" class="small-note"></p><button class="button primary" id="sw18-save-group">保存分组</button>`, root => {
      const button = root.querySelector('#sw18-save-group');
      button.onclick = async () => {
        if (button.disabled) return;
        button.disabled = true;
        try {
          await changeShelf(work.id,{shelfGroup:formVal(root,'group').slice(0,40)});
          if (root.isConnected) closeModal();
          render();
        } catch (error) {
          root.querySelector('[role="status"]').textContent = '保存失败：' + error.message;
        } finally {
          button.disabled = false;
        }
      };
    });
  }
  function details(kind,item) {
    const rows = kind === 'book' ? [
      ['分组',groupOf(item) || '未分组'],['类型',item.genre || '未填写'],
      ['篇幅',`${item.volumes?.length || 0} 卷 · ${item.chapters.length} 章 · ${wordsIn(item)} 字`],
      ['简介',item.summary || '未填写']
    ] : [['篇幅',count(item.text) + ' 字'],['格式',item.type || '文本']];
    modal('书籍详情', `<h3 class="sw18-delete-name">${esc(item.title)}</h3><dl class="sw18-details">
      ${rows.map(([label,value]) => `<dt>${label}</dt><dd>${esc(value)}</dd>`).join('')}</dl>`);
  }
  async function share(work) {
    const text = bookText(work);
    if (text.length > 250000) return toast('这部作品较长，请先导出 TXT 文件再分享');
    try {
      if (typeof window.StoryBridge?.shareBookText === 'function') window.StoryBridge.shareBookText(work.title,text);
      else if (navigator.share) await navigator.share({title:work.title,text});
    } catch (error) {
      if (error.name !== 'AbortError') toast('分享未完成，可通过导出 TXT 分享');
    }
  }
  function openMenu(kind,key) {
    const item = getItem(kind,key);
    if (!item) return;
    const canShare = typeof window.StoryBridge?.shareBookText === 'function' || typeof navigator.share === 'function';
    const items = kind === 'book' ? [
      ['edit','重命名与编辑','feather'],['group','移至分组','book'],
      ...(canShare ? [['share','分享作品','arrow']] : []),
      ['export','导出书稿','download'],['pin',item.pinned ? '取消置顶' : '置顶作品','chevron'],
      ['details','详情','scroll'],['delete','删除作品','trash']
    ] : [['distill','提炼技能','sparkles'],['export','导出原文','download'],['details','详情','scroll'],['delete','删除参考书','trash']];
    modal('书籍操作', `<p class="sw18-menu-title">${esc(item.title || '未命名')}</p><div class="sw18-menu-grid">
      ${items.map(([action,label,icon]) => `<button type="button" data-sw18-item="${action}">
        <span aria-hidden="true">${ico(icon)}</span>${label}</button>`).join('')}</div>`, root => {
      root.classList.add('sw18-menu');
      root.querySelector('#modalClose')?.focus({preventScroll:true});
      for (const button of root.querySelectorAll('[data-sw18-item]')) button.onclick = async () => {
        const live = getItem(kind,key);
        if (!live) return toast('书籍已不存在');
        const action = button.dataset.sw18Item;
        if (action === 'delete') return confirmRemoval(kind,key);
        if (action === 'details') return details(kind,live);
        if (action === 'edit') return openProject(key,'home');
        if (action === 'group') return openGroup(live);
        if (action === 'distill') return openDistill(key);
        if (action === 'share') return share(live);
        if (action === 'export') {
          if (kind === 'book') return act('sw25-export',live.id);
          return downloadFile((safeFilename(live.title) || '参考书籍') + '.txt',live.text);
        }
        if (action === 'pin') {
          if (button.disabled) return;
          button.disabled = true;
          try {
            await changeShelf(key,{pinned:!live.pinned});
            if (root.isConnected) closeModal();
            render();
            toast(live.pinned ? '已取消置顶' : '已置顶');
          } catch (error) {
            toast('保存失败：' + error.message);
          } finally {
            button.disabled = false;
          }
        }
      };
    });
  }
  function bindGesture(element,kind,key) {
    let pending, suppress = false;
    const cancel = () => {
      clearTimeout(pending?.timer);
      pending = null;
    };
    element.addEventListener('pointerdown',event => {
      cancel();
      suppress = false;
      if (!event.isPrimary || event.button !== 0 || !['touch','pen'].includes(event.pointerType)) return;
      if (kind === 'reference' && event.target.closest('button')) return;
      const {pointerId,clientX,clientY} = event;
      pending = {pointerId,clientX,clientY,timer:setTimeout(() => {
        if (!element.isConnected || document.querySelector('#modalRoot .modal')) return;
        suppress = true;
        openMenu(kind,key);
      },550)};
    });
    element.addEventListener('pointermove',event => {
      if (event.pointerId === pending?.pointerId && Math.hypot(event.clientX-pending.clientX,event.clientY-pending.clientY) > 12) cancel();
    });
    for (const type of ['pointerup','pointercancel','pointerleave']) element.addEventListener(type,cancel);
    element.addEventListener('click',event => {
      if (!suppress) return;
      suppress = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    },true);
    element.addEventListener('contextmenu',event => {
      event.preventDefault();
      if (event.pointerType === 'touch' || event.pointerType === 'pen' || suppress || pending) return;
      openMenu(kind,key);
    });
    element.addEventListener('keydown',event => {
      if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
      event.preventDefault();
      openMenu(kind,key);
    });
  }
  function addMore(container,kind,key,title) {
    const more = document.createElement('button');
    more.className = 'sw18-more';
    more.type = 'button';
    more.textContent = '⋯';
    more.setAttribute('aria-label','操作：' + title);
    more.setAttribute('aria-haspopup','dialog');
    more.onclick = () => openMenu(kind,key);
    container.append(more);
  }
  function enhanceShelf() {
    const shelf = document.querySelector('#screen .books');
    if (!shelf) return;
    const cards = [...shelf.querySelectorAll('.book-card[data-id]')];
    const groups = [...new Set(state.projects.map(groupOf).filter(Boolean))];
    const rows = cards.map(card => {
      const work = getItem('book',card.dataset.id);
      const wrapper = document.createElement('div');
      wrapper.className = 'sw18-card-wrap';
      card.before(wrapper);
      wrapper.append(card);
      bindGesture(card,'book',work.id);
      addMore(wrapper,'book',work.id,work.title);
      if (work.pinned) {
        const flag = document.createElement('span');
        flag.className = 'sw18-pinned';
        flag.textContent = '置顶';
        wrapper.append(flag);
      }
      return {work,wrapper,terms:shelfText([work.title,work.genre,groupOf(work)].filter(Boolean).join(' '))};
    });
    rows.sort((a,b) => Number(!!b.work.pinned) - Number(!!a.work.pinned));
    for (const row of rows) shelf.append(row.wrapper);
    const recent = StoryWeaveDesk.lastOpenedChapter();
    if (recent) {
      const resume = document.createElement('button');
      resume.id = 'sw37-resume';
      resume.type = 'button';
      resume.innerHTML = `<span class="sw37-resume-text"><small>上次打开</small><strong>${esc(recent.work.title || '未命名作品')}</strong>
        <span>${esc(recent.chapter.title || '未命名章节')}</span></span><span class="sw37-resume-label">继续写 ›</span>`;
      resume.onclick = () => {
        if (tab !== 'home') return;
        const work = getItem('book',recent.work.id);
        const target = work?.chapters.find(row => row.id === recent.chapter.id);
        if (!target) {render();return toast('上次打开的章节已移除');}
        state.selected = work.id;
        chapterId = target.id;
        queueSave();
        go('write');
      };
      shelf.before(resume);
    }
    if (!rows.length) {
      groupFilter = shelfQuery = '';
      filtersOpen = false;
      return;
    }
    const showGroups = groups.length > 0;
    if (!showGroups) groupFilter = '';
    const controls = document.createElement('details');
    controls.id = 'shelf-filters';
    controls.className = 'sw37-shelf-filter';
    controls.open = filtersOpen || Boolean(groupFilter || shelfQuery);
    controls.innerHTML = `<summary>查找作品 <small id="sw37-filter-indicator" hidden>· 筛选中</small></summary>
      <div class="sw37-shelf-fields">
        <input type="search" id="sw37-shelf-query" maxlength="100" aria-label="查找作品" placeholder="作品名、类型或分组">
        ${showGroups ? '<select class="sw18-group-filter" aria-label="筛选作品分组"></select>' : ''}
        <button type="button" class="button outline" id="sw37-filter-clear" disabled>清除筛选</button>
      </div><p class="small-note" id="sw37-shelf-status" role="status"></p>`;
    const field = controls.querySelector('#sw37-shelf-query');
    const searchButton = document.getElementById('shelfSearchBtn');
    const filter = controls.querySelector('.sw18-group-filter');
    const clear = controls.querySelector('#sw37-filter-clear');
    const status = controls.querySelector('#sw37-shelf-status');
    const indicator = controls.querySelector('#sw37-filter-indicator');
    const empty = document.createElement('p');
    empty.className = 'sw37-shelf-empty';
    empty.textContent = '没有符合条件的作品，可清除筛选后再找。';
    shelf.before(controls);
    shelf.after(empty);
    field.value = shelfQuery;
    if (filter) {
      filter.add(new Option('全部分组',''));
      for (const group of groups) filter.add(new Option('「'+group+'」','group:'+group));
      if (rows.some(({work}) => !groupOf(work))) filter.add(new Option('未分组','ungrouped'));
      if (![...filter.options].some(option => option.value === groupFilter)) groupFilter = '';
      filter.value = groupFilter;
    }
    const update = () => {
      shelfQuery = field.value;
      groupFilter = filter?.value || '';
      const terms = shelfText(shelfQuery.trim()).split(/\s+/u).filter(Boolean);
      const filtering = Boolean(groupFilter || terms.length);
      controls.classList.toggle('is-filtering',filtering);
      let visible = 0;
      for (const row of rows) {
        const group = groupOf(row.work);
        const groupKey = group ? 'group:' + group : 'ungrouped';
        row.wrapper.hidden = Boolean(groupFilter && groupKey !== groupFilter) || !terms.every(term => row.terms.includes(term));
        if (!row.wrapper.hidden) visible++;
      }
      empty.hidden = visible > 0;
      clear.disabled = !(shelfQuery || groupFilter);
      indicator.hidden = !filtering;
      status.textContent = filtering ? `显示 ${visible} / ${rows.length} 部作品` : '';
    };
    if (filter) filter.onchange = update;
    field.oninput = update;
    searchButton.hidden = false;
    searchButton.setAttribute('aria-expanded',String(controls.open));
    searchButton.onclick = () => {
      controls.open = !controls.open;
      if (controls.open) field.focus();
    };
    controls.ontoggle = () => {
      if (!controls.isConnected) return;
      filtersOpen = controls.open;
      searchButton.setAttribute('aria-expanded',String(controls.open));
    };
    clear.onclick = () => {
      field.value = '';
      if (filter) filter.value = '';
      update();
      controls.querySelector('summary').focus({preventScroll:true});
    };
    update();
  }
  const previousWire = wirePage;
  wirePage = function () {
    previousWire();
    const searchButton = document.getElementById('shelfSearchBtn');
    searchButton.hidden = true;
    searchButton.onclick = null;
    if (tab === 'home') enhanceShelf();
    if (tab === 'skills') {
      for (const row of document.querySelectorAll('#screen .library-item')) {
        const key = row.querySelector('[data-action="distill"]')?.dataset.id;
        const item = key && getItem('reference',key);
        if (!item) continue;
        bindGesture(row,'reference',key);
        addMore(row,'reference',key,item.title);
      }
    }
  };
  function shelfMenu(add) {
    const entries = add
      ? [['new-project','新建作品'],['import-manuscript','导入小说']]
      : [['skills','写作技能'],['search','全文搜索'],['settings','设置']];
    modal(add ? '添加作品' : '书架更多', `<div class="sw17-setting-index">${entries.map(([action,label]) =>
      `<button type="button" data-shelf-command="${action}"><span>${label}</span><span aria-hidden="true">›</span></button>`).join('')}</div>`, root => {
      root.querySelectorAll('[data-shelf-command]').forEach(button => {
        button.onclick = () => {
          closeModal();
          act(button.dataset.shelfCommand);
        };
      });
    });
  }
  const previousAct = act;
  act = function (action,key) {
    if (action === 'shelf-add' || action === 'shelf-menu') return shelfMenu(action === 'shelf-add');
    if (action === 'book-delete') return confirmRemoval('book',key);
    return previousAct(action,key);
  };
})();
