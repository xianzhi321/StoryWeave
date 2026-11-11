(() => {
  'use strict';
  const positionKey = 'storyweave_editor_positions';
  let positions = [];
  let activeEditor;
  let timer;
  const bookmarkLimit = 12;
  try {
    const stored = JSON.parse(localStorage.getItem(positionKey) || '[]');
    if (Array.isArray(stored)) positions = stored.filter(row => row &&
      typeof row.work === 'string' && typeof row.chapter === 'string' &&
      Number.isInteger(row.caret) && row.caret >= 0 &&
      Number.isFinite(row.scroll) && row.scroll >= 0).slice(-80);
  } catch (_) {}

  function rememberPosition() {
    clearTimeout(timer);
    if (!activeEditor) return;
    const {work, chapter, editor} = activeEditor;
    const row = {work, chapter, start:editor.selectionStart, caret:editor.selectionEnd,
      direction:editor.selectionDirection, scroll:Math.round(editor.scrollTop)};
    const last = positions.at(-1);
    if (last?.work === work && last.chapter === chapter && last.caret === row.caret && last.scroll === row.scroll &&
        last.start === row.start && last.direction === row.direction) return;
    positions = positions.filter(item => item.work !== work || item.chapter !== chapter);
    positions.push(row);
    positions = positions.slice(-80);
    try {localStorage.setItem(positionKey,JSON.stringify(positions));} catch (_) {}
  }
  function schedulePosition() {
    clearTimeout(timer);
    timer = setTimeout(rememberPosition,180);
  }
  function resumeChapter(work) {
    if (!work) return null;
    const ids = new Set(work.chapters.map(row => row.id));
    for (let index = positions.length - 1; index >= 0; index--) {
      const row = positions[index];
      if (row.work === work.id && ids.has(row.chapter)) return row.chapter;
    }
    return null;
  }
  function lastOpenedChapter() {
    const works = new Map(state.projects.map(work => [work.id,work]));
    for (let index = positions.length - 1; index >= 0; index--) {
      const position = positions[index], work = works.get(position.work);
      const chapter = work?.chapters.find(row => row.id === position.chapter);
      if (chapter) return {work,chapter};
    }
    return null;
  }
  const priorBootstrap = bootstrap;
  bootstrap = async function () {
    await priorBootstrap();
    chapterId = resumeChapter(project()) || chapterId;
  };
  const priorRender = render, priorWire = wireWriter;
  render = function () {
    rememberPosition();
    activeEditor = null;
    priorRender();
  };
  wireWriter = function () {
    priorWire();
    const work = project(), ch = chapter(), editor = document.querySelector('#chapterText');
    if (!work || !ch || !editor) return;
    const row = positions.find(item => item.work === work.id && item.chapter === ch.id);
    if (row) {
      const caret = Math.min(editor.value.length,row.caret);
      const start = Number.isInteger(row.start) && row.start >= 0 ? Math.min(row.start,caret) : caret;
      editor.setSelectionRange(start,caret,row.direction);
      editor.scrollTop = row.scroll;
    }
    activeEditor = {work:work.id,chapter:ch.id,editor};
    for (const event of ['scroll','input','select','keyup','pointerup']) editor.addEventListener(event,schedulePosition);
    schedulePosition();
  };
  window.addEventListener('pagehide',rememberPosition);
  document.addEventListener('visibilitychange',() => {if (document.hidden) rememberPosition();});

  const editorText = text => text.replace(/\r\n?/g,'\n');
  function bookmarksOf(ch) {
    if (!Array.isArray(ch.writingBookmarks)) return [];
    return ch.writingBookmarks.slice(0,bookmarkLimit).filter(row => row &&
      typeof row.id === 'string' && row.id.length <= 100 &&
      typeof row.title === 'string' && row.title.length <= 40 &&
      Number.isInteger(row.caret) && row.caret >= 0 &&
      typeof row.context === 'string' && row.context.length <= 64 &&
      Number.isInteger(row.offset) && row.offset >= 0 && row.offset <= row.context.length);
  }
  function revealSelection(editor, start, end = start) {
    editor.setSelectionRange(start,end);
    const mirror = document.createElement('div'), marker = document.createElement('span');
    const computed = getComputedStyle(editor);
    mirror.style.cssText = 'position:absolute;visibility:hidden;top:0;left:0;box-sizing:border-box;overflow:hidden;';
    for (const property of ['fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','wordSpacing',
      'whiteSpace','overflowWrap','wordBreak','textIndent','tabSize','padding']) mirror.style[property] = computed[property];
    mirror.style.width = editor.clientWidth+'px';
    marker.textContent = '\u200b';
    const nextLine = editor.value.indexOf('\n',start);
    mirror.append(editor.value.slice(0,start),marker,editor.value.slice(start,nextLine<0?undefined:nextLine));
    document.body.append(mirror);
    const top = marker.offsetTop;
    mirror.remove();
    editor.scrollTop = Math.max(0,top-editor.clientHeight/3);
  }
  function jumpToBookmark(workId,chapterKey,key) {
    const work = project(), ch = work?.chapters.find(row=>row.id===chapterKey);
    const mark = ch && bookmarksOf(ch).find(row=>row.id===key);
    if (work?.id !== workId || !mark) return toast('书签已不存在');
    const text = editorText(ch.text);
    const expected = mark.caret-mark.offset;
    const found = mark.context ? text.indexOf(mark.context) : -1;
    const unique = found >= 0 && text.indexOf(mark.context,found+1) < 0;
    const samePosition = found >= 0 && expected >= 0 && text.startsWith(mark.context,expected);
    const caret = unique ? found+mark.offset : Math.min(mark.caret,text.length);
    closeModal();
    if (tab !== 'write' || chapter()?.id !== chapterKey) {
      chapterId = chapterKey;
      go('write');
    }
    const editor = document.querySelector('#chapterText');
    if (editor) {
      editor.focus({preventScroll:true});
      revealSelection(editor,caret);
      rememberPosition();
    }
    if (mark.context && !unique && !samePosition) toast('书签附近的正文已变化，已跳到原位置附近');
  }
  function openBookmarks() {
    const work = project(), ch = tab === 'write' ? chapter() : null;
    if (!work) return;
    const editor = ch && document.querySelector('#chapterText');
    const captured = editor?.value, caret = editor?.selectionEnd;
    const list = work.chapters.flatMap(row => bookmarksOf(row).map(mark => ({ch:row,mark})));
    modal('写作书签', `
      ${editor?`<div class="sw27-bookmark-form field">
        <label for="sw27-bookmark-title">书签名称（选填）</label>
        <div><input id="sw27-bookmark-title" maxlength="40" placeholder="例如：下次从这里继续">
        <button type="button" class="button primary" id="sw27-bookmark-add">标记光标处</button></div>
      </div>`:''}
      <p class="small-note">书签随作品备份保存。</p>
      <div class="sw27-bookmark-list">${list.map(({ch,mark},index)=>`<div class="sw27-bookmark-row">
        <button class="sw19-jump-row" type="button" data-sw27-jump="${index}"><strong>${esc(mark.title)}</strong>
        <small>${esc(ch.title || '未命名章节')}</small></button>
        <button class="button outline" type="button" data-sw27-remove="${index}" aria-label="删除书签：${esc(mark.title)}">删除</button>
      </div>`).join('') || '<p class="small-note">这部作品还没有书签。</p>'}</div>
      <p class="small-note" role="status"></p>`, root=>{
      const add = root.querySelector('#sw27-bookmark-add'), title = root.querySelector('#sw27-bookmark-title');
      const status = root.querySelector('[role="status"]');
      const buttons = [...root.querySelectorAll('button')];
      let busy = false;
      root.closest('.modal-backdrop').addEventListener('click',event=>{
        if(busy && event.target.classList.contains('modal-backdrop')) event.stopImmediatePropagation();
      },true);
      async function update(chapterKey,change) {
        if (busy) return;
        busy = true;
        buttons.forEach(button=>button.disabled=true);
        status.textContent = '正在保存…';
        try {
          await StoryWeaveWorkspace.transact(next=>{
            const current = next.projects.find(row=>row.id===work.id);
            const target = current?.chapters.find(row=>row.id===chapterKey);
            if (next.selected!==work.id || !target) throw Error('作品或章节已变化');
            const writingBookmarks = change(target,bookmarksOf(target));
            next.projects = next.projects.map(row=>row===current ? {...row,
              chapters:row.chapters.map(item=>item===target?{...item,writingBookmarks}:item)} : row);
          });
          render();
          if (root.isConnected) openBookmarks();
        } catch (error) {
          status.textContent = error.message;
        } finally {
          busy = false;
          buttons.forEach(button=>button.disabled=false);
        }
      }
      if (add) add.onclick = ()=>update(ch.id,(target,marks)=>{
        if (editorText(target.text)!==captured) throw Error('正文已变化，请重新打开书签');
        if (marks.length>=bookmarkLimit) throw Error(`本章最多保存 ${bookmarkLimit} 个书签`);
        const from = Math.max(0,caret-24);
        const name = title.value.trim().slice(0,40) || '写作位置';
        return [...marks,{id:id(),title:name,caret,context:captured.slice(from,caret+24),offset:caret-from}];
      });
      for (const button of root.querySelectorAll('[data-sw27-jump]')) {
        const item = list[Number(button.dataset.sw27Jump)];
        button.onclick = ()=>jumpToBookmark(work.id,item.ch.id,item.mark.id);
      }
      for (const button of root.querySelectorAll('[data-sw27-remove]')) {
        const item = list[Number(button.dataset.sw27Remove)];
        button.onclick = ()=>update(item.ch.id,(_target,marks)=>marks.filter(mark=>mark.id!==item.mark.id));
      }
    });
  }

  function back() {
    const drawer = document.querySelector('#sw7DrawerClose');
    if (drawer) {drawer.click();return true;}
    const dialog = document.querySelector('#modalRoot #modalClose');
    if (dialog) {if (!dialog.disabled) dialog.click();return true;}
    if (document.body.classList.contains('focus-mode')) {
      const heading = document.getElementById('sw21-title-toggle');
      if (heading?.getAttribute('aria-expanded') === 'true') {
        StoryWeaveWorkshop.setFocusHeading(false);
        heading.focus({preventScroll:true});
      } else toggleFocus();
      return true;
    }
    if (tab === 'write') {go('contents');return true;}
    if (tab !== 'home') {go('home');return true;}
    return false;
  }

  function openCopy() {
    const ch = chapter();
    if (!ch) return;
    modal('快捷复制', `<div class="field"><label for="sw16-copy-part">复制范围</label><select id="sw16-copy-part">
      <option value="both">标题和正文</option><option value="body">仅正文</option><option value="title">仅标题</option>
      </select></div><div class="field"><label for="sw16-copy-value">复制内容</label>
      <textarea id="sw16-copy-value" readonly></textarea></div>
      <button class="button primary" id="sw16-copy">复制到剪贴板</button>`, root => {
      root.classList.add('sw16-paper-modal');
      const select = root.querySelector('#sw16-copy-part');
      const preview = root.querySelector('#sw16-copy-value'), button = root.querySelector('#sw16-copy');
      const paint = () => {
        const variants = {title:ch.title || '',body:ch.text,both:[ch.title,ch.text].filter(Boolean).join('\n\n')};
        preview.value = variants[select.value];
        button.disabled = !preview.value;
      };
      select.onchange = paint;
      button.onclick = async () => {
        const value = preview.value;
        if (!value) return;
        try {
          if (value.length <= 250000 && typeof window.StoryBridge?.copyChapterText === 'function') {
            window.StoryBridge.copyChapterText(value);
          } else {
            await navigator.clipboard.writeText(value);
            if (root.isConnected) toast('已复制到剪贴板');
          }
        } catch (_) {
          if (!root.isConnected) return;
          preview.focus();
          preview.select();
          toast('内容已选中，可长按复制或使用快捷键');
        }
      };
      paint();
    });
  }

  function formatText(text, options) {
    if (!options.trim && !options.blank && !options.indent) return text;
    // Keep the source line ending style when all lines use CRLF.
    const useCRLF = text.includes('\r\n') && !text.replace(/\r\n/g,'').includes('\n');
    let lines = text.replace(/\r\n/g,'\n').split('\n');
    if (options.trim) lines = lines.map(line => line.replace(/[ \t\u3000]+$/u,''));
    if (options.blank) lines = lines.filter((line,index) => line.trim() || index === 0 || lines[index-1].trim());
    if (options.indent) lines = lines.map(line => line.trim() ? '\u3000\u3000' + line.replace(/^[ \t\u3000]+/u,'') : line);
    return lines.join(useCRLF ? '\r\n' : '\n');
  }
  function openFormat() {
    const ch = chapter(), workId = state.selected;
    if (!ch) return;
    const original = ch.text, title = ch.title;
    modal('排版预览', `<p class="small-note">按纯文本整理本章，预览首次差异附近的内容。采用前会保留一份原稿版本。</p>
      <fieldset class="sw16-format-options"><legend>整理规则</legend>
      <label><input type="checkbox" name="trim" checked> 清理行尾空白</label>
      <label><input type="checkbox" name="blank" checked> 压缩连续空行</label>
      <label><input type="checkbox" name="indent"> 每段开头缩进两格</label>
      </fieldset><div class="sw15-comparison sw16-format-compare">
      <div><strong>原稿</strong><pre id="sw16-format-old"></pre></div>
      <div><strong>整理后</strong><pre id="sw16-format-new"></pre></div></div>
      <p class="small-note" id="sw16-format-status" role="status"></p>
      <button class="button primary" id="sw16-format-apply">采用排版</button>`, root => {
      root.classList.add('sw16-paper-modal');
      const controls = root.querySelector('fieldset'), button = root.querySelector('#sw16-format-apply');
      const status = root.querySelector('#sw16-format-status'), close = root.querySelector('#modalClose');
      let proposed = original, busy = false;
      root.closest('.modal-backdrop').addEventListener('click',event => {
        if (busy && event.target.classList.contains('modal-backdrop')) event.stopImmediatePropagation();
      },true);
      function paint() {
        const options = Object.fromEntries([...controls.querySelectorAll('input')].map(input => [input.name,input.checked]));
        proposed = formatText(original,options);
        const preview = StoryWeaveEditor.previewComparison(original,proposed);
        root.querySelector('#sw16-format-old').textContent = preview.old;
        root.querySelector('#sw16-format-new').textContent = preview.proposed;
        button.disabled = proposed === original;
        status.textContent = button.disabled ? '正文已符合所选规则。' : '已有调整，可核对后采用。';
      }
      controls.onchange = paint;
      button.onclick = async () => {
        if (busy || proposed === original) return;
        const latest = chapter();
        if (state.selected !== workId || latest?.id !== ch.id || latest.text !== original || latest.title !== title) {
          status.textContent = '章节已变化，请重新打开排版预览。';
          return;
        }
        busy = controls.disabled = button.disabled = close.disabled = true;
        try {
          await StoryWeaveEditor.commitChapterEdit(ch.id,proposed,title,'采用排版前');
          closeModal();
          render();
          toast('排版已应用，原稿见历史版本');
        } catch (error) {
          status.textContent = '保存失败：' + error.message;
        } finally {
          busy = controls.disabled = button.disabled = close.disabled = false;
        }
      };
      paint();
    });
  }
  const priorAct = act;
  act = function (action, key) {
    if (action === 'v16-back') return back();
    if (action === 'v16-copy') return openCopy();
    if (action === 'v16-format') return openFormat();
    if (action === 'sw27-bookmarks') return openBookmarks();
    return priorAct(action,key);
  };
  window.StoryWeaveDesk = {resumeChapter,lastOpenedChapter,back,revealSelection,rememberPosition};
})();
