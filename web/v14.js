/* Local project references and chapter workflow. */
(() => {
  'use strict';
  const categories = ['设定', '考据', '灵感', '写作要求', '术语'];
  const worldFields = {
    premise:'故事背景与核心矛盾', chronology:'时代与历史',
    geography:'地理、地点与社会', rules:'世界规则与代价',
    factions:'势力与阵营', themes:'主题与叙事基调'
  };
  const labels = {empty:'未写', draft:'草稿', review:'待审', final:'已定稿', changed:'待复审'};
  const bounded = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
  const cut = (text, length) => Array.from(text.slice(0, length * 2)).slice(0, length).join('');
  const field = (label, name, value, max) => `<div class="field"><label for="sw14-${name}">${label}</label>
    <textarea id="sw14-${name}" name="${name}" maxlength="${max}">${esc(value)}</textarea></div>`;
  const planOf = row => ({
    objective:bounded(row?.objective, 500),
    conflict:bounded(row?.conflict, 500),
    beats:bounded(row?.beats, 3000),
    stage:['review','final'].includes(row?.stage) ? row.stage : 'draft',
    finalId:bounded(row?.finalId, 100)
  });
  function status(ch) {
    if (!/\S/u.test(ch.text)) return 'empty';
    const plan = planOf(ch.blueprint);
    if (plan.stage !== 'final') return plan.stage;
    const snapshot = Array.isArray(ch.history) && ch.history.find(item => item?.id === plan.finalId);
    return snapshot && snapshot.text === ch.text && snapshot.title === ch.title ? 'final' : 'changed';
  }
  function cleanCard(raw, chapterIds) {
    const title = bounded(raw?.title, 100), body = bounded(raw?.body, 30000), key = bounded(raw?.id, 100);
    if (!title || !body || !key) return null;
    return {id:key, title, body, category:categories.includes(raw.category) ? raw.category : '设定',
      tags:bounded(raw.tags, 160), source:bounded(raw.source, 300), aliases:bounded(raw.aliases, 200),
      chapterIds:Array.isArray(raw.chapterIds) ? [...new Set(raw.chapterIds.filter(value => chapterIds.has(value)))] : []};
  }
  function cardsOf(p) {
    return Array.isArray(p?.knowledgeCards) ? p.knowledgeCards : [];
  }
  function transact(projectId, change) {
    return StoryWeaveWorkspace.transact(next => {
      const current = next.projects.find(item => item.id === projectId);
      if (!current || next.selected !== projectId) throw Error('作品已切换或删除');
      const updated = change(current);
      next.projects = next.projects.map(item => item === current ? updated : item);
    });
  }
  function wireSave(root, selector, work, done) {
    const button = root.querySelector(selector);
    button.onclick = async () => {
      if (button.disabled) return;
      button.disabled = true;
      try {
        if (await work() === false) return;
        render();
        if (root.isConnected) done();
      } catch (error) {
        toast('操作失败：' + error.message);
      } finally {
        if (root.isConnected) button.disabled = false;
      }
    };
  }
  function findCardMention(card, text) {
    const terms = [card.title,...(card.aliases || '').split(/[,，、;；/|\n]+/u)]
      .map(value => value.trim()).filter(value => Array.from(value).length >= 2);
    let found;
    for (const term of new Set(terms)) {
      const literal = term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const before = /^[a-z0-9_]/i.test(term) ? '(?:^|[^a-z0-9_])' : '';
      const after = /[a-z0-9_]$/i.test(term) ? '(?![a-z0-9_])' : '';
      const match = new RegExp(before + '(' + literal + ')' + after,'iu').exec(text);
      if (!match) continue;
      const start = match.index + match[0].length - match[1].length;
      if (!found || start < found.start || (start === found.start && match[1].length > found.text.length)) {
        found = {start,text:match[1]};
      }
    }
    return found;
  }

  function openKnowledge(chapterKey = '', initialQuery = '', category = '', linkedOnly = false, mentionedOnly = false) {
    const p = project();
    if (!p) return;
    const activeChapter = p.chapters.find(ch => ch.id === chapterKey);
    const editor = chapterKey && tab === 'write' && chapter()?.id === chapterKey && document.getElementById('chapterText');
    const selection = editor ? editor.value.slice(editor.selectionStart,editor.selectionEnd).trim() : '';
    const selectedQuery = selection && selection.length <= 60 && !/[\r\n]/.test(selection) ? selection : '';
    modal(category === '术语' ? '术语表' : chapterKey ? '本章资料' : '作品知识库', `
      ${chapterKey ? '<details class="sw30-quick"><summary>人物、世界与地点</summary><div class="sw15-actions"><button class="button outline" id="sw30-people">人物速查</button><button class="button outline" id="sw30-world">查看世界设定</button><button class="button outline" id="sw31-places">本章地点</button></div></details>' : ''}
      <div class="field"><label for="sw14-search">检索名称、别名、标签和内容</label>
      <input type="search" id="sw14-search" value="${esc(initialQuery)}">
      ${selectedQuery ? '<button type="button" class="text-button" id="sw36-use-selection">查找选中文字</button>' : ''}</div>
      <div class="sw36-reference-filters"><label for="sw14-category">分类 <select id="sw14-category"><option value="">全部分类</option>${categories.map(value => `<option>${value}</option>`).join('')}</select></label>
      <button class="button outline" id="sw14-add-card">${category === '术语' ? '新增术语' : '新建资料'}</button></div>
      ${chapterKey ? `<div class="sw36-reference-filters"><label class="sw30-toggle"><input type="checkbox" id="sw14-linked" ${linkedOnly?'checked':''}> 本章关联</label>
      <label class="sw30-toggle"><input type="checkbox" id="sw36-mentioned" ${mentionedOnly?'checked':''}> 正文提及</label></div>` : ''}
      <p class="small-note" id="sw14-card-count" aria-live="polite"></p><div id="sw14-cards"></div>`, root => {
      const query = root.querySelector('#sw14-search'), filter = root.querySelector('#sw14-category');
      filter.value = category;
      const list = root.querySelector('#sw14-cards'), linked = root.querySelector('#sw14-linked');
      const mentioned = root.querySelector('#sw36-mentioned'), useSelection = root.querySelector('#sw36-use-selection');
      const status = root.querySelector('#sw14-card-count'), close = root.querySelector('#modalClose');
      const indexed = new WeakMap(), mentions = new WeakMap();
      const sourceText = editor ? editor.value : activeChapter?.text || '';
      let saving = false;
      const back = () => {
        if (state.selected === p.id && (!chapterKey || chapter()?.id === chapterKey)) {
          openKnowledge(chapterKey,query.value,filter.value,linked?.checked,mentioned?.checked);
        }
      };
      if(chapterKey){
        root.querySelector('#sw30-people').onclick = () => {if(!saving){closeModal();act('sw7-reference',back);}};
        root.querySelector('#sw30-world').onclick = () => {if(!saving)viewWorld(back);};
        root.querySelector('#sw31-places').onclick = () => {if(!saving)act('v12-chapter-places',back);};
      }
      const paint = () => {
        const words = tokens(query.value), current = project();
        if (current?.id!==p.id) return;
        const matches = cardsOf(current).filter(card => {
          if (filter.value && card.category !== filter.value) return false;
          if (linked?.checked && !card.chapterIds.includes(chapterKey)) return false;
          if (mentioned?.checked) {
            if (!mentions.has(card)) mentions.set(card,findCardMention(card,sourceText));
            if (!mentions.get(card)) return false;
          }
          if (!words.length) return true;
          if (!indexed.has(card)) indexed.set(card,searchText([card.title,card.aliases,card.tags,card.source,card.body].join(' ')));
          return words.every(term => indexed.get(card).includes(term));
        });
        if (chapterKey) matches.sort((a,b)=>Number(b.chapterIds.includes(chapterKey))-Number(a.chapterIds.includes(chapterKey)));
        status.textContent = `找到 ${matches.length} 条资料` + (mentioned?.checked ? ' · 匹配至少两个字符的名称或别名' : '');
        list.innerHTML = matches.map(card => {
          const attached = chapterKey && card.chapterIds.includes(chapterKey);
          const match = mentioned?.checked ? mentions.get(card)?.text : '';
          return `<article class="context-card">
            <strong>${esc(card.title)}</strong><small>${esc([attached?'已关联本章':'',match?`提及「${match}」`:'',card.category,card.aliases,card.tags,card.source].filter(Boolean).join(' · '))}</small>
            <p>${esc(short(card.body, 130))}</p><div class="sw15-actions">
            <button class="button outline" data-sw14-card="${esc(card.id)}">查看</button>
            ${chapterKey?`<button class="button outline" data-sw30-link="${esc(card.id)}" aria-pressed="${Boolean(attached)}">${attached?'取消关联':'关联本章'}</button>`:''}
            </div></article>`;
        }).join('') || '<p>没有匹配的资料。</p>';
      };
      list.onclick = async event => {
        if (saving || state.selected!==p.id) return;
        const button = event.target.closest('[data-sw14-card]');
        if (button) return viewCard(chapterKey,button.dataset.sw14Card,filter.value,back);
        const link = event.target.closest('[data-sw30-link]');
        if (!link) return;
        const key = link.dataset.sw30Link, attach = link.getAttribute('aria-pressed')==='false';
        saving = close.disabled = link.disabled = true;
        try {
          await transact(p.id,current=>{
            const cards = cardsOf(current), card = cards.find(row=>row.id===key);
            if(!card || !current.chapters.some(ch=>ch.id===chapterKey)) throw Error('资料或章节已删除');
            const chapterIds = attach ? [...new Set([...card.chapterIds,chapterKey])] : card.chapterIds.filter(id=>id!==chapterKey);
            return {...current,knowledgeCards:cards.map(row=>row===card?{...row,chapterIds}:row)};
          });
          render();
          if(root.isConnected)paint();
        } catch (error) {
          status.textContent = '关联未保存：'+error.message;
        } finally {
          saving = close.disabled = link.disabled = false;
        }
      };
      root.closest('.modal-backdrop').addEventListener('click',event=>{
        if(saving && event.target.classList.contains('modal-backdrop'))event.stopImmediatePropagation();
      },true);
      query.oninput = filter.onchange = paint;
      if (linked) linked.onchange = paint;
      if (mentioned) mentioned.onchange = paint;
      if (useSelection) useSelection.onclick = () => {if(!saving){query.value = selectedQuery;paint();}};
      root.querySelector('#sw14-add-card').onclick = () => {if(!saving)editCard(chapterKey,'',filter.value,back);};
      paint();
    });
  }
  function viewWorld(back) {
    const profile = cleanWorld(project()?.worldProfile);
    const sections = Object.entries(worldFields).filter(([key])=>profile[key]);
    modal('世界设定', `<div class="sw30-reader">${sections.map(([key,label])=>`<section><h3>${label}</h3><p>${esc(profile[key])}</p></section>`).join('') || '<p>尚未填写世界设定。</p>'}</div>
      <button class="button outline" id="sw30-back">返回资料库</button>`,root=>{root.querySelector('#sw30-back').onclick=back;});
  }
  function viewCard(chapterKey,key,category,back) {
    const p = project(), card = cardsOf(p).find(row=>row.id===key);
    if(!card) return toast('资料已删除');
    const chaptersUsing = p.chapters.filter(ch=>card.chapterIds.includes(ch.id));
    const editor = chapterKey && tab === 'write' && chapter()?.id === chapterKey && document.getElementById('chapterText');
    const mention = editor && findCardMention(card,editor.value);
    modal(card.category==='术语'?'查看术语':'查看资料', `<h3>${esc(card.title)}</h3>
      <p class="small-note">${esc([card.category,card.aliases,card.tags,card.source].filter(Boolean).join(' · '))}</p>
      <div class="sw30-reader"><p>${esc(card.body)}</p></div>
      ${chaptersUsing.length?`<details class="sw30-quick"><summary>关联章节 · ${chaptersUsing.length} 章</summary>
      <div class="sw15-actions">${chaptersUsing.map(ch=>`<button class="button outline" data-sw30-chapter="${esc(ch.id)}">${esc(ch.title||'未命名章节')}</button>`).join('')}</div></details>`:''}
      <div class="sw15-actions"><button class="button outline" id="sw30-back">返回资料库</button>
      ${mention ? '<button class="button outline" id="sw36-locate">定位正文提及</button>' : ''}
      <button class="button primary" id="sw30-edit">编辑</button></div>`,root=>{
      root.querySelector('#sw30-back').onclick=back;
      root.querySelector('#sw30-edit').onclick=()=>editCard(chapterKey,key,category,()=>viewCard(chapterKey,key,category,back),back);
      if (mention) root.querySelector('#sw36-locate').onclick=()=>{
        const live = document.getElementById('chapterText');
        if (!live || p.id !== state.selected || chapter()?.id !== chapterKey) return;
        const hit = findCardMention(card,live.value);
        if (!hit) return toast('正文中已找不到该名称或别名');
        closeModal();
        StoryWeaveDesk.revealSelection(live,hit.start,hit.start+hit.text.length);
      };
      for(const button of root.querySelectorAll('[data-sw30-chapter]'))button.onclick=()=>jumpTo(p.id,button.dataset.sw30Chapter);
    });
  }
  function editCard(chapterKey, key, category, back, afterDelete=back) {
    const p = project(), old = cardsOf(p).find(card => card.id === key);
    if (!p || (key && !old)) return;
    const linked = new Set(old?.chapterIds || (chapterKey ? [chapterKey] : []));
    const isTerm = (old?.category || category) === '术语';
    modal(isTerm ? (old ? '编辑术语' : '新增术语') : (old ? '编辑资料' : '新建资料'), `<div class="field"><label for="sw14-title">名称</label>
      <input id="sw14-title" name="title" maxlength="100" value="${esc(old?.title || '')}"></div>
      <div class="field"><label for="sw14-kind">分类</label><select id="sw14-kind" name="category">
      ${categories.map(value => `<option ${(old?.category || category) === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div>
      <div class="field"><label for="sw14-aliases">别名、简称或旧译名</label><input id="sw14-aliases" name="aliases" maxlength="200" placeholder="多个别名用顿号或逗号分隔" value="${esc(old?.aliases || '')}"></div>
      <div class="field"><label for="sw14-tags">标签</label><input id="sw14-tags" name="tags" maxlength="160" value="${esc(old?.tags || '')}"></div>
      <div class="field"><label for="sw14-source">来源或出处</label><input id="sw14-source" name="source" maxlength="300" value="${esc(old?.source || '')}"></div>
      <div class="field"><label for="sw14-file">从 TXT / Markdown 填入内容</label><input id="sw14-file" type="file" accept=".txt,.md,.markdown"></div>
      ${field(isTerm ? '定义与用法' : '正文', 'body', old?.body || '', 30000)}
      <details><summary>关联章节（可多选）</summary><div class="sw14-links">
      ${p.chapters.map(ch => `<label><input type="checkbox" value="${esc(ch.id)}" ${linked.has(ch.id) ? 'checked' : ''}> ${esc(ch.title)}</label>`).join('')}
      </div></details>
      <div class="sw10-quick"><button id="sw14-save-card">保存资料</button><button id="sw14-back">返回</button>
      ${old ? '<button id="sw14-delete-card">删除资料</button>' : ''}</div>`, root => {
      const fileInput = root.querySelector('#sw14-file');
      let importSequence = 0;
      fileInput.onchange = async () => {
        const file = fileInput.files[0], sequence = ++importSequence;
        if (!file) return;
        const body = root.querySelector('#sw14-body');
        const original = body.value;
        try {
          if (file.size > 130000 || !/\.(txt|md|markdown)$/i.test(file.name)) throw Error('请选择不超过 130KB 的 TXT 或 Markdown');
          if (original.trim() && !confirm('用文件内容替换此编辑框中的文字？')) return;
          const contents = StoryWeaveManuscript.decodeManuscript(await file.arrayBuffer());
          if (contents.length > 30000 || !contents.trim()) throw Error('资料须有内容，且不能超过 30,000 字符');
          if (!root.isConnected || sequence !== importSequence || body.value !== original) return;
          body.value = contents;
          const title = root.querySelector('#sw14-title'), source = root.querySelector('#sw14-source');
          if (!title.value.trim()) title.value = file.name.replace(/\.[^.]+$/, '').slice(0, 100);
          if (!source.value.trim()) source.value = file.name.slice(0, 300);
        } catch (error) {
          if (root.isConnected) toast('导入失败：' + error.message);
        } finally {
          if (sequence === importSequence) fileInput.value = '';
        }
      };
      root.querySelector('#sw14-back').onclick = back;
      wireSave(root, '#sw14-save-card', () => {
        const values = Object.fromEntries(['title','body','tags','source','category','aliases'].map(name => [name,formVal(root,name)]));
        const chapterIds = [...root.querySelectorAll('.sw14-links input:checked')].map(input => input.value);
        return transact(p.id, current => {
          const rows = cardsOf(current);
          if (old && rows.find(card => card.id === key)!==old) throw Error('资料已变化，请重新打开编辑');
          if (!old && rows.length >= 200) throw Error('每部作品最多保存 200 条资料');
          const item = cleanCard({...values, id:old?.id || id(), chapterIds}, new Set(current.chapters.map(ch => ch.id)));
          if (!item) throw Error('请填写标题和正文');
          const updated = old ? rows.map(card => card.id === key ? item : card) : [item, ...rows];
          if (updated.reduce((total, card) => total + card.body.length, 0) > 1000000) throw Error('本作品资料总量超过 100 万字符');
          return {...current, knowledgeCards:updated};
        });
      }, () => {back();toast('资料已保存');});
      if (old) wireSave(root, '#sw14-delete-card', async () => {
        if (!confirm('删除这条资料？')) return false;
        await transact(p.id, current => {
          const cards = cardsOf(current);
          if(cards.find(card=>card.id===key)!==old) throw Error('资料已变化，请重新打开编辑');
          return {...current,knowledgeCards:cards.filter(card=>card.id!==key)};
        });
      }, afterDelete);
    });
  }
  function editBlueprint(key) {
    const p = project(), ch = key ? p?.chapters.find(row => row.id === key) : chapter();
    if (!p || !ch) return;
    const originalText = ch.text, originalTitle = ch.title;
    const plan = planOf(ch.blueprint), stage = status(ch);
    modal('章节蓝图与定稿', `<p>${esc(ch.title)} · ${labels[stage]}</p>
      ${field('本章目标', 'objective', plan.objective, 500)}
      ${field('冲突与转折', 'conflict', plan.conflict, 500)}
      ${field('情节节点', 'beats', plan.beats, 3000)}
      <div class="field"><label for="sw14-stage">稿件状态</label><select name="stage" id="sw14-stage">
      <option value="draft">草稿</option><option value="review" ${['review','changed'].includes(stage) ? 'selected' : ''}>待审</option>
      <option value="final" ${stage === 'final' ? 'selected' : ''}>定稿当前版本</option></select></div>
      <p class="small-note">定稿会保存一份章节快照。定稿后修改标题或正文，进度会显示为待复审。</p>
      <button id="sw14-save-plan" class="button primary">保存蓝图与状态</button>`, root => {
      wireSave(root, '#sw14-save-plan', () => {
        const values = Object.fromEntries(['objective','conflict','beats','stage'].map(name => [name,formVal(root,name)]));
        return transact(p.id, current => {
          const row = current.chapters.find(item => item.id === ch.id);
          if (!row) throw Error('章节已删除');
          const blueprint = planOf(values);
          let history = Array.isArray(row.history) ? row.history : [];
          if (blueprint.stage === 'final') {
            if (!row.text.trim()) throw Error('空白章节不能定稿');
            if (row.text !== originalText || row.title !== originalTitle) throw Error('正文已变化，请重新打开蓝图核对');
            if (status(row) === 'final') blueprint.finalId = planOf(row.blueprint).finalId;
            else {
              blueprint.finalId = id();
              history = [{id:blueprint.finalId, at:time(), title:row.title, text:row.text}, ...history].slice(0,30);
            }
          }
          const updated = {...row, blueprint, history};
          return {...current, chapters:current.chapters.map(item => item === row ? updated : item)};
        });
      }, () => {closeModal(); toast('章节蓝图与状态已保存');});
    });
  }
  function cleanWorld(data) {
    return Object.fromEntries(Object.keys(worldFields).map(key => [key,bounded(data?.[key],1800)]));
  }
  function editWorld() {
    const work = project();
    if (!work) return;
    const profile = cleanWorld(work.worldProfile);
    modal('编辑世界设定', `<p class="small-note">整理这部作品的故事背景与约束。写作时可在 AI 协作中选带世界设定节选。</p>
      ${Object.entries(worldFields).map(([key,label]) => field(label,key,profile[key],1800)).join('')}
      <button class="button primary" id="sw15-save-world">保存世界设定</button>`, root => {
      wireSave(root, '#sw15-save-world', () => {
        const worldProfile = Object.fromEntries(Object.keys(worldFields).map(key => [key,formVal(root,key)]));
        return transact(work.id, current => ({...current, worldProfile:cleanWorld(worldProfile)}));
      }, () => {closeModal();toast('世界设定已保存');});
    });
  }
  function volumesOf(work) {
    if (!Array.isArray(work.volumes)) return [];
    const volumes = [], ids = new Set();
    for (const raw of work.volumes.slice(0,60)) {
      const key = bounded(raw?.id,100), title = bounded(raw?.title,100);
      if (!key || !title || ids.has(key)) continue;
      ids.add(key);
      volumes.push({id:key,title});
    }
    return volumes;
  }
  function arrangeChapters(chapters, volumes) {
    const rank = new Map(volumes.map((volume,index) => [volume.id,index]));
    return [...chapters].sort((a,b) => (rank.get(a.volumeId) ?? volumes.length) - (rank.get(b.volumeId) ?? volumes.length));
  }
  function editVolume(key = '') {
    const work = project();
    const original = volumesOf(work), volume = original.find(row => row.id === key);
    if (key && !volume) return;
    const following = volume ? original[original.indexOf(volume)+1]?.id || '' : '';
    modal(volume ? '编辑分卷' : '新建分卷', `<div class="field"><label for="sw15-volume-name">卷名</label>
      <input id="sw15-volume-name" name="volumeTitle" maxlength="100" value="${esc(volume?.title || '')}"></div>
      ${volume && original.length>1?`<div class="field"><label for="sw29-volume-before">分卷顺序</label>
      <select id="sw29-volume-before" name="beforeVolume"><option value="">放到分卷末尾</option>
      ${original.filter(row=>row!==volume).map(row=>`<option value="${esc(row.id)}" ${row.id===following?'selected':''}>放在「${esc(row.title)}」前</option>`).join('')}
      </select></div>`:''}
      <div class="sw15-actions"><button class="button primary" id="sw15-save-volume">保存分卷</button>
      ${volume ? '<button class="button outline" id="sw15-remove-volume">删除分卷</button>' : ''}
      <button class="button outline" id="sw15-volume-back">返回章节概览</button></div>`, root => {
      root.querySelector('#sw15-volume-back').onclick = () => openBoard();
      wireSave(root, '#sw15-save-volume', () => {
        const title = bounded(formVal(root,'volumeTitle'),100);
        const before = formVal(root,'beforeVolume');
        if (!title) throw Error('请输入卷名');
        return transact(work.id, current => {
          const volumes = volumesOf(current);
          if (volume && !volumes.some(row => row.id === key)) throw Error('分卷已删除');
          if (!volume && volumes.length >= 60) throw Error('每部作品最多 60 卷');
          if (volumes.some(row => row.id !== key && row.title === title)) throw Error('卷名已存在');
          const updated = volume ? volumes.map(row => row.id === key ? {...row,title} : row) : [...volumes,{id:id(),title}];
          if (!volume || before===following) return {...current,volumes:updated};
          const ordered = updated.filter(row=>row.id!==key);
          const index = before ? ordered.findIndex(row=>row.id===before) : ordered.length;
          if (index<0) throw Error('目标分卷已删除，请重新选择位置');
          ordered.splice(index,0,updated.find(row=>row.id===key));
          return {...current,volumes:ordered,chapters:arrangeChapters(current.chapters,ordered)};
        });
      }, () => openBoard());
      if (volume) wireSave(root, '#sw15-remove-volume', async () => {
        if (!confirm('删除这卷并把其中的章节移到「未分卷」？')) return false;
        await transact(work.id, current => {
          const volumes = volumesOf(current).filter(row => row.id !== key);
          const moved = current.chapters.map(ch => ch.volumeId === key ? {...ch,volumeId:''} : ch);
          return {...current,volumes,chapters:arrangeChapters(moved,volumes)};
        });
      }, () => openBoard());
    });
  }
  function moveToVolume(chapterKeys) {
    const work = project(), keys = new Set(chapterKeys), volumes = volumesOf(work);
    const rows = directoryEntries(work);
    const selected = rows.filter(row => keys.has(row.ch.id));
    if (!selected.length || selected.length !== keys.size) return toast('所选章节已变化');
    const sameVolume = selected.every(row => row.volumeId === selected[0].volumeId);
    const oldVolume = sameVolume ? selected[0].volumeId : '';
    const following = sameVolume && rows.slice(selected[selected.length-1].index).find(row => row.volumeId === oldVolume);
    modal(selected.length === 1 ? '调整章节顺序' : '批量移动章节', `
      <p>${selected.length === 1 ? esc(selected[0].ch.title) : `已选 ${selected.length} 章，移动时保留目录中的相对顺序。`}</p>
      <div class="field"><label for="sw15-target-volume">目标分卷</label>
      <select id="sw15-target-volume" name="targetVolume"><option value="">未分卷</option>
      ${volumes.map(row => `<option value="${esc(row.id)}" ${row.id === oldVolume ? 'selected' : ''}>${esc(row.title)}</option>`).join('')}
      </select></div><div class="field"><label for="sw19-before-chapter">插入位置</label>
      <select id="sw19-before-chapter" name="beforeChapter"></select></div>
      <p class="small-note">调整会改变阅读、导出和按章推演的顺序。章节已有的资料链接仍指向原章。</p>
      <div class="sw15-actions"><button class="button primary" id="sw15-move-chapter">移动章节</button>
      <button class="button outline" id="sw15-move-back">返回目录</button></div>`, root => {
      root.querySelector('#sw15-move-back').onclick = () => openBoard();
      const target = root.querySelector('#sw15-target-volume'), position = root.querySelector('#sw19-before-chapter');
      function fillPositions() {
        const peers = rows.filter(row => !keys.has(row.ch.id) && row.volumeId === target.value);
        position.innerHTML = '<option value="">放到末尾</option>' +
          peers.map(row => `<option value="${esc(row.ch.id)}">放在第 ${row.index} 章「${esc(row.ch.title || '未命名章节')}」前</option>`).join('');
        if (target.value === oldVolume && following) position.value = following.ch.id;
      }
      target.onchange = fillPositions;
      fillPositions();
      wireSave(root, '#sw15-move-chapter', () => {
        const volumeId = formVal(root,'targetVolume'), before = formVal(root,'beforeChapter');
        return transact(work.id, current => {
          const volumes = volumesOf(current), volumeIds = new Set(volumes.map(row => row.id));
          const ordered = arrangeChapters(current.chapters,volumes);
          const latest = ordered.filter(row => keys.has(row.id));
          if (latest.length !== keys.size) throw Error('所选章节已删除，请返回目录重新选择');
          if (volumeId && !volumeIds.has(volumeId)) throw Error('分卷已删除');
          const moved = ordered.filter(row => !keys.has(row.id));
          const index = before ? moved.findIndex(row => row.id === before &&
            (volumeIds.has(row.volumeId) ? row.volumeId : '') === volumeId) : moved.length;
          if (index < 0) throw Error('目标章节已移动或删除，请重新选择插入位置');
          const inserted = [...moved.slice(0,index),...latest.map(row => ({...row,volumeId})),...moved.slice(index)];
          return {...current,chapters:arrangeChapters(inserted,volumes)};
        });
      }, () => {
        openBoard();
        if (selected.length > 1) toast(`已移动 ${selected.length} 章`);
      });
    });
  }
  function openBoard() {
    closeModal();
    if (tab !== 'contents') go('contents');
  }
  const directoryFilters = new Map(), foldedVolumes = new Map();
  const DIRECTORY_CHUNK = 120;
  let creatingInVolume = false;

  async function addChapterToVolume(key = '') {
    const work = project();
    const origin = tab;
    if (!work || creatingInVolume) return false;
    const chapterKey = id();
    creatingInVolume = true;
    try {
      await transact(work.id,current => {
        const volumes = volumesOf(current);
        if (key && !volumes.some(row => row.id === key)) throw Error('分卷已删除');
        const title = key ? '未命名章节' : `第${current.chapters.length + 1}章 · 未命名`;
        const draft = {id:chapterKey,title,text:'',volumeId:key,updated:time(),history:[]};
        const chapters = [...current.chapters,draft];
        return {...current,chapters:key ? arrangeChapters(chapters,volumes) : chapters};
      });
      foldedVolumes.get(work.id)?.delete(key);
      if (state.selected !== work.id || tab !== origin || document.querySelector('#modalRoot .modal')) return false;
      jumpTo(work.id,chapterKey);
      return true;
    } catch (error) {
      toast('新建章节失败：' + error.message);
      return false;
    } finally {creatingInVolume = false;}
  }

  function openChapterMenu(workId,key) {
    const row = chapters().find(ch => ch.id === key);
    if (!row || state.selected !== workId) return;
    modal('章节操作',`<p class="sw18-menu-title">${esc(row.title || '未命名章节')}</p>
      <div class="sw18-menu-grid">
        <button type="button" id="sw35-plan"><span aria-hidden="true">${ico('file')}</span>蓝图与状态</button>
        <button type="button" data-sw15-move="${esc(key)}"><span aria-hidden="true">${ico('arrow')}</span>移动或排序</button>
        <button type="button" data-sw17-remove="${esc(key)}"><span aria-hidden="true">${ico('trash')}</span>移入回收站</button>
      </div>`,root => {
      root.classList.add('sw18-menu','sw35-chapter-menu');
      const bind = (selector,action) => {
        root.querySelector(selector).onclick = () => {
          if (state.selected !== workId || !chapters().some(ch => ch.id === key)) {
            closeModal();toast('章节已移动或删除');return;
          }
          action(key);
        };
      };
      bind('#sw35-plan',editBlueprint);
      bind('[data-sw15-move]',chapterKey => moveToVolume([chapterKey]));
      bind('[data-sw17-remove]',chapterKey => act('v17-remove-chapter',chapterKey));
    });
  }
  const searchText = text => text.normalize('NFKC').toLocaleLowerCase();
  const tokens = text => searchText(text.trim()).split(/\s+/).filter(Boolean);
  function directoryEntries(work) {
    const volumes = new Map(volumesOf(work).map(row => [row.id,row.title]));
    return work.chapters.map((ch,index) => {
      const volumeId = volumes.has(ch.volumeId) ? ch.volumeId : '';
      const volume = volumes.get(volumeId) || '未分卷';
      const plan = planOf(ch.blueprint);
      const text = [ch.title,volume,`第${index+1}章`,plan.objective,plan.conflict,plan.beats].join(' ');
      return {ch,index:index+1,volumeId,volume,stage:status(ch),searchText:searchText(text)};
    });
  }
  function matches(entry,terms,includeBody) {
    return terms.every(term => entry.searchText.includes(term) ||
      (includeBody && (entry.bodySearchText ??= searchText(entry.ch.text || '')).includes(term)));
  }
  function jumpTo(workId,key) {
    if (state.selected !== workId || !chapters().some(ch => ch.id === key)) return;
    chapterId = key;
    closeModal();
    go('write');
  }
  function openChapterJump() {
    const work = project();
    if (!work || !work.chapters.length) return;
    const entries = directoryEntries(work);
    const current = chapter()?.id;
    const currentIndex = entries.findIndex(row => row.ch.id === current);
    modal('跳转章节', `<div class="field"><label for="sw19-jump-query">按章名、卷名或蓝图查找</label>
      <input id="sw19-jump-query" type="search" maxlength="100" autocomplete="off"></div>
      <label class="sw24-body-search"><input type="checkbox" id="sw24-jump-body"> 同时查找正文</label>
      <p id="sw19-jump-status" class="small-note" role="status"></p><div id="sw19-jump-list"></div>`, root => {
      root.classList.add('sw16-paper-modal','sw19-jump');
      const field = root.querySelector('#sw19-jump-query'), list = root.querySelector('#sw19-jump-list');
      const bodySearch = root.querySelector('#sw24-jump-body');
      const hint = root.querySelector('#sw19-jump-status');
      function paint() {
        const terms = tokens(field.value);
        const found = terms.length ? entries.filter(row => matches(row,terms,bodySearch.checked)) : entries.slice(Math.max(0,currentIndex-12),currentIndex+13);
        hint.textContent = terms.length ? `匹配 ${found.length} 章${found.length > 80 ? ' · 显示前 80 章' : ''}` : '当前章节附近 · 搜索可覆盖全书';
        list.innerHTML = found.slice(0,80).map(({ch,index,volume,stage}) => `<button type="button" data-sw19-jump="${esc(ch.id)}"
          class="sw19-jump-row" ${ch.id === current ? 'aria-current="true"' : ''}>
          <strong>${index}. ${esc(ch.title || '未命名章节')}</strong><small>${esc(volume)} · ${ch.id === current ? '当前章' : labels[stage]}</small></button>`).join('') ||
          '<p class="small-note">没有匹配章节。</p>';
      }
      field.oninput = paint;
      bodySearch.onchange = paint;
      field.onkeydown = event => {
        if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229 && tokens(field.value).length &&
            list.childElementCount === 1) list.querySelector('[data-sw19-jump]')?.click();
      };
      list.onclick = event => {
        const button = event.target.closest('[data-sw19-jump]');
        if (button) jumpTo(work.id,button.dataset.sw19Jump);
      };
      paint();
    });
  }
  function contentsPage() {
    const p = project();
    if (!p) return noProject();
    const done = p.chapters.filter(ch => status(ch) === 'final').length;
    const volumes = volumesOf(p), saved = directoryFilters.get(p.id);
    const resumed = window.StoryWeaveDesk?.resumeChapter(p);
    const last = p.chapters.find(ch => ch.id === resumed);
    return `<section class="sw16-directory" aria-label="作品目录">
      <div class="sw16-directory-heading"><div><h1>目录</h1>
      <p>${volumes.length} 卷 · ${p.chapters.length} 章 · ${wordsIn(p).toLocaleString('zh-CN')} 字</p></div>
      <button type="button" class="button outline" id="sw15-add" aria-haspopup="dialog">＋ 添加</button></div>
      ${last ? `<button class="sw16-continue" id="sw16-continue" data-id="${esc(last.id)}"><span>继续写</span><strong>${esc(last.title || '未命名章节')}</strong><span aria-hidden="true">›</span></button>` : ''}
      <details class="sw19-directory-search" ${saved ? 'open' : ''}><summary>查找章节<span id="sw24-filter-indicator" hidden> · 筛选中</span></summary>
      <label class="small-note" for="sw19-directory-query">章名、卷名或蓝图</label>
      <div class="sw19-search-row"><input id="sw19-directory-query" type="search" maxlength="100" value="${esc(saved?.query || '')}">
      <button class="button outline" id="sw19-clear-query">重置</button></div>
      <div class="sw24-directory-filters">
        <label for="sw14-filter">稿件状态<select id="sw14-filter"><option value="">所有状态</option>
        ${Object.entries(labels).map(([key,label]) => `<option value="${key}">${label}</option>`).join('')}</select></label>
        ${volumes.length ? `<label for="sw24-directory-volume">分卷<select id="sw24-directory-volume"><option value="">所有分卷</option>
        ${volumes.map(row => `<option value="volume:${esc(row.id)}">${esc(row.title)}</option>`).join('')}
        <option value="volume:">未分卷</option></select></label>` : ''}
      </div>
      <label class="sw24-body-search"><input type="checkbox" id="sw24-directory-body"> 同时查找正文</label>
      <p id="sw19-directory-matches" class="small-note" role="status"></p></details>
      <details class="sw16-directory-tools"><summary>目录管理</summary>
      <div class="sw15-actions">
      ${p.chapters.length>1?'<button class="button outline" id="sw29-start">批量移动</button>':''}
      <button class="button outline" data-action="sw25-export">导出书稿</button>
      <button class="button outline" data-action="sw27-bookmarks">写作书签</button>
      <button class="button outline" data-action="world-about">作品设定</button>
      <button class="button outline" data-action="goal">每日目标</button>
      <button class="button outline" data-action="v17-trash">章节回收站 · ${p.chapterTrash?.length || 0}</button></div>
      <label class="sw16-preview-toggle"><input type="checkbox" id="sw16-show-previews"> 显示章节摘要</label>
      <p class="small-note">已定稿 ${done} / ${p.chapters.length} 章 · 今日 ${progress(p).today} / ${progress(p).goal} 字</p>
      </details>
      <div id="sw29-selection" hidden>
        <p id="sw29-count" class="small-note" role="status"></p>
        <div class="sw15-actions"><button class="button outline" id="sw29-select-visible">全选当前结果</button>
        <button class="button outline" id="sw29-clear">清空选择</button>
        <button class="button primary" id="sw29-move">移动所选</button>
        <button class="button outline" id="sw29-cancel">退出多选</button></div>
      </div><div id="sw14-chapters"></div></section>`;
  }
  function openManuscriptExport(workId) {
    const work = workId ? state.projects.find(row => row.id === workId) : project();
    if (!work) return;
    const volumes = volumesOf(work);
    modal('导出书稿', `<p class="sw18-menu-title">${esc(work.title || '未命名作品')}</p>
      <div class="sw25-export-fields">
        ${volumes.length ? `<div class="field"><label for="sw25-export-scope">范围</label>
        <select id="sw25-export-scope"><option value="">全书</option>
        ${volumes.map(row => `<option value="volume:${esc(row.id)}">${esc(row.title)}</option>`).join('')}
        <option value="volume:">未分卷</option></select></div>` : ''}
        <div class="field"><label for="sw25-export-format">格式</label>
        <select id="sw25-export-format"><option value="txt">纯文本（TXT）</option><option value="md">Markdown（MD）</option></select></div>
      </div>
      <label class="sw24-body-search"><input id="sw25-export-final" type="checkbox"> 仅导出已定稿章节</label>
      <p class="small-note" id="sw25-export-status" role="status"></p>
      <ol class="sw25-export-preview" id="sw25-export-preview" aria-label="导出章节预览"></ol>
      <button class="button primary block" id="sw25-export-save">保存书稿</button>`, root => {
      const scope = root.querySelector('#sw25-export-scope'), format = root.querySelector('#sw25-export-format');
      const onlyFinal = root.querySelector('#sw25-export-final'), hint = root.querySelector('#sw25-export-status');
      const preview = root.querySelector('#sw25-export-preview'), save = root.querySelector('#sw25-export-save');
      let shown;

      function selection() {
        const live = state.projects.find(row => row.id === work.id);
        if (!live) return null;
        const names = new Map(volumesOf(live).map(row => [row.id,row.title]));
        const volumeKey = scope?.value || '';
        const volumeId = volumeKey.slice('volume:'.length);
        if (volumeId && !names.has(volumeId)) return null;
        const rows = [];
        for (const [index,ch] of live.chapters.entries()) {
          const group = names.has(ch.volumeId) ? ch.volumeId : '';
          if (volumeKey && group !== volumeId) continue;
          if (onlyFinal.checked && status(ch) !== 'final') continue;
          rows.push({id:ch.id,number:index+1,title:ch.title,text:ch.text,group,volume:names.get(group) || '未分卷'});
        }
        const title = live.title || '未命名作品';
        const scopeName = volumeKey ? names.get(volumeId) || '未分卷' : '全文';
        return {live,rows,title,scopeName};
      }
      function paint() {
        shown = selection();
        const rows = shown?.rows || [];
        preview.hidden = !rows.length;
        preview.innerHTML = rows.slice(0,60).map(row =>
          `<li><strong>第${row.number}章 ${esc(row.title || '未命名章节')}</strong><small>${esc(row.volume)}</small></li>`).join('');
        save.disabled = !rows.length;
        hint.textContent = !shown ? '作品或分卷已变化，请重新选择范围。' : !rows.length ? '此范围没有符合条件的章节。'
          : `将按目录顺序导出 ${rows.length} 章${rows.length>60?' · 预览前 60 章':''}。`;
      }
      if (scope) scope.onchange = paint;
      onlyFinal.onchange = paint;
      save.onclick = () => {
        const current = selection();
        if (!shown || !current || shown.title !== current.title || shown.scopeName !== current.scopeName ||
          shown.rows.length !== current.rows.length || shown.rows.some((row,index) => {
            const latest = current.rows[index];
            return row.id !== latest.id || row.number !== latest.number || row.title !== latest.title ||
              row.text !== latest.text || row.group !== latest.group || row.volume !== latest.volume;
          })) {
          paint();
          hint.textContent += ' 目录已更新，请核对后再保存。';
          return;
        }
        if (!current.rows.length) return;
        const markdown = format.value === 'md', extension = markdown ? 'md' : 'txt';
        const basename = `${safeFilename(current.title).slice(0,48)}-${safeFilename(current.scopeName).slice(0,24)}${onlyFinal.checked?'-定稿':''}`;
        const chapterIds = new Set(current.rows.map(row => row.id));
        const text = bookText(current.live,{chapterIds,format:extension});
        closeModal();
        try {
          downloadFile(`${basename}.${extension}`,text,markdown?'text/markdown;charset=utf-8':'text/plain;charset=utf-8');
          toast('已请求保存书稿');
        } catch {
          toast('无法打开保存，请重新导出');
        }
      };
      paint();
    });
  }
  function wireContents() {
    const root = document.querySelector('.sw16-directory'), p = project();
    if (!root || !p) return;
    const volumes = volumesOf(p), entries = directoryEntries(p), counts = new Map();
    const groups = [...volumes,{id:'',title:'未分卷'}];
    const folded = foldedVolumes.get(p.id) || new Set();
    const list = root.querySelector('#sw14-chapters'), filter = root.querySelector('#sw14-filter');
    const previews = root.querySelector('#sw16-show-previews');
    const query = root.querySelector('#sw19-directory-query');
    const bodySearch = root.querySelector('#sw24-directory-body'), volumeFilter = root.querySelector('#sw24-directory-volume');
    const clear = root.querySelector('#sw19-clear-query');
    const saved = directoryFilters.get(p.id);
    const resumed = root.querySelector('#sw16-continue')?.dataset.id;
    const selected = new Set();
    const selectionPanel = root.querySelector('#sw29-selection'), start = root.querySelector('#sw29-start');
    const selectVisible = root.querySelector('#sw29-select-visible'), move = root.querySelector('#sw29-move');
    const clearSelection = root.querySelector('#sw29-clear');
    let selecting = false, visibleIds = new Set(), foldedIds = new Set();
    let renderLimit = DIRECTORY_CHUNK, filterTimer = null;
    const onMore = () => {
      if(!root.isConnected)return;
      renderLimit+=DIRECTORY_CHUNK;
      paint();
    };
    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(items => {
      if(items.some(item => item.isIntersecting)){
        observer.disconnect();
        onMore();
      }
    },{rootMargin:'160px 0px'}) : null;
    function updateSelection(){
      const visibleCount=[...selected].filter(id=>visibleIds.has(id)).length;
      const foldedCount=[...selected].filter(id=>foldedIds.has(id)).length;
      const filteredCount=selected.size-visibleCount-foldedCount;
      root.querySelector('#sw29-count').textContent = `已选 ${selected.size} 章` +
        (filteredCount ? ` · 筛选外 ${filteredCount} 章` : '') + (foldedCount ? ` · 折叠卷内 ${foldedCount} 章` : '');
      move.disabled = clearSelection.disabled = selected.size===0;
      selectVisible.disabled = visibleCount===visibleIds.size;
    }
    filter.value = saved?.status || '';
    bodySearch.checked = Boolean(saved?.body);
    if (volumeFilter) {
      const volume = saved?.volume || '';
      volumeFilter.value = Array.from(volumeFilter.options).some(option => option.value === volume) ? volume : '';
    }
    const paint = () => {
      const terms = tokens(query.value);
      const volume = volumeFilter?.value || '';
      const filtering = Boolean(terms.length || filter.value || volume);
      clear.disabled = !(query.value || filter.value || volume || bodySearch.checked);
      if (filtering || bodySearch.checked) directoryFilters.set(p.id,{query:query.value,status:filter.value,volume,body:bodySearch.checked});
      else directoryFilters.delete(p.id);
      root.querySelector('#sw24-filter-indicator').hidden = !filtering;
      const rowsByVolume = new Map(groups.map(group => [group.id,[]]));
      let found = 0;
      for (const entry of entries) {
        if ((filter.value && entry.stage !== filter.value) || (volume && volume !== 'volume:'+entry.volumeId) ||
            !matches(entry,terms,bodySearch.checked)) continue;
        rowsByVolume.get(entry.volumeId).push(entry);
        found++;
      }
      root.querySelector('#sw19-directory-matches').textContent = filtering ? `匹配 ${found} / ${entries.length} 章` : '';
      // Keep the selection scope equal to all filtered chapters, including
      // chapters that are not yet mounted in the DOM.
      visibleIds=new Set();
      foldedIds=new Set();
      let rendered=0, pending=0;
      observer?.disconnect();
      list.innerHTML = groups.map((group,index) => {
        const rows = rowsByVolume.get(group.id);
        if (filtering && !rows.length && !(volume === 'volume:'+group.id && !terms.length && !filter.value)) return '';
        if (!group.id && volumes.length && !rows.length && volume !== 'volume:') return '';
        const showHeading = Boolean(volumes.length), expandable = showHeading && rows.length && !filtering;
        const open = !expandable || !folded.has(group.id);
        const groupRows = open ? rows.slice(0,Math.max(0,renderLimit-rendered)) : [];
        if(open){
          for(const entry of rows)visibleIds.add(entry.ch.id);
          pending+=rows.length-groupRows.length;
        }else{
          for(const entry of rows)foldedIds.add(entry.ch.id);
        }
        if(rows.length && !groupRows.length && open) return '';
        rendered+=groupRows.length;
        const title = `${esc(group.title)} <small>${rows.length} 章</small>`;
        const rowsId = 'sw35-rows-' + index;
        return `<section class="sw15-volume">${showHeading ? `<div class="sw15-volume-title"><h3>
        ${expandable ? `<button type="button" class="sw35-fold" data-sw35-fold="${esc(group.id)}" aria-controls="${rowsId}" aria-expanded="${open}"><span aria-hidden="true">›</span>${title}</button>` : title}</h3>
        ${group.id ? `<button type="button" class="button outline sw35-add-volume-chapter" data-sw35-add="${esc(group.id)}" aria-label="在${esc(group.title)}新建章节">＋</button>
        <button class="button outline" data-sw15-volume="${esc(group.id)}">编辑卷</button>` : ''}</div>` : ''}
        <div id="${rowsId}" data-sw35-rows ${open ? '' : 'hidden'}>
        ${groupRows.map(({ch,index,stage}) => {
          if (!counts.has(ch.id)) counts.set(ch.id,chapterWordCount(ch));
          return `<div class="sw16-chapter-row">
          ${selecting?`<label class="sw29-check"><input type="checkbox" data-sw29-chapter="${esc(ch.id)}" aria-label="选择第 ${index} 章 ${esc(ch.title || '')}" ${selected.has(ch.id)?'checked':''}></label>`:''}
          <button class="sw16-chapter-link" data-sw14-chapter="${esc(ch.id)}" ${ch.id === resumed ? 'aria-current="true"' : ''}><span class="sw16-chapter-index">${index}</span>
          <strong>${esc(ch.title || '未命名章节')}</strong><small>${ch.id === resumed ? '上次写作 · ' : ''}${labels[stage]} · ${counts.get(ch.id)} 字</small>
          ${previews.checked ? `<span class="sw16-chapter-preview">${esc(short(planOf(ch.blueprint).objective || ch.text.trim() || '尚未填写本章目标',100))}</span>` : ''}</button>
          ${selecting ? '' : `<button type="button" class="sw35-chapter-menu-button" data-sw35-menu="${esc(ch.id)}"
          aria-label="${esc(ch.title || '未命名章节')}的操作" aria-haspopup="dialog">⋯</button>`}</div>`;
        }).join('') ||
        (rows.length ? '' : '<p class="small-note">还没有章节。</p>')}</div></section>`;
      }).join('') || (found ? '' : '<p>没有符合条件的章节。</p>');
      if(pending){
        list.insertAdjacentHTML('beforeend',`<button type="button" class="button outline sw38-more" data-sw38-more aria-label="加载更多章节">继续显示章节 · 还剩 ${pending} 章</button>`);
        const sentinel=list.querySelector('[data-sw38-more]');
        if(observer && sentinel)observer.observe(sentinel);
      }
      if(selecting)updateSelection();
    };
    list.onclick = async event => {
      if (state.selected !== p.id) return;
      const fold = event.target.closest('[data-sw35-fold]');
      if (fold) {
        const group = fold.dataset.sw35Fold, panel = root.querySelector('#' + fold.getAttribute('aria-controls'));
        if (panel.hidden) folded.delete(group);
        else folded.add(group);
        foldedVolumes.set(p.id,folded);
        paint();
        return;
      }
      const add = event.target.closest('[data-sw35-add]');
      if (add && !add.disabled) {
        add.disabled = true;
        try {await act('new-chapter',add.dataset.sw35Add);}
        finally {add.disabled = false;}
        return;
      }
      const more=event.target.closest('[data-sw38-more]');
      if(more){observer?.disconnect();onMore();return;}
      const menu = event.target.closest('[data-sw35-menu]');
      if (menu) return openChapterMenu(p.id,menu.dataset.sw35Menu);
      const volumeButton = event.target.closest('[data-sw15-volume]');
      if (volumeButton) return editVolume(volumeButton.dataset.sw15Volume);
      const button = event.target.closest('[data-sw14-chapter]');
      if (button && selecting) {
        button.parentElement.querySelector('[data-sw29-chapter]').click();
      } else if (button) jumpTo(p.id,button.dataset.sw14Chapter);
    };
    list.onchange = event => {
      const field = event.target.closest('[data-sw29-chapter]');
      if (!selecting || !field) return;
      const key = field.dataset.sw29Chapter;
      if (field.checked) selected.add(key);
      else selected.delete(key);
      updateSelection();
    };
    function setSelecting(value) {
      selecting = value;
      root.dataset.selecting = String(value);
      selectionPanel.hidden = !value;
      if (start) start.hidden = value;
      if (!value) selected.clear();
      else management.open = false;
      paint();
      if (value && !selectVisible.disabled) selectVisible.focus({preventScroll:true});
    }
    if (start) start.onclick = () => setSelecting(true);
    root.querySelector('#sw29-cancel').onclick = () => setSelecting(false);
    selectVisible.onclick = () => {visibleIds.forEach(id => selected.add(id));paint();};
    clearSelection.onclick = () => {selected.clear();paint();};
    move.onclick = () => moveToVolume([...selected]);
    const continued = root.querySelector('#sw16-continue');
    if (continued) continued.onclick = () => {
      chapterId = continued.dataset.id;
      go('write');
    };
    root.querySelector('#sw15-add').onclick = () => {
      modal('添加到目录', `<div class="sw17-setting-index">
        <button type="button" id="sw15-add-chapter"><span>新建章节</span><span aria-hidden="true">›</span></button>
        <button type="button" id="sw15-add-volume"><span>新建分卷</span><span aria-hidden="true">›</span></button>
      </div>`, dialog => {
        dialog.querySelector('#sw15-add-chapter').onclick = () => {closeModal();act('new-chapter');};
        dialog.querySelector('#sw15-add-volume').onclick = () => editVolume();
      });
    };
    const management = root.querySelector('.sw16-directory-tools');
    management.ontoggle = () => {root.dataset.managing = String(management.open);};
    const changeFilter=()=>{clearTimeout(filterTimer);renderLimit=DIRECTORY_CHUNK;paint();};
    filter.onchange=previews.onchange=bodySearch.onchange=changeFilter;
    query.oninput=()=>{
      clearTimeout(filterTimer);
      renderLimit=DIRECTORY_CHUNK;
      filterTimer=setTimeout(()=>{if(root.isConnected)paint();},120);
    };
    if(volumeFilter)volumeFilter.onchange=changeFilter;
    clear.onclick = () => {
      query.value = filter.value = '';
      bodySearch.checked = false;
      if (volumeFilter) volumeFilter.value = '';
      changeFilter();
    };
    paint();
  }
  function aiReferences(p, ch) {
    const plan = planOf(ch.blueprint);
    const references = cardsOf(p).filter(card => card.chapterIds.includes(ch.id)).map(card => ({
      title:card.title, excerpt:cut([card.title,card.source,card.body].filter(Boolean).join('\n'), 1600)
    }));
    if (plan.objective || plan.conflict || plan.beats) references.unshift({
      title:'本章蓝图', excerpt:cut(`目标：${plan.objective}\n冲突：${plan.conflict}\n情节：${plan.beats}`, 1600)
    });
    const profile = cleanWorld(p.worldProfile);
    const setting = Object.entries(worldFields).filter(([key]) => profile[key]).map(([key,label]) => label + '：' + profile[key]).join('\n');
    if (setting) references.push({title:'世界设定', excerpt:cut(setting,1600)});
    if (!references.length) return {html:'', bind:() => {}, read:() => ''};
    return {
      html:`<div class="field"><label for="sw14-ai-reference">本次附带的写作资料</label>
      <select id="sw14-ai-reference"><option value="">不附带资料</option>
      ${references.map((ref, index) => `<option value="${index}">${esc(ref.title)}</option>`).join('')}</select>
      <p class="small-note">选中后会随本次请求发送以下节选，最多 1600 字符。</p>
      <textarea id="sw14-ai-preview" aria-label="实际附带资料节选" readonly hidden></textarea></div>`,
      bind(root) {
        const select = root.querySelector('#sw14-ai-reference'), preview = root.querySelector('#sw14-ai-preview');
        select.onchange = () => {
          preview.value = references[select.value]?.excerpt || '';
          preview.hidden = !preview.value;
        };
      },
      read(root) {
        return references[root.querySelector('#sw14-ai-reference').value]?.excerpt || '';
      }
    };
  }
  window.StoryWeaveWorkshop = {aiReferences,contentsPage,wireContents,setFocusHeading};
  openChapters = openBoard;

  const textSizes = {'15':'小', '17':'标准', '20':'大'};
  const lineHeights = {'1.55':'密排', '1.75':'紧凑', '2.05':'舒展', '2.35':'宽松'};
  const papers = {paper:'米纸', ink:'墨夜', auto:'随系统'};
  const backgrounds = {plain:'纯色稿纸',pine:'松影',mist:'雾岚',custom:'本机图片'};
  const displayKey = 'storyweave_writer_display';
  const imageLimit = 700_000;
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  let display = {size:'17',leading:'2.05',paper:'paper',background:'plain',image:''};
  try {
    const stored = JSON.parse(localStorage.getItem(displayKey) || '{}');
    if (stored && typeof stored === 'object') {
      for (const [key,options] of Object.entries({size:textSizes,leading:lineHeights,paper:papers,background:backgrounds})) {
        if (Object.hasOwn(options,stored[key])) display[key] = String(stored[key]);
      }
      if (typeof stored.image === 'string' && stored.image.length <= imageLimit &&
          /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(stored.image)) display.image = stored.image;
    }
  } catch (_) {}
  function paintPaper(element,settings) {
    element.dataset.sw16Paper = settings.paper === 'ink' || (settings.paper === 'auto' && systemDark.matches) ? 'ink' : 'paper';
    const background = settings.background === 'custom' && !settings.image ? 'plain' : settings.background;
    element.dataset.sw20Background = background;
    if (background === 'custom') element.style.setProperty('--sw20-image',`url("${settings.image}")`);
    else element.style.removeProperty('--sw20-image');
  }
  function applyDisplay() {
    paintPaper(document.body,display);
    const editor = document.querySelector('#chapterText');
    if (!editor) return;
    editor.style.setProperty('--sw14-font', display.size + 'px');
    editor.style.setProperty('--sw14-leading', display.leading);
  }
  systemDark.addEventListener('change',applyDisplay);
  applyDisplay();
  async function prepareBackground(file) {
    if (!file.size || file.size > 12 * 1024 * 1024) throw Error('请选择 12 MB 以内的图片');
    if (!/\.(jpe?g|png|webp)$/i.test(file.name) || (file.type && !/^image\/(jpeg|png|webp)$/.test(file.type))) {
      throw Error('仅支持 JPG、PNG、WebP 图片');
    }
    const bitmap = await createImageBitmap(file).catch(() => {throw Error('图片无法读取，请重新选择');});
    try {
      const ratio = Math.min(1,1280 / Math.max(bitmap.width,bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1,Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1,Math.round(bitmap.height * ratio));
      const brush = canvas.getContext('2d',{alpha:false});
      if (!brush) throw Error('当前设备无法处理图片');
      brush.fillStyle = '#8f8e85';
      brush.fillRect(0,0,canvas.width,canvas.height);
      brush.drawImage(bitmap,0,0,canvas.width,canvas.height);
      let image = canvas.toDataURL('image/jpeg',.82);
      if (image.length > imageLimit) image = canvas.toDataURL('image/jpeg',.62);
      if (image.length > imageLimit || !image.startsWith('data:image/jpeg;')) throw Error('图片无法压缩，请选择较小的图片');
      return image;
    } finally {bitmap.close();}
  }
  function editDisplay() {
    modal('稿纸与版式', `<div class="field"><label for="sw16-paper">稿纸</label><select id="sw16-paper" name="paper">
      ${Object.entries(papers).map(([key,label]) => `<option value="${key}" ${key === display.paper ? 'selected' : ''}>${label}</option>`).join('')}
      </select></div><div class="field"><label for="sw20-background">写作背景</label><select id="sw20-background" name="background">
      ${Object.entries(backgrounds).map(([key,label]) => `<option value="${key}" ${key === display.background ? 'selected' : ''}>${label}</option>`).join('')}
      </select></div><div class="sw20-background-controls" hidden>
      <div class="sw15-actions"><button type="button" class="button outline" id="sw20-choose">选择图片</button>
      <button type="button" class="button outline" id="sw20-remove">移除图片</button></div>
      <input hidden type="file" id="sw20-image" accept="image/jpeg,image/png,image/webp">
      <p class="small-note" id="sw20-image-status" role="status">支持 JPG、PNG、WebP。图片保存在本机。</p></div>
      <div id="sw20-preview" aria-label="稿纸预览"><small>稿纸预览</small><div>薄雾越过河岸，远处的灯还亮着。<br>她把信折好，等天色慢慢清明。</div></div>
      <div class="field"><label for="sw14-size">字号</label><select id="sw14-size" name="size">
      ${Object.entries(textSizes).map(([key,label]) => `<option value="${key}" ${key === display.size ? 'selected' : ''}>${label} · ${key}px</option>`).join('')}
      </select></div><div class="field"><label for="sw14-leading">行距</label><select id="sw14-leading" name="leading">
      ${Object.entries(lineHeights).map(([key,label]) => `<option value="${key}" ${key === display.leading ? 'selected' : ''}>${label}</option>`).join('')}
      </select></div>${window.StoryWeavePreferences?.fieldGroup('layout') || ''}
      <div class="sw15-actions sw20-display-footer"><button class="button primary" id="sw14-display-save">应用</button>
      <button class="button outline" id="sw17-display-back">全部设置</button></div>`, root => {
      root.classList.add('sw16-paper-modal');
      const background = root.querySelector('#sw20-background'), preview = root.querySelector('#sw20-preview');
      const controls = root.querySelector('.sw20-background-controls'), fileInput = root.querySelector('#sw20-image');
      const choose = root.querySelector('#sw20-choose'), remove = root.querySelector('#sw20-remove');
      const status = root.querySelector('#sw20-image-status'), save = root.querySelector('#sw14-display-save');
      const hint = status.textContent;
      let image = display.image, busy = false;
      const read = () => ({size:formVal(root,'size'),leading:formVal(root,'leading'),
        paper:formVal(root,'paper'),background:background.value,image});
      const update = () => {
        const draft = read();
        paintPaper(preview,draft);
        preview.style.setProperty('--sw14-font',draft.size + 'px');
        preview.style.setProperty('--sw14-leading',draft.leading);
        preview.dataset.sw17Face = root.querySelector('#sw17-face')?.value || 'serif';
        preview.dataset.sw17Ruled = String(Boolean(root.querySelector('#sw17-ruled')?.checked));
        controls.hidden = draft.background !== 'custom';
        choose.disabled = busy;
        remove.disabled = busy || !image;
        save.disabled = busy || (draft.background === 'custom' && !image);
      };
      root.addEventListener('change',update);
      choose.onclick = () => fileInput.click();
      remove.onclick = () => {
        image = '';
        background.value = 'plain';
        status.textContent = hint;
        update();
      };
      fileInput.onchange = async () => {
        const file = fileInput.files?.[0];
        fileInput.value = '';
        if (!file || busy) return;
        busy = true;
        status.textContent = '正在处理图片…';
        update();
        try {
          image = await prepareBackground(file);
          status.textContent = '图片已载入预览。点「应用」保存。';
        } catch (error) {status.textContent = error.message;}
        finally {busy = false;update();}
      };
      root.querySelector('#sw17-display-back').onclick = () => openSettings();
      save.onclick = () => {
        display = read();
        window.StoryWeavePreferences?.save(root,'layout');
        applyDisplay();
        closeModal();
        try {
          localStorage.setItem(displayKey,JSON.stringify(display));
          if (tab !== 'write') toast('已应用到写作页与阅读预览');
        } catch (_) {toast('无法保存稿纸与背景，已在本次会话应用');}
      };
      update();
    });
  }
  function openTools() {
    const focused = document.body.classList.contains('focus-mode');
    const atlasBack = window.StoryWeaveAtlas?.canReturn() ? [['v12-atlas-return','返回地图']] : [];
    const quickAi = document.body.dataset.sw17AiShortcut === 'true';
    const jump = ['sw19-jump','跳转章节'], displayTool = ['v14-display','稿纸与版式'];
    const ai = quickAi ? ['v17-quick-ai',chapter()?.text.trim() ? 'AI 续写' : 'AI 开头'] : ['ai-assist','AI 协作'];
    const groups = [
      ...(focused ? [['专注写作',[jump,displayTool,ai]]] : []),
      ['写作', [['sw27-bookmarks','写作书签'], ['v16-copy','快捷复制'], ['sw7-find','查找替换'], ['v16-format','排版预览'], ['reader','阅读预览'],
        ['snapshot','保存版本'], ['view-history','历史版本'], ['sw7-prev','上一章'], ['sw7-next','下一章']]],
      ['章节资料', [...atlasBack, ['v14-plan','蓝图与定稿'], ['v14-chapter-kb','本章资料'],
        ['v11-archive','剧情审核'], ['sw9-new','剧情分支'], ...(!focused ? [jump] : []), ['v14-board','作品目录'], ['v17-remove-chapter','移入回收站']]],
      ['显示与文件', [...(!focused ? [displayTool] : []), ['settings','全部设置'], ['ai-source-settings','模型设置'],
        ['export-text','导出本章'], ['sw25-export','导出书稿'], ['sw7-backup','备份作品']]]
    ];
    modal('写作工具', `<div class="sw15-tool-sheet">
      ${groups.map(([label,tools]) => `<section><h3>${label}</h3><div>
        ${tools.map(([action,title]) => `<button type="button" data-sw15-tool="${action}">${title}</button>`).join('')}
      </div></section>`).join('')}</div>`, root => {
      root.classList.add('sw15-tool-modal');
      for (const button of root.querySelectorAll('[data-sw15-tool]')) {
        button.onclick = () => {closeModal();act(button.dataset.sw15Tool);};
      }
    });
  }
  function setFocusHeading(open) {
    const toggle = document.getElementById('sw21-title-toggle');
    const shell = document.querySelector('.editor-shell');
    if (!toggle || !shell) return;
    shell.dataset.sw21Heading = open ? 'open' : 'closed';
    toggle.setAttribute('aria-expanded',String(open));
  }
  const beforeWrite = writePage, beforeWorld = worldPage, beforeWire = wireWriter;
  writePage = function () {
    const base = beforeWrite(), ch = chapter();
    if (!ch) return base;
    const refs = cardsOf(project()).filter(card => card.chapterIds.includes(ch.id)).length;
    const start = base.indexOf('<div class="editor-shell">');
    if (start < 0) return base;
    const focused = document.body.classList.contains('focus-mode');
    const bar = `<div class="sw14-editor-bar" role="group" aria-label="写作工具栏">
      <button type="button" data-action="focus" class="sw14-focus-button" aria-label="${focused ? '退出专注' : '进入专注'}">
        <span class="sw14-desk-only">专注</span><span class="sw15-focus-only">${ico('left')}</span></button>
      <button type="button" class="sw15-focus-only" id="sw21-title-toggle" aria-expanded="false" aria-controls="sw21-heading">
        <span class="sw21-chapter-name">${esc(String(ch.title ?? '').trim() || `第${chapters().indexOf(ch)+1}章`)}</span>
        <span class="sw21-chapter-generic">章节</span>${ico('chevron')}</button>
      <button class="sw14-desk-only sw15-ai-entry" data-action="ai-assist">AI 协作</button>
      <button class="sw14-desk-only sw17-quick-ai" data-action="v17-quick-ai">AI 续写</button>
      <button type="button" class="sw14-desk-only" data-action="v14-chapter-kb" aria-haspopup="dialog">资料</button>
      ${window.StoryWeaveAtlas?.canReturn() ? '<button type="button" class="sw14-desk-only" data-action="v12-atlas-return" aria-haspopup="dialog">返回地图</button>' : ''}
      <button type="button" data-action="v15-tools" aria-label="写作工具" aria-haspopup="dialog">
        <span class="sw14-desk-only">工具</span><span class="sw15-focus-only">${ico('more')}</span></button></div>`;
    const secondaryStarts = ['<div class="tool-row">','<section class="sw10-chapter">']
      .map(marker => base.indexOf(marker,start)).filter(index => index >= 0);
    const tools = secondaryStarts.length ? Math.min(...secondaryStarts) : -1;
    const page = tools < 0 ? base.slice(start) : base.slice(start,tools);
    const marks = `<div class="sw15-punctuation" role="group" aria-label="快捷标点">
      ${['，','。','？','！','：','“”','《》','……'].map(mark => `<button type="button" data-sw15-mark="${mark}">${mark}</button>`).join('')}</div>`;
    const editor = page.replace('<div class="editor-footer">',marks + '<div class="editor-footer">');
    const meta = `<p class="sw15-chapter-meta"><span id="sw14-live-status">${labels[status(ch)]}</span> · ${refs} 条本章资料</p>`;
    return bar + editor + meta + (tools < 0 ? '' :
      `<details class="sw15-secondary"><summary>更多功能</summary>${base.slice(tools)}</details>`);
  };
  wireWriter = function () {
    beforeWire();
    applyDisplay();
    const update = () => {
      const element = document.querySelector('#sw14-live-status'), current = chapter();
      if (element && current) element.textContent = labels[status(current)];
    };
    const editor = document.querySelector('#chapterText');
    editor?.addEventListener('input', update);
    const title = document.getElementById('chapterTitle'), toggle = document.getElementById('sw21-title-toggle');
    title?.addEventListener('input', () => {
      update();
      const name = toggle?.querySelector('.sw21-chapter-name');
      if (name) name.textContent = title.value.trim() || `第${chapters().indexOf(chapter())+1}章`;
    });
    if (!editor) return;
    if (toggle && title) {
      const closeHeading = () => {
        setFocusHeading(false);
        editor.focus({preventScroll:true});
      };
      toggle.onclick = () => {
        if (toggle.getAttribute('aria-expanded') === 'true') closeHeading();
        else {
          setFocusHeading(true);
          title.focus({preventScroll:true});
        }
      };
      title.addEventListener('keydown', event => {
        if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229 ||
            !document.body.classList.contains('focus-mode')) return;
        event.preventDefault();
        closeHeading();
      });
    }
    const punctuation = document.querySelector('.sw15-punctuation');
    let composing = false;
    editor.addEventListener('compositionstart', () => {composing = true;});
    editor.addEventListener('compositionend', () => {composing = false;});
    punctuation?.addEventListener('pointerdown', event => {
      if (event.target.closest('[data-sw15-mark]')) event.preventDefault();
    });
    punctuation?.addEventListener('click', event => {
      const mark = event.target.closest('[data-sw15-mark]')?.dataset.sw15Mark;
      if (!mark || composing) return;
      const start = editor.selectionStart, end = editor.selectionEnd;
      const paired = mark === '“”' || mark === '《》';
      const selected = editor.value.slice(start,end);
      const text = paired ? mark[0] + selected + mark[1] : mark;
      editor.focus({preventScroll:true});
      editor.dispatchEvent(new Event('beforeinput',{bubbles:true}));
      replaceWritingText(editor,start,end,text,paired && !selected ? start+1 : undefined);
    });
  };
  worldPage = function () {
    const base = beforeWorld();
    const work = project();
    if (!work) return base;
    const profile = cleanWorld(work.worldProfile);
    return `<section class="sw10-hub sw15-world"><h3>故事背景与资料</h3>
      <p>${esc(short(profile.premise || work.summary || '记录世界的时代、规则与核心矛盾。',160))}</p>
      <div class="sw15-actions"><button class="button primary" data-action="v15-world">编辑世界设定</button>
      <button class="button outline" data-action="v15-terms">术语表 · ${cardsOf(work).filter(card => card.category === '术语').length}</button>
      <button class="button outline" data-action="v14-kb">知识库 · ${cardsOf(work).length}</button>
      <button class="button outline" data-action="v12-atlas">地图</button></div></section>
      <details class="sw15-secondary"><summary>年表与世界档案</summary>
      <button class="button outline" data-action="audit">故事体检</button>${base}</details>`;
  };
  const beforeAct = act;
  act = function (action, key) {
    if (action === 'new-chapter') return addChapterToVolume(key);
    if (action === 'sw19-jump') return openChapterJump();
    if (action === 'v14-display') return editDisplay();
    if (action === 'v15-tools') return openTools();
    if (action === 'v15-world') return editWorld();
    if (action === 'v15-terms') return openKnowledge('', '', '术语');
    if (action === 'v15-terms-chapter') return openKnowledge(chapter()?.id, '', '术语');
    if (action === 'v14-plan') return editBlueprint();
    if (action === 'v14-board') return openBoard();
    if (action === 'sw25-export') return openManuscriptExport(key);
    if (action === 'v14-kb') return openKnowledge();
    if (action === 'v14-chapter-kb') return openKnowledge(chapter()?.id);
    return beforeAct(action, key);
  };
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.isComposing || !document.body.classList.contains('focus-mode') ||
        document.querySelector('#modalRoot .modal')) return;
    const title = document.getElementById('sw21-title-toggle');
    if (title?.getAttribute('aria-expanded') === 'true') {
      event.preventDefault();
      setFocusHeading(false);
      title.focus({preventScroll:true});
      return;
    }
    toggleFocus();
  });
  const beforeNormalize = normalizeBackup;
  normalizeBackup = function (data) {
    const clean = beforeNormalize(data);
    const projects = clean.projects.map(p => {
      const chapterIds = new Set(p.chapters.map(ch => ch.id));
      const seen = new Set(), knowledgeCards = [];
      let size = 0;
      for (const raw of cardsOf(p).slice(0,200)) {
        const card = cleanCard(raw, chapterIds);
        if (!card || seen.has(card.id) || size + card.body.length > 1000000) continue;
        seen.add(card.id);
        size += card.body.length;
        knowledgeCards.push(card);
      }
      const volumes = volumesOf(p), volumeIds = new Set(volumes.map(row => row.id));
      const chapters = p.chapters.map(ch => {
        const updated = {...ch,volumeId:volumeIds.has(ch.volumeId) ? ch.volumeId : ''};
        if (ch.blueprint) updated.blueprint = planOf(ch.blueprint);
        return updated;
      });
      return {...p, knowledgeCards, chapters, volumes, worldProfile:cleanWorld(p.worldProfile)};
    });
    return {...clean, projects, version:14};
  };
})();
