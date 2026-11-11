(() => {
  'use strict';
  const groups = {
    layout: [
      ['margin','正文边距','窄屏可选择更紧凑的边距。',{narrow:'窄',normal:'标准',wide:'宽'},'normal'],
      ['titleSize','标题字号','独立于正文大小。',{small:'小',normal:'标准',large:'大'},'normal'],
      ['face','正文字体','使用设备可用的系统字体。',{serif:'衬线',sans:'无衬线'},'serif'],
      ['ruled','稿纸横线','随正文行距排列。',null,false],
      ['quiet','简洁写作界面','隐藏装饰背景和横线，写作时只保留正文与必要工具。',null,true]
    ],
    typing: [
      ['entryMode','打开章节时','可直接进入专注写作。',{desk:'写作台',focus:'专注模式'},'desk'],
      ['focusChapterLabel','专注顶栏章名','点顶栏中央可展开编辑。',{compact:'单行章名',hidden:'只显示「章节」'},'compact'],
      ['newChapterCursor','新章光标位置','新建章节后生效。',{manual:'自行选择',title:'标题',body:'正文'},'manual'],
      ['symbols','专注模式快捷标点','手机正文获得焦点时显示。',null,true],
      ['pairs','自动补全成对符号','在段末输入左引号、括号或书名号时补右侧符号。',null,false],
      ['pairDelete','成对删除空符号','光标在空引号或括号中间时，退格删除整对。',null,false],
      ['indent','换行后段首缩进','插入两个全角空格。',null,false],
      ['paste','多行粘贴','只影响新粘贴到正文的文字。',{original:'保留原样',compact:'压缩连续空行'},'original'],
      ['counting','正文字数口径','只影响编辑器下方计数。',{normal:'排除空白',noPunctuation:'排除空白和标点',latin:'连续拉丁字母按词'},'normal']
    ],
    shelf: [
      ['shelf','书架布局','紧凑列表适合较多作品。',{grid:'封面网格',list:'列表'},'grid'],
      ['shadows','封面阴影','让封面与背景有层次。',null,true],
      ['tags','显示作品标签','在作品名称下展示类型或标签。',null,true]
    ],
    ai: [
      ['aiShortcut','显示 AI 开头／续写','写作台显示快捷入口，专注模式收在工具中。',null,false]
    ]
  };
  const fields = Object.values(groups).flat();
  const storageKey = 'storyweave_interface_preferences';
  let preferences = Object.fromEntries(fields.map(([key,,,,fallback]) => [key,fallback]));
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
    for (const [key,,,choices] of fields) {
      const value = stored?.[key];
      if (choices ? Object.hasOwn(choices,value) : typeof value === 'boolean') preferences[key] = value;
    }
  } catch (_) {}

  function fieldGroup(name) {
    return `<div class="sw17-settings-list">${groups[name].map(([key,label,help,choices]) =>
      `<label class="sw17-setting" for="sw17-${key}"><span><strong>${label}</strong><small>${help}</small></span>
      ${choices ? `<select id="sw17-${key}">${Object.entries(choices).map(([value,title]) =>
        `<option value="${value}" ${preferences[key] === value ? 'selected' : ''}>${title}</option>`).join('')}</select>`
        : `<input type="checkbox" role="switch" id="sw17-${key}" ${preferences[key] ? 'checked' : ''}>`}</label>`).join('')}</div>`;
  }
  function apply() {
    const body = document.body;
    if (!body) return;
    for (const key of ['margin','titleSize','face','ruled','quiet','symbols','shelf','shadows','tags','aiShortcut','focusChapterLabel']) {
      body.dataset['sw17' + key[0].toUpperCase() + key.slice(1)] = String(preferences[key]);
    }
    updateEditor();
  }
  function save(root,name) {
    const updated = {...preferences};
    for (const [key,,,choices] of groups[name]) {
      const input = root.querySelector('#sw17-' + key);
      if (input && (!choices || Object.hasOwn(choices,input.value))) updated[key] = choices ? input.value : input.checked;
    }
    try {localStorage.setItem(storageKey,JSON.stringify(updated));}
    catch (_) {toast('无法持久保存设置，已在本次会话应用');}
    preferences = updated;
    apply();
  }
  const oldModelSettings = openSettings;
  const settingPages = [
    ['appearance','稿纸与版式','稿纸、写作背景、字号、行距和横线'],
    ['typing','写作辅助','标点、自动配对、缩进、粘贴与字数'],
    ['shelf','书架外观','封面网格或列表、阴影与作品标签'],
    ['ai','AI 写作入口','自行决定是否显示 AI 开头／续写'],
    ['models','模型连接','云端兼容接口与本机 IRIDIS'],
    ['backup','备份与迁移','导出、导入本机作品备份']
  ];
  function showGroup(name) {
    const heading = settingPages.find(row => row[0] === name)?.[1];
    modal(heading, `${fieldGroup(name)}<div class="sw15-actions sw17-footer">
      <button class="button primary" id="sw17-save">保存设置</button>
      <button class="button outline" id="sw17-settings-back">返回设置</button></div>`, root => {
      root.classList.add('sw17-settings-modal');
      root.querySelector('#sw17-save').onclick = () => {save(root,name);openSettings();};
      root.querySelector('#sw17-settings-back').onclick = openSettings;
    });
  }
  function showBackup() {
    modal('备份与迁移', `<p>备份包含作品、回收站、设定和地图。导入前可预览内容，并选择追加或整库恢复。</p>
      <div class="sw15-actions"><button class="button primary" id="sw17-export">导出 JSON</button>
      <button class="button outline" id="sw17-import">导入备份</button></div>`, root => {
      root.querySelector('#sw17-export').onclick = StoryWeaveEditor.quickBackup;
      root.querySelector('#sw17-import').onclick = () => document.getElementById('projectImport').click();
    });
  }
  openSettings = function () {
    modal('设置', `<div class="sw17-setting-index">${settingPages.map(([key,label,detail]) =>
        `<button data-sw17-settings="${key}"><span><strong>${label}</strong><small>${detail}</small></span><span aria-hidden="true">›</span></button>`).join('')}</div>`, root => {
      root.classList.add('sw17-settings-modal');
      for (const button of root.querySelectorAll('[data-sw17-settings]')) button.onclick = () => {
        const name = button.dataset.sw17Settings;
        if (name === 'appearance') act('v14-display');
        else if (name === 'models') oldModelSettings();
        else if (name === 'backup') showBackup();
        else showGroup(name);
      };
    });
  };
  function updateEditor(event) {
    const editor = document.getElementById('chapterText');
    if (!editor) return;
    const text = editor.value;
    if (!event || preferences.counting !== 'normal') {
      const countedText = preferences.counting === 'noPunctuation' ? text.replace(/\p{P}/gu,'') :
        preferences.counting === 'latin' ? text.replace(/\p{Script=Latin}+/gu,'x') : text;
      const label = document.getElementById('charCount');
      const value = count(countedText) + ' 字';
      if (label.textContent !== value) label.textContent = value;
    }
    const quick = document.querySelector('[data-action="v17-quick-ai"]');
    if (quick && preferences.aiShortcut) {
      const value = /\S/u.test(text) ? 'AI 续写' : 'AI 开头';
      if (quick.textContent !== value) quick.textContent = value;
    }
  }
  const pairs = new Map(Object.entries({'“':'”','‘':'’','《':'》','（':'）','「':'」','【':'】','(':')','[':']'}));
  const oldWire = wireWriter;
  wireWriter = function () {
    oldWire();
    const editor = document.getElementById('chapterText');
    if (!editor) return;
    apply();
    let composing = false;
    editor.addEventListener('compositionstart',() => {composing = true;});
    editor.addEventListener('compositionend',() => {composing = false;});
    editor.addEventListener('beforeinput',event => {
      if (composing || event.isComposing || !event.cancelable || writingTextCommands.has(editor)) return;
      const {selectionStart:start,selectionEnd:end,value} = editor;
      const right = pairs.get(event.data);
      if (preferences.pairs && event.inputType === 'insertText' && right && (start !== end || end === value.length || value[end] === '\n')) {
        event.preventDefault();
        const selected = value.slice(start,end);
        replaceWritingText(editor,start,end,event.data + selected + right,start + event.data.length + selected.length);
      } else if (preferences.pairDelete && event.inputType === 'deleteContentBackward' && start === end && start > 0 &&
          pairs.has(value[start-1]) && pairs.get(value[start-1]) === value[start]) {
        event.preventDefault();
        replaceWritingText(editor,start-1,start+1,'');
      } else if (preferences.indent && ['insertLineBreak','insertParagraph'].includes(event.inputType)) {
        event.preventDefault();
        replaceWritingText(editor,start,end,'\n　　');
      }
    });
    editor.addEventListener('paste',event => {
      if (composing || preferences.paste !== 'compact') return;
      const source = event.clipboardData?.getData('text/plain');
      const compact = source?.replace(/(?:\r?\n[ \t　]*){3,}/g,'\n\n');
      if (!source || compact === source) return;
      event.preventDefault();
      editor.dispatchEvent(new Event('beforeinput',{bubbles:true}));
      replaceWritingText(editor,editor.selectionStart,editor.selectionEnd,compact);
    });
    editor.addEventListener('input',updateEditor);
  };
  const priorAct = act;
  act = function (action,key) {
    if (action === 'ai-source-settings') return oldModelSettings();
    if (action === 'v17-quick-ai' && preferences.aiShortcut && chapter()) {
      return openAiAssist(chapter().text.trim() ? 'continue' : 'opening');
    }
    if (action === 'new-chapter') {
      const result = priorAct(action,key);
      const focusChapter = () => {
        if (tab !== 'write' || preferences.newChapterCursor === 'manual') return;
        if (preferences.newChapterCursor === 'title' && document.body.classList.contains('focus-mode')) {
          StoryWeaveWorkshop.setFocusHeading(true);
        }
        document.getElementById(preferences.newChapterCursor === 'title' ? 'chapterTitle' : 'chapterText')
          ?.focus({preventScroll:true});
      };
      return result.then(opened => {
        if (opened) focusChapter();
        return opened;
      });
    }
    return priorAct(action,key);
  };
  const priorGo = go;
  go = function (view) {
    if (view === 'write' && tab !== 'write' && project() && preferences.entryMode === 'focus') {
      document.body.classList.add('focus-mode');
    }
    return priorGo(view);
  };
  window.StoryWeavePreferences = {fieldGroup,save,apply};
  apply();
})();
