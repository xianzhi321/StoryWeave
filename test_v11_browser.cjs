const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {createServer} = require('node:http');
const {pathToFileURL} = require('node:url');
const {deflateRawSync} = require('node:zlib');

function epubFixture() {
  const entries = {
    'META-INF/container.xml':'<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>',
    'OEBPS/book.opf':`<package xmlns="http://www.idpf.org/2007/opf"><manifest>
      <item id="one" href="Text/ch%201.xhtml" media-type="application/xhtml+xml"/>
      <item id="two" href="Text/ch2.xhtml" media-type="application/xhtml+xml"/>
      <item id="nav" href="Text/nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
      </manifest><spine><itemref idref="nav"/><itemref idref="one"/><itemref idref="two"/></spine></package>`,
    'OEBPS/Text/ch2.xhtml':'<html><body><h1>第二章 回声</h1><p>远处的钟声响起，城门缓缓关闭。</p></body></html>',
    'OEBPS/Text/nav.xhtml':'<html><body><h1>目录占位文字</h1></body></html>',
    'OEBPS/Text/ch 1.xhtml':'<html><body><h1>第一卷 · 河岸</h1><h2>第一章 归途</h2><p>她穿过旧桥，在岸边找到一盏还亮着的灯。</p></body></html>',
  };
  const local = [], central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const filename = Buffer.from(name), body = Buffer.from(text), compressed = deflateRawSync(body);
    let crc = -1;
    for (const byte of body) {
      crc ^= byte;
      for (let bit=0;bit<8;bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
    const record = Buffer.alloc(30);
    record.writeUInt32LE(0x04034b50);record.writeUInt16LE(20,4);record.writeUInt16LE(8,8);
    record.writeUInt32LE((~crc)>>>0,14);record.writeUInt32LE(compressed.length,18);
    record.writeUInt32LE(body.length,22);record.writeUInt16LE(filename.length,26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);directory.writeUInt16LE(20,4);
    record.copy(directory,6,4,30);directory.writeUInt32LE(offset,42);
    local.push(record,filename,compressed);central.push(directory,filename);
    offset += record.length+filename.length+compressed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);end.writeUInt16LE(local.length/3,8);end.writeUInt16LE(local.length/3,10);
  end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,directory,end]).toString('base64');
}

const browser = process.env.STORYWEAVE_BROWSER || (process.platform === 'win32'
  ? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
    .find(file => fs.existsSync(file)) : '/usr/bin/chromium');
if (!browser) throw Error('Set STORYWEAVE_BROWSER to a Chromium executable.');
const web = path.join(__dirname, 'web');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'storyweave-v11-ui-'));
const read = name => fs.readFileSync(path.join(web, name), 'utf8');
const html = read('index.html')
  .replace('</head>', () => `<script>
    const uiErrors = [];
    window.addEventListener('error', event => uiErrors.push(event.message));
    const storageTestMode = ${JSON.stringify(process.env.STORYWEAVE_STORAGE_TEST || '')};
    if (storageTestMode === 'read-failure') {
      Object.defineProperty(window, 'indexedDB', {value:{
        open() {
          const request = {result:{transaction() {throw Error('测试 IndexedDB 读取故障');}}};
          queueMicrotask(() => request.onsuccess());
          return request;
        }
      }});
    } else if (storageTestMode !== 'indexeddb') {
      Object.defineProperty(window, 'indexedDB', {value: undefined});
    } else {
      // The offline-worker inventory is covered separately. Keep this fixture focused on storage.
      Object.defineProperty(navigator, 'serviceWorker', {value:{register:async()=>{}}});
    }
    const testStorage = new Map();
    if (storageTestMode === 'corrupt-fallback') testStorage.set('storyweave_fallback','{broken');
    let storageFailure = false;
    const testEpub = '${epubFixture()}';
    Object.defineProperty(window, 'localStorage', {value: {
      getItem: key => testStorage.get(key) || null,
      setItem: (key, value) => { if (storageFailure) throw Error('测试写入故障'); testStorage.set(key, value); },
      removeItem: key => testStorage.delete(key)
    }});
    window.confirm = () => true;
  </script></head>`);

async function interactions() {
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  const wait = async (predicate, message) => {
    for (let attempt = 0; attempt < 80; attempt++) {
      if (predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw Error(message);
  };
  const query = selector => document.querySelector(selector);
  const click = selector => {
    const element = query(selector);
    assert(element && !element.disabled, 'Missing or disabled: ' + selector);
    element.click();
  };
  const input = (selector, value) => {
    const element = query(selector);
    assert(element, 'Missing field: ' + selector);
    element.value = value;
    element.dispatchEvent(new Event('change', {bubbles:true}));
  };
  const search = (selector, value) => {
    const field = query(selector);
    assert(field, 'Missing search: ' + selector);
    field.value = value;
    field.dispatchEvent(new Event('input', {bubbles:true}));
  };
  const selectFile = (selector,file) => {
    const files = new DataTransfer(), field = query(selector);
    files.items.add(file);
    field.files = files.files;
    field.dispatchEvent(new Event('change',{bubbles:true}));
  };
  if (storageTestMode === 'read-failure' || storageTestMode === 'corrupt-fallback') {
    await wait(() => query('#sw-workspace-retry'),'Unreadable data did not reach recovery');
    window.dispatchEvent(new Event('pagehide'));
    assert(state===null && !pendingSave && !query('.book-card'),'Unreadable data was replaced with editable demo data');
    assert(localStorage.getItem('storyweave_fallback')===(storageTestMode==='corrupt-fallback'?'{broken':null),
      'Unreadable workspace was overwritten');
    return;
  }
  await wait(() => typeof state !== 'undefined' && state?.projects?.length, 'App did not load');
  if (storageTestMode === 'indexeddb') {
    assert(db,'The test did not open real IndexedDB');
    const workId=project().id;
    const failed=StoryWeaveWorkspace.transact(()=>{throw Error('故障注入');}).catch(error=>error.message);
    await StoryWeaveWorkspace.transact(next=>{
      next.projects=next.projects.map(work=>work.id===workId?{...work,title:'IndexedDB 核对'}:work);
    });
    assert(await failed==='故障注入','The write queue lost the first failure');
    const persisted=await kvRead('state');
    assert(persisted.projects.find(work=>work.id===workId).title==='IndexedDB 核对' &&
      project().title==='IndexedDB 核对','Queued transaction did not commit to real IndexedDB');
    return;
  }
  document.body.style.maxWidth='390px';
  assert(query('#bottomNav').hidden && query('.books') && !query('.stat-grid') && !query('.hero') && !query('.studio-lab'),'Bookshelf still shows unrelated navigation or panels');
  click('[data-action=shelf-add]');
  assert(query('[data-shelf-command=import-manuscript]')?.getBoundingClientRect().height>0,'Bookshelf lost its manuscript import entry');click('#modalClose');
  if (window.captureShelf) return;
  click('[data-action=shelf-menu]');click('[data-shelf-command=settings]');click('[data-sw17-settings="appearance"]');
  const appearanceModal = query('#modalRoot .modal');
  appearanceModal.style.maxHeight='420px';
  assert(appearanceModal.scrollHeight>appearanceModal.clientHeight &&
    query('#sw14-display-save').getBoundingClientRect().bottom<=appearanceModal.getBoundingClientRect().bottom,
    'Applying paper required scrolling through a small phone viewport');
  input('#sw16-paper','ink');input('#sw20-background','mist');
  assert(query('#sw20-preview').dataset.sw16Paper==='ink' &&
    getComputedStyle(query('#sw20-preview')).backgroundImage.includes('assets/paper-mist.svg') &&
    document.body.dataset.sw16Paper==='paper','Unsaved appearance preview was missing or changed the whole app');
  click('#modalClose');
  click('[data-action=shelf-menu]');click('[data-shelf-command=settings]');click('[data-sw17-settings="appearance"]');
  assert(query('#sw16-paper').value==='paper','Closing appearance saved the draft without applying');
  input('#sw16-paper','ink');input('#sw20-background','mist');click('#sw14-display-save');
  assert(document.body.dataset.sw16Paper==='ink' && document.body.dataset.sw20Background==='mist' &&
    JSON.parse(localStorage.getItem('storyweave_writer_display')).paper==='ink','Applying paper from bookshelf did not save or update the theme');
  const defaultSettings={...state.settings};
  const fakeKey='test-fixture-cloud-key', cloudRequests=[];
  const browserFetch=window.fetch;
  let modelStatus=200;
  window.fetch=async (url,options)=>{
    cloudRequests.push({url,options});
    if(url.endsWith('/models'))return new Response(JSON.stringify({data:[{id:'writer-b'},{id:'writer-a'},{id:'writer-a'},{}]}),{status:modelStatus});
    return new Response(JSON.stringify({choices:[{message:{content:'叙境就绪'}}]}),{status:200});
  };
  function openModels(){
    click('[data-action=shelf-menu]');click('[data-shelf-command=settings]');click('[data-sw17-settings="models"]');
  }
  openModels();
  search('#swCloudEndpoint','https://fiction.test/api/v1/chat/completions/');
  search('#swCloudKey','one two');
  click('#swCloudList');
  assert(!cloudRequests.length && query('#swCloudStatus').textContent.includes('内部空白'),'Invalid inner whitespace was sent to a service');
  search('#swCloudKey','Bearer “\u200b'+fakeKey+'”');
  search('#swCloudEndpoint','https://fiction.test/api/v1/models/');
  modelStatus=401;click('#swCloudList');
  await wait(()=>query('#swCloudStatus')?.textContent.includes('HTTP 401'),'Cloud listing did not report authentication failure');
  modelStatus=200;click('#swCloudList');
  await wait(()=>!query('#swCloudChoices')?.hidden,'Cloud model listing failed');
  assert(cloudRequests.at(-1).url==='https://fiction.test/api/v1/models' && cloudRequests.at(-1).options.method==='GET' &&
    cloudRequests.at(-1).options.headers.Authorization==='Bearer '+fakeKey && !cloudRequests.at(-1).options.body &&
    cloudRequests.at(-1).options.redirect==='error','Model listing used an incorrect endpoint, sent content, or followed redirects');
  assert(query('#swCloudSelect').options.length===3,'Model list did not deduplicate IDs');
  search('#swCloudSearch','writer-b');input('#swCloudSelect','writer-b');
  assert(query('#swCloudModel').value==='writer-b'&&query('#swCloudSelect').options.length===2,'Model filtering or selection failed');
  click('#swCloudTest');
  await wait(()=>query('#swCloudStatus')?.textContent.includes('生成测试通过'),'Cloud generation probe failed');
  const testBody=JSON.parse(cloudRequests.at(-1).options.body);
  assert(testBody.model==='writer-b' && testBody.messages.length===1 && testBody.messages[0].content.includes('叙境就绪'),
    'Cloud probe did not use the chosen model and fixed test prompt');
  click('#saveSettings');
  await wait(()=>!query('#saveSettings'),'Cloud model settings did not save');
  sessionStorage.clear();
  assert(await chatAPI('测试系统','测试正文',88)==='叙境就绪' &&
    cloudRequests.at(-1).options.headers.Authorization==='Bearer '+fakeKey,'Cloud writing could not load the remembered key');
  assert(!localStorage.getItem('storyweave_fallback').includes(fakeKey) && !JSON.stringify(state).includes(fakeKey),
    'Cloud key was written into book state or backup');
  openModels();
  assert(!query('#swCloudKey').value && query('#swCloudKeyStatus').textContent.includes('已保存密钥'),'Cloud key did not survive reopening securely');
  search('#swCloudEndpoint','https://another.test/v1/models');modelStatus=404;
  click('#swCloudList');
  await wait(()=>query('#swCloudStatus')?.textContent.includes('手填模型 ID'),'An unsupported catalog blocked manual model configuration');
  assert(!cloudRequests.at(-1).options.headers.Authorization,'Changing providers sent a previous provider credential');
  search('#swCloudEndpoint','http://localhost.example.test/v1');click('#swCloudList');
  assert(query('#swCloudStatus').textContent.includes('HTTPS') && cloudRequests.at(-1).url==='https://another.test/v1/models',
    'An insecure remote endpoint was contacted');
  search('#swCloudEndpoint','https://fiction.test/api/v1');click('#swCloudClear');
  assert(!localStorage.getItem('storyweave.cloud.key:https://fiction.test/api/v1'),'Clear key left persistent credentials');
  click('#modalClose');
  window.fetch=browserFetch;
  const nativeKeys=new Map(), nativeCalls=[];
  let truncateAnalysis=false;
  window.StoryBridge={
    cloudKeyState:base=>nativeKeys.has(base)?'saved':'missing',
    saveCloudKey:(base,secret,remember)=>{if(secret && remember)nativeKeys.set(base,secret);return true;},
    cloudAiRequest:(request,base,route,payload,draft)=>{
      nativeCalls.push({base,route,draft,payload});
      const body=payload ? JSON.parse(payload) : {};
      setTimeout(()=>window.__storyCloudReceive(request,200,JSON.stringify(route==='models'
        ? {data:[{id:'deepseek-flash',name:'DeepSeek Flash'},{id:'deepseek-v4-pro',name:'DeepSeek V4 Pro'}]}
        : body.response_format?.type==='json_object'
          ? {choices:[truncateAnalysis ? {finish_reason:'length',message:{content:'{"techniques":[',reasoning_content:'模拟推理'}}
            : {message:{content:'{"techniques":[]}'}}]}
          : {choices:[{message:{content:'原生测试成功'}}]})),0);
    }
  };
  openModels();
  click('#swCloudDeepSeek');
  const deepSeekBase='https://api.deepseek.com';
  assert(query('#swCloudEndpoint').value===deepSeekBase,'DeepSeek preset did not use the official address');
  input('#swCloudModel','DeepSeek');
  const pasteKey = value=>{
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain',value);
    query('#swCloudKey').dispatchEvent(new ClipboardEvent('paste',{clipboardData,bubbles:true,cancelable:true}));
  };
  pasteKey('sk-••••••');
  click('#swCloudList');
  assert(!nativeCalls.length && query('#swCloudStatus').textContent.includes('完整 API Key'),'A masked key reached the network');
  pasteKey('Authorization: Bearer\r\n\u00a0“'+fakeKey.slice(0,8)+'\u200b'+fakeKey.slice(8)+'”\ufeff');
  assert(query('#swCloudKey').value===fakeKey,'Clipboard prefix, line wrapping or invisible characters were not cleaned');
  click('#swCloudTest');
  await wait(()=>query('#swCloudStatus').textContent.includes('服务商名称'),'Missing hint for a provider label in the model field');
  assert(!nativeCalls.length,'Provider label was sent as a model ID');
  click('#swCloudList');
  await wait(()=>!query('#swCloudChoices')?.hidden,'Android bridge model listing failed');
  assert(query('#swCloudModel').value==='deepseek-flash' &&
    query('#swCloudSelect').selectedOptions[0].text.includes('DeepSeek Flash · deepseek-flash'),
    'DeepSeek displayed a model name without the correct selectable ID');
  search('#swCloudKey','“Bearer '+fakeKey+'\u2060”');
  click('#saveSettings');
  await wait(()=>!query('#saveSettings'),'Android vault save did not finish');
  openModels();
  assert(query('#swCloudKeyStatus').textContent.includes('已保存密钥') && !query('#swCloudKey').value,
    'Android saved-key status exposed the secret or failed to reload');
  click('#swCloudTest');
  await wait(()=>query('#swCloudStatus')?.textContent.includes('生成测试通过'),'Android bridge test failed');
  assert(nativeKeys.get(deepSeekBase)===fakeKey && nativeCalls[0].draft===fakeKey && nativeCalls[0].base===deepSeekBase &&
    nativeCalls.at(-1).draft==='' && nativeCalls.at(-1).route==='chat' &&
    JSON.parse(nativeCalls.at(-1).payload).thinking.type==='disabled' &&
    !localStorage.getItem('storyweave.cloud.key:'+deepSeekBase),'Android request did not leave saved credentials in the native vault');
  assert(await chatAPI('仅返回 JSON','取样',1450,'distillation')==='{"techniques":[]}','DeepSeek distillation did not request JSON output');
  const structured=JSON.parse(nativeCalls.at(-1).payload);
  assert(structured.thinking.type==='disabled' && structured.response_format.type==='json_object' &&
    structured.max_tokens===1450,'DeepSeek distillation did not reserve the output budget for evidence');
  truncateAnalysis=true;
  let distillError='';
  try {await chatAPI('仅返回 JSON','取样',1450,'distillation');} catch(error) {distillError=error.message;}
  assert(distillError.includes('未返回完整分析') && distillError.includes('重试本段'),'Truncated analysis was passed to evidence verification');
  await chatAPI('小说写作','写下一句',120);
  const ordinary=JSON.parse(nativeCalls.at(-1).payload);
  assert(!ordinary.thinking && !ordinary.response_format,'Distillation policy affected ordinary cloud writing');
  click('#modalClose');
  delete window.StoryBridge;
  state.settings=defaultSettings;
  click('[data-action=shelf-menu]');click('[data-shelf-command=skills]');
  assert(document.body.dataset.sw16View==='skills' && query('#bottomNav').hidden,'Writing skills were lost or mixed with book navigation');
  click('#sw16-back');
  click('.book-card');
  assert(document.body.dataset.sw16View==='contents' && !query('#modalRoot .modal'),'Book did not open directly into a full-page directory');
  assert([...document.querySelectorAll('#bottomNav .nav-item')].map(item=>item.dataset.tab).join(',')==='contents,characters,world',
    'Book workspace does not have exactly the three required tabs');
  assert(!query('#sw14-chapters article') && !query('#chapterText'),'Directory showed prose cards or the editor');
  if (window.captureContents) return;
  assert(getComputedStyle(query('#screen')).animationName==='none','Changing book views still animates the whole screen');
  click('.sw16-directory-tools summary');click('#sw16-show-previews');
  assert(query('.sw16-chapter-preview'),'Optional chapter previews were removed');
  const notices = [];
  const displayToast = toast;
  toast = message => { notices.push(message); displayToast(message); };
  const [one, two] = chapters(), [a, b] = characters();
  const relation = relations()[0], baseline = relation.type;
  const initialText = one.text;
  const initialGoal = a.goal;

  click('[data-tab="characters"]');
  click('[data-action="v11-growth"]');
  input('#v11GrowthChapter', two.id);
  click('#v11EditGrowth');
  input('#v11-goal', '找到车票的失主');
  input('#v11-cause', '从车票背面看到了陌生的名字');
  click('#v11SaveGrowth');
  await wait(() => query('#v11GrowthContent')?.textContent.includes('找到车票的失主'), 'Growth did not save');
  input('#v11GrowthChapter', one.id);
  assert(query('#v11GrowthContent').textContent.includes(initialGoal), 'Earlier growth state changed');
  assert(StoryWeaveCanon.roleBoundContext(a.id, one.id).character.goal === initialGoal, 'Earlier role context changed');
  assert(StoryWeaveCanon.roleBoundContext(a.id, two.id).character.goal === '找到车票的失主', 'Growth missing in role context');
  click('#modalClose');

  click('[data-tab="contents"]');
  click('.sw19-directory-search summary');
  search('#sw19-directory-query', '第２章 无人知晓');
  assert(document.querySelectorAll('[data-sw14-chapter]').length===1 &&
    query('[data-sw14-chapter]').dataset.sw14Chapter===two.id,'Directory lookup failed to match chapter title and normalized chapter number');
  input('#sw14-filter','final');
  assert(!query('[data-sw14-chapter]'),'Directory lookup ignored manuscript status');
  input('#sw14-filter','');
  click('[data-sw14-chapter="'+two.id+'"]');
  click('#sw16-back');
  assert(query('.sw19-directory-search').open && query('#sw19-directory-query').value==='第２章 无人知晓','Directory forgot the search when returning from the editor');
  click('#sw19-clear-query');
  assert(document.querySelectorAll('[data-sw14-chapter]').length===chapters().length,'Clearing the directory search did not restore chapter rows');
  click('[data-sw14-chapter="'+two.id+'"]');
  openTool('sw19-jump');
  assert(query('[data-sw19-jump][aria-current="true"]').dataset.sw19Jump===two.id,'Editor jump did not mark the active chapter');
  search('#sw19-jump-query','来信');
  assert(document.querySelectorAll('[data-sw19-jump]').length===1,'Editor jump did not narrow down matches');
  click('[data-sw19-jump="'+one.id+'"]');
  assert(chapter().id===one.id && !query('#modalClose'),'Editor jump did not open the selected chapter');
  assert(getComputedStyle(query('#chapterText')).backgroundColor==='rgb(34, 43, 41)' &&
    getComputedStyle(query('#chapterText')).backgroundImage.includes('assets/paper-mist.svg'),'Bookshelf paper preference did not carry into the editor');
  openTool('v14-display');input('#sw16-paper','paper');input('#sw20-background','plain');click('#sw14-display-save');
  assert(query('#bottomNav').hidden && query('#sw16-back').textContent.includes('目录'),'Editor did not have a dedicated return to the directory');
  click('[data-action="v11-scenes"]');
  click('#v11NewScene');
  input('#v11-title', '夜雨书店');
  input('#v11-location', '旧书店');
  input('#v11-storyTime', '午夜');
  click('#v11AddCast');
  click('#v11AddCast');
  click('[data-cast="1"][data-op="-1"]');
  storageFailure = true;
  click('#saveSceneCard');
  await wait(() => !query('#saveSceneCard')?.disabled && notices.some(message => message.includes('测试写入故障')), 'Write failure not shown');
  assert(!state.sceneCards.length, 'Failed scene save changed state');
  storageFailure = false;
  click('#saveSceneCard');
  await wait(() => query('#v11NewScene'), 'Scene did not save');
  assert(state.sceneCards[0].participants.join() === [b.id, a.id].join(), 'Cast order was lost');
  click('#v11NewScene');
  input('#v11-title', '街口跟踪');
  click('#saveSceneCard');
  await wait(() => state.sceneCards.length === 2 && query('[data-scene-move="1"]'), 'Second scene did not save');
  click('[data-scene-move="1"][data-step="-1"]');
  await wait(() => state.sceneCards[0].title === '街口跟踪', 'Scene ordering failed');
  click('#modalClose');

  const quote = initialText.slice(0, 24);
  let requests = 0;
  chatAPI = async (_instruction, raw) => {
    requests++;
    const payload = JSON.parse(raw);
    assert(payload.text.includes(quote), 'Missing consented source text');
    assert(!Object.hasOwn(payload.cast[0], 'secret') && payload.relations.every(row => row.id !== relations().find(r => r.private)?.id),
      'Private data was sent');
    return JSON.stringify({items: [
      {kind:'event', title:'夜里收到信件', detail:'旧书店外拆开信件', quote:initialText.slice(30,54), participants:[a.id]},
      {kind:'action', title:'林澈拆信', detail:'林澈在书店门口拆开信件', quote, roleId:a.id},
      {kind:'relationship', title:'两人结盟', detail:'两人决定一起查证', quote, relationId:relation.id, afterType:'结盟'},
      {kind:'event', title:'无效事件', detail:'没有原文证据', quote:'这里没有这段内容，不能归档。'},
    ]});
  };
  click('[data-action="v11-extract"]');
  assert(query('#v11RunExtract').disabled && requests === 0, 'Model requested without consent');
  click('#v11ExtractConsent');
  click('#v11RunExtract');
  await wait(() => query('#v11ExtractStatus')?.textContent.includes('已保存 3 条'), 'Candidates did not save');
  assert(!state.timelineEvents?.length && relations()[0].type === baseline, 'AI wrote canon without approval');
  click('#v11ExtractConsent');
  click('#v11RunExtract');
  await wait(() => query('#v11ExtractStatus')?.textContent.includes('没有新的'), 'Retry did not deduplicate');
  click('#v11ReviewExtract');
  click('#sw32-select-mode');click('#sw32-select-current');
  assert(query('#sw32-selected').textContent.includes('已选 3 条'),'Batch review did not select the current pending results');
  storageFailure=true;click('#sw32-approve');
  await wait(()=>query('#sw32-status')?.textContent.includes('测试写入故障'),'Batch review did not report the write failure');
  assert(!state.timelineEvents?.length && !state.relationshipHistory?.length &&
    state.archiveRecords.every(row=>row.status==='pending'),'Failed batch approval left partially adopted records');
  storageFailure=false;
  chapters()[0].text=initialText.slice(0,30)+'此处证据已改写。'+initialText.slice(54);
  click('#sw32-approve');
  await wait(()=>query('#sw32-status')?.textContent.includes('原文证据已变化'),'Batch approval did not revalidate its evidence');
  assert(query('#sw32-selected').textContent.includes('1 条原文已变化') && query('#sw32-approve').disabled &&
    !query('#sw32-dismiss').disabled && !state.relationshipHistory?.length &&
    state.archiveRecords.every(row=>row.status==='pending'),'Stale record caused partial approval or remained eligible');
  chapters()[0].text=initialText;
  input('#v11ArchiveStatus','approved');input('#v11ArchiveStatus','pending');
  assert(query('#sw32-selected').textContent.includes('已选 0 条'),'Changing the filter kept the old selection');
  click('#sw32-select-current');click('#sw32-approve');
  await wait(()=>query('#sw32-status')?.textContent.includes('已采纳 3 条'),'Batch approval failed');
  assert(state.timelineEvents.length === 1 && state.relationshipHistory.length === 1, 'Approved records did not reach timeline/history');
  assert(chapters()[0].text === initialText, 'Formal text was changed');
  const snapshot = normalizeBackup(JSON.parse(testStorage.get('storyweave_fallback')));
  assert(snapshot.archiveRecords.length === 3 && snapshot.characterGrowth.length === 1, 'Backup lost new records');
  assert(snapshot.sceneCards[0].title === '街口跟踪', 'Backup lost scene order');
  input('#v11ArchiveStatus','approved');
  const approvedEvidence=state.archiveRecords.find(row=>row.kind==='event');
  click('[data-archive-jump="'+approvedEvidence.id+'"]');
  const evidenceEditor=query('#chapterText');
  assert(evidenceEditor.value.slice(evidenceEditor.selectionStart,evidenceEditor.selectionEnd)===approvedEvidence.quote,
    'Archive evidence did not select its quote in the editor');
  await StoryWeaveDistillation.persist(next=>{
    next.archiveRecords=[...next.archiveRecords,
      {...approvedEvidence,id:'discard-1',title:'待忽略记录',status:'pending',targetId:''},
      {...approvedEvidence,id:'discard-2',title:'过时的候选',status:'pending',targetId:'',offset:initialText.length}];
  });
  openTool('v11-archive');
  assert(query('#v11ArchiveChapter').value===chapter().id,'Editor review did not default to the current chapter');
  click('#sw32-select-mode');click('#sw32-select-current');click('#sw32-dismiss');
  await wait(()=>query('#sw32-status')?.textContent.includes('已忽略 2 条'),'Batch dismissal did not update the selected records');
  assert(state.timelineEvents.length===1 && state.archiveRecords.filter(row=>row.status==='dismissed').length===2,
    'Batch dismissal changed the formal timeline');
  click('#modalClose');

  click('[data-action="v11-scenes"]');
  click('[data-scene-edit]');
  const eventBox = query('[name="event"]');
  assert(eventBox?.value === state.timelineEvents[0].id, 'Approved event cannot be linked to scene');
  eventBox.checked = true;
  click('#saveSceneCard');
  await wait(() => state.sceneCards[0].eventIds.length === 1 && query('#v11NewScene'), 'Scene event link not persisted');
  click('#modalClose');

  click('[data-tab="characters"]');
  click('[data-action="v11-graph"]');
  assert(query('#v11Graph').textContent.includes('结盟'), 'Chapter graph did not reflect relationship history');
  click('#modalClose');
  click('[data-tab="world"]');
  click('[data-action="v11-scan"]');
  assert(query('#modalRoot').textContent.includes('全书设定冲突扫描'), 'Whole-book scan did not open');
  click('#modalClose');
  click('[data-action="v10-timeline"]');
  click('[data-v10-delete-event]');
  await wait(() => !state.timelineEvents.length, 'Event was not deleted');
  assert(!state.sceneCards[0].eventIds.length, 'Deleting an event did not clear its scene link');
  click('#modalClose');
  state.settings.aiProvider = 'iridis';
  state.settings.localContextChars = 2000;
  characters()[0].personality = '谨慎'.repeat(150);
  const unsent = '这句话只在未发送的章节末尾出现。';
  chapters()[0].text = initialText.repeat(100) + unsent;
  let auditCalls = 0;
  chatAPI = async (_instruction, raw) => {
    auditCalls++;
    assert(raw.length <= 2000, 'Local audit payload exceeded actual limit');
    const payload = JSON.parse(raw);
    const ch = payload.chapters[0];
    assert(!ch.text.includes(unsent), 'Fixture did not truncate chapter');
    return JSON.stringify({findings:[
      {chapterId:ch.id,quote:ch.text.slice(0,24),severity:'warning',title:'检查信息来源',detail:'请核对人物是否已经通过合理途径获得了相关信息。'},
      {chapterId:ch.id,quote:unsent,severity:'warning',title:'未发送证据',detail:'虽然全章含有这句话，但本次请求并没有发送该片段。'}
    ]});
  };
  click('[data-action="v10-audit"]');
  assert(query('#v10RunAudit').disabled, 'Audit missing consent gate');
  click('#v10AuditConsent');
  click('#v10RunAudit');
  await wait(() => query('#v10OpenFindings'), 'Bounded audit did not finish');
  assert(state.auditFindings.length === 1 && auditCalls === 1, 'Unsent evidence was accepted');
  click('#v10AuditConsent');
  click('#v10RunAudit');
  await wait(() => auditCalls === 2 && query('#v10OpenFindings'), 'Audit retry did not finish');
  assert(state.auditFindings.length === 1, 'Audit retry duplicated findings');
  chapters()[0].text = '章节内容已经全部重写。';
  click('#v10OpenFindings');
  assert(query('[data-v10-finding="acknowledged"]').disabled, 'Stale finding could be acknowledged');
  click('[data-v10-finding="dismissed"]');
  await wait(() => state.auditFindings[0].status === 'dismissed', 'Stale finding could not be dismissed');
  click('#modalClose');
  chapters()[0].text = initialText;
  click('[data-action="v10-audit"]');
  chatAPI = async (_instruction, raw) => {
    const ch = JSON.parse(raw).chapters[0];
    chapters()[0].text = '请求期间正文被修改。';
    return JSON.stringify({findings:[{chapterId:ch.id,quote:ch.text.slice(0,24),severity:'warning',
      title:'过期响应',detail:'这个响应对应的是修改之前的正文，因此必须丢弃。'}]});
  };
  click('#v10AuditConsent');
  click('#v10RunAudit');
  await wait(() => query('#v10AuditOutput').textContent.includes('送审正文已变化'), 'Stale audit response not rejected');
  assert(state.auditFindings.length === 1, 'Stale response was persisted');
  const manyFindings = Array.from({length:605}, (_, index) => ({...state.auditFindings[0], id:'history-'+index}));
  assert(normalizeBackup({...state, auditFindings:manyFindings}).auditFindings.length === 605,
    'Backup silently discarded old review history');
  click('#modalClose');
  chapters()[0].text = initialText;
  click('[data-action="v10-audit"]');
  const originalProject = state.selected;
  chatAPI = async (_instruction, raw) => {
    const ch = JSON.parse(raw).chapters[0];
    state.selected = 'switched-project';
    return JSON.stringify({findings:[{chapterId:ch.id,quote:ch.text.slice(0,24),severity:'warning',
      title:'原作品响应',detail:'该响应属于切换之前的作品，应当丢弃而不是写入。'}]});
  };
  click('#v10AuditConsent');
  click('#v10RunAudit');
  await wait(() => query('#v10AuditOutput').textContent.includes('作品已切换'), 'Project switch not protected');
  state.selected = originalProject;
  assert(state.auditFindings.length === 1, 'Response written after project switch');
  click('#modalClose');
  go('world');
  click('[data-action="v12-atlas"]');
  input('[name="title"]','测试大陆');
  const canvas = document.createElement('canvas');
  canvas.width = 400; canvas.height = 200;
  const context = canvas.getContext('2d');
  context.fillStyle = '#d8caa4'; context.fillRect(0,0,400,200);
  const blob = await new Promise(resolve => canvas.toBlob(resolve,'image/png'));
  const transfer = new DataTransfer();
  transfer.items.add(new File([blob],'world.png',{type:'image/png'}));
  query('#atlasImage').files = transfer.files;
  query('#atlasImage').dispatchEvent(new Event('change',{bubbles:true}));
  try {
    await wait(()=>query('#atlasImageStatus').textContent.includes('图片已载入'),'Image import failed');
  } catch (error) { throw Error(error.message + ' / ' + query('#atlasImageStatus').textContent + ' / ' + uiErrors.join('; ')); }
  click('#atlasSaveMap');
  await wait(()=>query('#atlasMapCanvas')?.classList.contains('leaflet-container'),'Leaflet map did not load');
  assert(state.worldMaps[0].width===400 && state.worldMaps[0].image.startsWith('data:image/jpeg'),'Image not stored');
  click('#atlasAddPlace');
  input('[name="name"]','白石城');
  input('[name="aliases"]','白城');
  input('[name="x"]','100');input('[name="y"]','50');
  click('#atlasSavePlace');
  await wait(()=>query('#atlasNewEvent'),'Location did not save/open');
  const city = state.worldPlaces[0];
  click('#atlasNewEvent');
  assert(query('#atlasEventPlace').value===city.id,'New map event lost selected location');
  input('[name="title"]','军队出发');
  input('[name="storyDate"]','203-03-05');
  input('[name="chapter"]',one.id);
  query('[name="participants"]').options[0].selected=true;
  click('#v10SaveEvent');
  await wait(()=>state.timelineEvents.some(event=>event.title==='军队出发'),'Map event not saved');
  click('#modalClose');
  click('[data-action="v12-atlas"]');
  assert(!query('#atlasFilters').open&&!query('#atlasManage').open&&
    query('#atlasMapCanvas').getBoundingClientRect().top<query('#atlasFilters').getBoundingClientRect().top,
    'Atlas did not prioritize the map over management and filters');
  click('[data-atlas-place]');
  click('#atlasNewEvent');
  input('[name="title"]','商人抵达');
  input('[name="storyDate"]','203-03-10');
  input('[name="chapter"]',two.id);
  click('#v10SaveEvent');
  await wait(()=>state.timelineEvents.some(event=>event.title==='商人抵达'),'Second event not saved');
  click('#modalClose');
  let trackedMap, trackAtlas=true;
  L.Map.addInitHook(function(){if(trackAtlas)trackedMap=this;});
  click('[data-action="v12-atlas"]');
  await new Promise(resolve=>setTimeout(resolve,60));
  click('[data-atlas-place]');
  click('#atlasFilters summary');
  input('#atlasDate','203-03-05');
  assert(query('#atlasDetails').textContent.includes('军队出发')&&!query('#atlasDetails').textContent.includes('商人抵达'),'Time cutoff leaked future event');
  assert(query('.atlas-event-marker').textContent==='1','Event marker count did not follow filter');
  input('#atlasChapter',two.id);
  assert(!query('.atlas-event-marker'),'Chapter filter ignored');
  assert(query('#atlasDetails').textContent.includes('0 / 2 条事件') && !query('.atlas-chapter-links'),
    'Place details did not distinguish filtered-out events and chapters');
  click('#atlasClearEventFilters');
  assert(query('#atlasDate').value==='' && query('#atlasChapter').value==='' &&
    query('.atlas-chapter-links summary')?.textContent.includes('2 章'),'Clearing filters did not recover the place history');
  click('#atlasPickPlace');click('[data-atlas-browse="events"]');
  assert(query('#atlasPlaceActions').hidden&&query('#atlasMapCanvas').style.cursor!=='crosshair',
    'Event view showed location creation tools or left pick mode active');
  const atlasEventTitles=()=>[...document.querySelectorAll('[data-atlas-locate-event] strong')].map(node=>node.textContent);
  assert(atlasEventTitles().join()===['军队出发','商人抵达'].join(),'Event browser did not follow story dates');
  input('#atlasDate','203-03-05');
  assert(atlasEventTitles().join()==='军队出发'&&query('#atlasFilterSummary').textContent.includes('1 项筛选'),
    'Event browser did not follow the shared date filter');
  input('#atlasDate','');
  search('#atlasSearch','白城');
  assert(atlasEventTitles().length===2,'Event search did not match a place alias');
  input('#atlasChapter',two.id);
  assert(atlasEventTitles().join()==='商人抵达','Event browser did not follow the chapter filter');
  input('#atlasChapter','');
  search('#atlasSearch','商人');
  assert(atlasEventTitles().join()==='商人抵达','Event search did not match the title');
  click('[data-atlas-locate-event]');
  assert(query('#atlasDetails h3').textContent==='白石城'&&query('.atlas-event-active strong').textContent==='商人抵达'&&
    query('.atlas-selected-pin'),
    'Event browser did not locate and highlight the exact event');
  input('#atlasDate','203-03-10');input('#atlasChapter',two.id);
  click('#atlasShowOnMap');
  assert(document.activeElement===query('#atlasMapCanvas'),'Place details could not return focus to the map canvas');
  const center=trackedMap.getCenter();
  trackedMap.setView([center.lat+5,center.lng-5],trackedMap.getZoom()+1,{animate:false});
  const previousMap=trackedMap, previousZoom=previousMap.getZoom(), previousCenter=previousMap.getCenter();
  click('#atlasPlaces [data-atlas-chapter="'+two.id+'"]');
  assert(tab==='write'&&chapter().id===two.id&&query('.sw14-editor-bar [data-action="v12-atlas-return"]'),
    'Event browser did not jump to its associated manuscript with a return action');
  click('.sw14-editor-bar [data-action="v12-atlas-return"]');
  await wait(()=>trackedMap!==previousMap&&trackedMap.getZoom()===previousZoom&&trackedMap.getCenter().equals(previousCenter),
    'Returning from the manuscript did not restore the map viewport').catch(error=>{
      throw Error(error.message+' ('+previousCenter+' at '+previousZoom+' → '+trackedMap.getCenter()+' at '+trackedMap.getZoom()+')');
    });
  trackAtlas=false;
  assert(query('#atlasFilters').open&&query('#atlasDate').value==='203-03-10'&&query('#atlasChapter').value===two.id&&
    query('#atlasSearch').value==='商人'&&atlasEventTitles().join()==='商人抵达'&&
    query('.atlas-event-active strong').textContent==='商人抵达','Returning from the manuscript lost map filters or event selection');
  click('#modalClose');click('.sw14-focus-button');
  assert(!query('.sw14-editor-bar [data-action="v12-atlas-return"]').getClientRects().length,
    'Map return cluttered the focus toolbar');
  openTool('v12-atlas-return');
  assert(query('.atlas-event-active strong').textContent==='商人抵达','Map return was unavailable in focus tools');
  click('#modalClose');click('.sw14-focus-button');
  click('.sw14-editor-bar [data-action="v12-atlas-return"]');
  click('#atlasClearEventFilters');
  click('[data-atlas-browse="places"]');click('[data-atlas-place]');
  click('[data-atlas-layer="events"]');
  assert(!query('.atlas-event-marker'),'Event layer did not hide');
  click('[data-atlas-layer="events"]');
  click('.atlas-chapter-links summary');
  click('.atlas-chapter-links [data-atlas-chapter="'+one.id+'"]');
  assert(chapter().id===one.id && query('[data-action="v12-place"]'),'Chapter navigation missing location link');
  click('[data-action="v12-place"]');
  assert(query('#atlasDetails').textContent.includes('白石城'),'Writer link did not focus map location');
  click('#modalClose');
  const previousManuscript=chapter().text, previousLocations=state.worldPlaces;
  state.worldPlaces=[...previousLocations,{...city,id:'mentioned-only',name:'隐港',aliases:['雾港'],position:null}];
  chapter().text=previousManuscript+'\n她想起了雾港。';
  render();
  openTool('v14-chapter-kb');click('.sw30-quick summary');click('#sw31-places');
  const linkedPlace=query('[data-atlas-chapter-place="'+city.id+'"]').closest('article');
  const mentionedPlace=query('[data-atlas-chapter-place="mentioned-only"]').closest('article');
  assert(linkedPlace.textContent.includes('已关联 1 条本章事件') && linkedPlace.textContent.includes('军队出发') &&
    !linkedPlace.textContent.includes('商人抵达') && mentionedPlace.textContent.includes('正文提及 · 待核对') &&
    mentionedPlace.textContent.includes('待定位'),'Chapter locations mixed text mentions and confirmed chapter events');
  const originalPan=L.Map.prototype.panTo, pans=[];
  L.Map.prototype.panTo=function(point,options){pans.push(point);return originalPan.call(this,point,options);};
  click('[data-atlas-chapter-place="'+city.id+'"]');
  assert(query('[data-atlas-place="'+city.id+'"]').getAttribute('aria-pressed')==='true' &&
    query('#atlasDetails h3').textContent==='白石城','Chapter places did not select the correct map location');
  await wait(()=>pans.some(point=>point[1]===city.position.x&&point[0]===state.worldMaps[0].height-city.position.y),
    'Direct atlas entry did not pan to the selected place after resizing');
  L.Map.prototype.panTo=originalPan;
  chapter().text=previousManuscript;
  state.worldPlaces=previousLocations;
  const restored=normalizeBackup(JSON.parse(testStorage.get('storyweave_fallback')));
  assert(restored.worldMaps[0].image===state.worldMaps[0].image,'Backup lost map image');
  assert(restored.worldPlaces[0].position.x===100 && restored.timelineEvents.some(e=>e.locationId===city.id),'Backup lost geography');
  click('#modalClose');
  const priorTrailEvents=state.timelineEvents;
  const harbor={...city,id:'trail-harbor',name:'黑河港',position:{x:city.position.x+20,y:city.position.y+10}};
  state.worldPlaces=[...previousLocations,harbor];
  state.timelineEvents=priorTrailEvents.filter(event=>['军队出发','商人抵达'].includes(event.title)).map(event=>({
    ...event,participants:[a.id],locationId:event.title==='商人抵达'?harbor.id:city.id
  }));
  act('v12-atlas');
  click('#atlasFilters summary');
  click('#atlasTrailToggle');
  assert(!query('#atlasTrailToggle').checked&&query('#atlasTrail').hidden,'Trail opened without selecting a character');
  input('#atlasRole',a.id);click('#atlasTrailToggle');
  assert(query('#atlasTrail').open && query('#atlasTrailSummary').textContent.includes('2 条记录') &&
    query('.atlas-trail-path'),'Selected character did not show a connected route');
  input('#atlasDate','203-03-05');
  assert(!query('.atlas-trail-path')&&!query('#atlasTrailList').textContent.includes('商人抵达'),'Time cutoff did not apply to character trail');
  input('#atlasDate','');input('#atlasChapter',two.id);
  assert(!query('.atlas-trail-path')&&query('#atlasTrailList').textContent.includes('商人抵达'),'Chapter filter did not update the trail');
  input('#atlasChapter','');click('[data-atlas-trail-place="'+harbor.id+'"]');
  assert(query('#atlasDetails h3').textContent===harbor.name,'Trail stop did not open its place');
  click('#atlasTrailToggle');
  assert(query('#atlasTrail').hidden&&!query('.atlas-trail-path'),'Trail toggle did not hide the list and line');
  click('#atlasTrailToggle');
  click('#atlasTrailList [data-atlas-chapter="'+two.id+'"]');
  assert(chapter().id===two.id&&tab==='write','Trail event did not return to its chapter');
  state.timelineEvents=priorTrailEvents;state.worldPlaces=previousLocations;
  act('v12-place',city.id);click('#modalClose');
  chapterId=one.id;
  chapters()[0].text='203-03-08，林澈抵达白石城，在城门发现了一封密信。';
  go('write');
  const beforeEvents=state.timelineEvents.length;
  chatAPI=async(_instruction,raw)=>{
    const data=JSON.parse(raw);
    return JSON.stringify({items:[{kind:'event',title:'城门密信',detail:'林澈在城门发现密信',quote:data.text,
      participants:[a.id],location:'白石城',storyDate:'203-03-08'}]});
  };
  click('[data-action="v11-extract"]');
  click('#v11ExtractConsent');click('#v11RunExtract');
  await wait(()=>query('#v11ExtractStatus').textContent.includes('已保存 1 条'),'Geographic extraction failed');
  assert(state.timelineEvents.length===beforeEvents,'AI inserted event before author approval');
  click('#v11ReviewExtract');click('[data-archive-decision="approve"]');
  await wait(()=>state.timelineEvents.length===beforeEvents+1,'Geographic proposal not adopted');
  const adopted=state.timelineEvents.find(event=>event.title==='城门密信');
  assert(adopted.locationId===city.id && adopted.storyDate==='203-03-08','Adopted event not matched to geography/date');
  click('#modalClose');go('world');click('[data-action="v12-atlas"]');
  if (window.captureAtlas) {
    click('[data-atlas-browse="events"]');
    if (window.captureAtlasMobile) query('.modal-backdrop').style.width='390px';
    query('#modalRoot .modal').scrollTop=0;
    return;
  }
  const timelineBeforeReview=state.timelineEvents, mapsBeforeReview=state.worldMaps, placesBeforeReview=state.worldPlaces;
  const reviewMap={...mapsBeforeReview[0],id:'review-map',title:'外海地图'};
  const reviewPlace={...city,id:'review-place',name:'外海白石城',mapId:reviewMap.id,aliases:['同名城'],position:null};
  state.worldMaps=[...mapsBeforeReview,reviewMap];
  state.worldPlaces=placesBeforeReview.map(place=>place.id===city.id?{...place,aliases:[...place.aliases,'同名城']}:place).concat(reviewPlace);
  const pendingEvent=(id,title,location)=>({...adopted,id,title,location,locationId:''});
  state.timelineEvents=[...timelineBeforeReview,pendingEvent('review-unique','唯一候选','白城'),
    pendingEvent('review-multiple','两个候选','同名城'),pendingEvent('review-none','手动整理','未知地点')];
  act('v12-atlas');
  search('#atlasSearch','白城');click('#atlasUnboundPanel summary');click('#atlasReviewBindings');
  assert(query('#atlasApplyBindings').disabled&&query('#modalRoot .modal').textContent.includes('1 条唯一匹配'),
    'Binding review auto-selected events or missed a unique alias');
  click('#atlasSelectUnique');
  const ambiguousField=query('select[data-atlas-review]');
  assert(ambiguousField.value===''&&ambiguousField.textContent.includes('外海地图')&&
    query('#atlasBindingStatus').textContent.includes('已选 1'),'Unique selection also picked an ambiguous event');
  input('select[data-atlas-review]',reviewPlace.id);
  click('#atlasSelectUnique');
  assert(ambiguousField.value===reviewPlace.id&&query('#atlasBindingStatus').textContent.includes('已选 1'),
    'Clearing unique matches removed a manual choice');
  click('#atlasSelectUnique');
  if (window.captureAtlasBindings) {
    query('.modal-backdrop').style.width='390px';
    return;
  }
  storageFailure=true;click('#atlasApplyBindings');
  await wait(()=>query('#atlasBindingStatus')?.textContent.includes('测试写入故障'),'Binding review did not show the save error');
  assert(!state.timelineEvents.find(event=>event.id==='review-unique').locationId&&ambiguousField.value===reviewPlace.id,
    'Failed save changed the event or lost its reviewed choice');
  storageFailure=false;
  const reviewedPlaces=state.worldPlaces;
  state.worldPlaces=[...reviewedPlaces,{...reviewPlace,id:'review-new-alias',aliases:['白城']}];
  click('#atlasApplyBindings');
  await wait(()=>query('#atlasBindingStatus')?.textContent.includes('匹配已变化'),'Binding review did not reject a changed candidate set');
  assert(!state.timelineEvents.find(event=>event.id==='review-multiple').locationId,'Stale batch partially saved another reviewed event');
  state.worldPlaces=reviewedPlaces;click('#atlasApplyBindings');
  await wait(()=>query('#atlasUnboundPanel')&&state.timelineEvents.find(event=>event.id==='review-multiple').locationId===reviewPlace.id,
    'Reviewed batch did not save and return to the map');
  assert(state.timelineEvents.find(event=>event.id==='review-unique').locationId===city.id&&
    !state.timelineEvents.find(event=>event.id==='review-none').locationId&&query('#atlasUnboundPanel').open&&
    query('#atlasSearch').value==='白城','Batch save linked an unreviewed event or lost map context');
  state.timelineEvents=timelineBeforeReview;state.worldMaps=mapsBeforeReview;state.worldPlaces=placesBeforeReview;
  act('v12-atlas');
  click('[data-atlas-place]');click('#atlasEditPlace');
  click('#atlasDeletePlace');
  await wait(()=>!state.worldPlaces.length,'Place deletion failed');
  assert(state.timelineEvents.length===beforeEvents+1 && state.timelineEvents.every(event=>!event.locationId),'Deleting place deleted events or left stale references');
  click('#atlasManage summary');click('#atlasNewMap');
  input('[name="title"]','地理坐标地图');
  input('[name="mode"]','earth');
  click('#atlasSaveMap');
  await wait(()=>state.worldMaps.length===2&&query('#atlasAddPlace'),'Earth map creation failed');
  click('#atlasAddPlace');
  input('[name="name"]','伦敦');
  input('[name="x"]','-0.1276');input('[name="y"]','51.5072');
  click('#atlasSavePlace');
  await wait(()=>query('#atlasNewEvent'),'Earth place creation failed');
  assert(state.worldPlaces[0].position.x===-0.1276&&state.worldPlaces[0].position.y===51.5072,'Geographic coordinates were changed into fictional pixels');
  click('#atlasManage summary');click('#atlasEditMap');click('#atlasDeleteMap');
  await wait(()=>state.worldMaps.length===1,'Map deletion failed');
  assert(!state.worldPlaces.length&&state.timelineEvents.length===beforeEvents+1,'Map cleanup damaged event history');
  query('#modalClose')?.click();
  go('write');
  // Chromium may enforce a wider outer window than its requested 390px.
  document.body.style.maxWidth = '390px';
  const textInput = query('#chapterText'), original = textInput.value;
  const fullscreenRequests = [];
  window.StoryBridge = {setWritingFullscreen:enabled=>fullscreenRequests.push(enabled)};
  textInput.setSelectionRange(1, 3);
  click('.sw14-focus-button');
  assert(document.body.classList.contains('focus-mode'), 'Focus did not activate');
  assert(fullscreenRequests.at(-1)===true,'Focus did not request Android fullscreen');
  assert(getComputedStyle(query('#topbar')).display === 'none', 'Focus exposed navigation');
  assert(query('#chapterText') === textInput && textInput.selectionStart === 1, 'Focus changed editor or selection');
  assert(query('.editor-shell').getBoundingClientRect().right <= 390, 'Focus editor overflowed the narrow layout');
  const focusBar=query('.sw14-editor-bar'), titleToggle=query('#sw21-title-toggle'), titleInput=query('#chapterTitle');
  const visibleBarButtons=()=>[...focusBar.querySelectorAll('button')].filter(button=>button.getClientRects().length);
  assert(visibleBarButtons().length===3 && focusBar.getBoundingClientRect().height<=46,'Focus toolbar did not condense into one row');
  assert(titleToggle.getAttribute('aria-expanded')==='false' && !titleInput.getClientRects().length,'Focus opened the full chapter heading');
  const viewportStyle = document.documentElement.style;
  const visibleHeight = viewportStyle.getPropertyValue('--sw15-visible-height');
  viewportStyle.setProperty('--sw15-visible-height','320px');
  assert(query('.editor-footer').getBoundingClientRect().bottom <= 321, 'Keyboard-height layout clipped the save and count footer');
  assert(query('#chapterText').getBoundingClientRect().height > 100, 'Keyboard-height layout left too little writing room');
  const collapsedHeight=textInput.getBoundingClientRect().height;
  const initialTitle=titleInput.value;
  click('#sw21-title-toggle');
  assert(titleToggle.getAttribute('aria-expanded')==='true' && document.activeElement===titleInput &&
    !query('.sw15-punctuation').getClientRects().length,'Title did not open for editing or showed body-only punctuation');
  search('#chapterTitle','一行需要截断的章节标题'.repeat(9));
  assert(titleToggle.querySelector('.sw21-chapter-name').scrollWidth>titleToggle.querySelector('.sw21-chapter-name').clientWidth &&
    focusBar.getBoundingClientRect().height<=46,'Long title pushed the focus toolbar to another row');
  titleInput.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,isComposing:true}));
  assert(titleToggle.getAttribute('aria-expanded')==='true','IME confirmation collapsed the chapter title');
  search('#chapterTitle',initialTitle);
  textInput.focus();
  assert(textInput.getBoundingClientRect().height<collapsedHeight,'Collapsing the chapter title did not reclaim editor height');
  click('#sw21-title-toggle');
  assert(titleToggle.getAttribute('aria-expanded')==='false' && document.activeElement===textInput &&
    textInput.selectionStart===1 && textInput.selectionEnd===3,'Closing the title changed the draft selection');
  click('#sw21-title-toggle');
  assert(StoryWeaveDesk.back() && titleToggle.getAttribute('aria-expanded')==='false' &&
    document.body.classList.contains('focus-mode'),'Back exited focus before closing the title');
  click('#sw21-title-toggle');
  titleInput.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  assert(titleToggle.getAttribute('aria-expanded')==='false' && document.activeElement===textInput,
    'Completing the title did not return to writing');
  textInput.focus();
  viewportStyle.setProperty('--sw15-visible-height',visibleHeight);
  textInput.setSelectionRange(1,3);
  textInput.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
  click('[data-sw15-mark="“”"]');
  assert(textInput.value===original && textInput.selectionStart===1 && textInput.selectionEnd===3,
    'Punctuation interrupted active composition');
  textInput.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));
  click('[data-sw15-mark="“”"]');
  assert(chapter().text===original.slice(0,1)+'“'+original.slice(1,3)+'”'+original.slice(3),'Punctuation did not wrap the original selection');
  assert(document.execCommand('undo') && chapter().text===original,'Inserted punctuation could not be undone through normal editing');
  if (window.captureFocus) return;
  if (window.captureTools) {
    click('[data-action="v15-tools"]');
    query('.modal-backdrop').style.width = '390px';
    return;
  }
  click('[data-action="v15-tools"]');
  assert(query('[data-sw15-tool="sw19-jump"]') && query('[data-sw15-tool="v14-display"]') &&
    query('[data-sw15-tool="ai-assist"]'),'Focus removed access to jump, display settings, or AI');
  click('#modalClose');
  document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape'}));
  assert(!document.body.classList.contains('focus-mode'), 'Escape did not exit focus');
  assert(fullscreenRequests.at(-1)===false,'Exiting focus did not restore Android system bars');
  delete window.StoryBridge;
  assert(!query('.sw15-secondary').open && !query('.sw15-tool-sheet'), 'Secondary tools are expanded by default');
  openTool('v14-display');
  input('#sw14-size','20'); input('#sw14-leading','1.75'); click('#sw14-display-save');
  assert(getComputedStyle(textInput).fontSize === '20px' && getComputedStyle(textInput).lineHeight === '35px', 'Editor preferences not applied');
  openTool('v14-plan');
  input('#sw14-objective','查清停摆的原因');
  input('#sw14-stage','final');
  click('#sw14-save-plan');
  await wait(()=>query('#sw14-live-status')?.textContent === '已定稿','Chapter finalization failed');
  const baselineId = chapter().blueprint.finalId;
  const edit = (value) => {
    const editor = query('#chapterText');
    editor.value = value;
    editor.dispatchEvent(new Event('input',{bubbles:true}));
  };
  edit(original+'新改动');
  assert(query('#sw14-live-status').textContent==='待复审','Changed text still marked final');
  click('#sw16-back');click('.sw19-directory-search summary');input('#sw14-filter','changed');
  assert(query('[data-sw14-chapter]')?.dataset.sw14Chapter===chapter().id,'Status filter did not locate revised chapter');
  search('#sw19-directory-query','停摆');
  assert(document.querySelectorAll('[data-sw14-chapter]').length===1 &&
    query('[data-sw14-chapter]').dataset.sw14Chapter===chapter().id,'Directory lookup did not index blueprint objectives');
  click('#sw19-clear-query');
  click('[data-sw14-chapter]');
  edit(original);
  assert(chapter().history.some(item=>item.id===baselineId && item.text===original),'Final baseline lost');
  query('#chapterText').setSelectionRange(5,9);
  openTool('v14-chapter-kb');click('#sw14-add-card');
  const refsFile = new DataTransfer();
  refsFile.items.add(new File(['只可从西门进入。'], '旧城考据.md', {type:'text/markdown'}));
  query('#sw14-file').files = refsFile.files;
  query('#sw14-file').dispatchEvent(new Event('change'));
  await wait(()=>query('#sw14-body').value.includes('西门'),'Knowledge text import failed');
  input('#sw14-tags','城防');
  storageFailure = true;
  click('#sw14-save-card');
  await wait(()=>!query('#sw14-save-card')?.disabled,'Failed write did not unlock form');
  assert(!project().knowledgeCards?.length,'Storage failure changed knowledge collection');
  storageFailure = false;
  click('#sw14-save-card');
  await wait(()=>query('#sw14-cards')?.textContent.includes('旧城考据'),'Knowledge card not saved');
  query('#sw14-search').value='西门 城防';
  query('#sw14-search').dispatchEvent(new Event('input'));
  click('#sw14-linked');
  assert(queryAllCards()===1,'Search and chapter filter missed imported card');
  click('[data-sw14-card]');
  assert(query('.sw30-reader').textContent.includes('只可从西门进入')&&!query('#sw14-body'),'Read-only card opened an edit form');
  click('#sw30-back');
  assert(query('#sw14-linked').checked&&query('#sw14-search').value==='西门 城防','Card reader lost the search or linked filter');
  storageFailure=true;click('[data-sw30-link]');
  await wait(()=>query('#sw14-card-count')?.textContent.includes('关联未保存'),'Failed unlink did not report the storage error');
  assert(project().knowledgeCards[0].chapterIds.includes(chapter().id),'Failed unlink modified the chapter links');
  storageFailure=false;click('[data-sw30-link]');
  await wait(()=>queryAllCards()===0,'Unlink did not update the filtered card list');
  click('#sw14-linked');click('[data-sw30-link]');
  await wait(()=>query('[data-sw30-link]')?.getAttribute('aria-pressed')==='true','Quick association could not relink the current chapter');
  const restoredWorkshop=normalizeBackup(JSON.parse(JSON.stringify(state)));
  assert(restoredWorkshop.projects.find(p=>p.id===state.selected).knowledgeCards[0].chapterIds.includes(chapter().id),
    'Backup lost knowledge chapter links');
  click('#modalClose');
  assert(query('#chapterText').selectionStart===5 && query('#chapterText').selectionEnd===9,'Knowledge review lost the manuscript selection');
  const priorCards=project().knowledgeCards;
  const reference=(id,title,aliases='')=>({id,title,aliases,category:'术语',body:'用于定位验证。',chapterIds:[]});
  project().knowledgeCards=[...priorCards,reference('kb-harbor','隐港','旧港、雾港'),
    reference('kb-literal','A+B'),reference('kb-latin-prefix','Al')];
  const lookupManuscript='😀她先说了 ALICE，再念「A+B」，最后提起雾港。';
  edit(lookupManuscript);
  const harborStart=lookupManuscript.indexOf('雾港');
  query('#chapterText').setSelectionRange(harborStart,harborStart+2);
  click('.sw14-editor-bar [data-action="v14-chapter-kb"]');click('#sw36-use-selection');
  assert(query('#sw14-search').value==='雾港'&&queryAllCards()===1&&query('[data-sw14-card="kb-harbor"]'),
    'Looking up the editor selection did not find the card by alias');
  search('#sw14-search','');click('#sw36-mentioned');
  assert(queryAllCards()===2&&query('[data-sw14-card="kb-literal"]')&&!query('[data-sw14-card="kb-latin-prefix"]')&&
    query('#sw14-cards').textContent.includes('提及「雾港」'),'Mention filter mishandled an alias, regex character, or Latin word boundary');
  if (window.captureReference) {
    query('.modal-backdrop').style.width='390px';
    return;
  }
  click('#sw14-linked');
  assert(queryAllCards()===0,'Mentioned cards bypassed the chapter-link filter');
  click('#sw14-linked');click('.sw30-quick summary');click('#sw30-people');click('#sw7DrawerClose');
  assert(query('#sw36-mentioned').checked&&queryAllCards()===2,'Closing person reference did not return to the same materials filter');
  click('[data-sw14-card="kb-harbor"]');
  query('#chapterText').setSelectionRange(0,0);
  click('#sw36-locate');
  assert(tab==='write'&&!query('#modalClose')&&query('#chapterText').selectionStart===harborStart&&
    query('#chapterText').selectionEnd===harborStart+2&&chapter().text===lookupManuscript,
    'Locating a reference did not select the original alias without editing the manuscript');
  project().knowledgeCards=priorCards;
  edit(original);query('#chapterText').setSelectionRange(5,9);
  const previousChat=chatAPI, prompts=[];
  chatAPI=async (system,prompt)=>{prompts.push({system,prompt}); return '候选建议';};
  click('.sw14-editor-bar [data-action="ai-assist"]');
  if (window.captureAI) return;
  assert(queryAllTasks()===8,'Built-in tasks missing');
  click('#sw8Ask');
  await wait(()=>query('#sw15-candidate')?.value==='候选建议','AI assist did not return');
  assert(!prompts[0].prompt.includes('只可从西门进入'),'Unselected knowledge was sent');
  input('#sw14-ai-reference','1');
  assert(query('#sw14-ai-preview').value.includes('只可从西门进入'),'Selected knowledge missing from preview');
  click('#sw8Ask');
  await wait(()=>prompts.length===2,'Selected reference request was not sent');
  assert(prompts[1].prompt.includes(JSON.stringify(query('#sw14-ai-preview').value)), 'Sent excerpt did not match preview');
  assert(query('#sw15-payload').textContent==='系统提示词\n'+prompts[1].system+'\n\n本次输入\n'+prompts[1].prompt,'Payload preview differs from outgoing text');
  assert(chapter().text===original,'AI response changed the manuscript before adoption');
  click('#modalClose');
  query('#chapterText').setSelectionRange(0,2);
  click('.sw14-editor-bar [data-action="ai-assist"]');
  assert(query('[data-sw15-task="polish"]').getAttribute('aria-pressed')==='true','Selected text did not open in polish mode');
  input('#sw15-rule','保留日期，只调整表达。');
  click('#sw15-save-rule');
  await wait(()=>!query('#sw15-save-rule').disabled&&project().writingPrompts?.polish==='保留日期，只调整表达。','Per-work prompt not saved');
  click('#modalClose');
  query('#chapterText').setSelectionRange(0,2);
  click('.sw14-editor-bar [data-action="ai-assist"]');
  assert(query('#sw15-rule').value==='保留日期，只调整表达。','Saved prompt did not survive reopening');
  const provider=state.settings.aiProvider, limit=state.settings.localContextChars;
  state.settings.aiProvider='iridis';state.settings.localContextChars=1200;
  input('#sw15-instructions','"'.repeat(1300));
  assert(query('#sw8Ask').disabled && query('#sw15-scope').textContent.includes('超出上下文'),'Oversized mandatory context was silently truncated');
  input('#sw15-instructions','');
  click('#sw8Ask');
  await wait(()=>query('#sw15-candidate')?.value==='候选建议','Selected rewrite did not return');
  assert(prompts.at(-1).prompt.length<=1200 && prompts.at(-1).prompt.includes(JSON.stringify(original.slice(0,2))),
    'Local request failed to preserve selected source');
  state.settings.aiProvider=provider;state.settings.localContextChars=limit;
  input('#sw15-candidate','审定');
  edit(original+'新的改动');
  click('#sw15-apply');
  assert(query('#sw15-result-status').textContent.includes('原稿已变化'),'Stale rewrite was not rejected');
  edit(original);
  click('#sw15-apply');
  await wait(()=>chapter().text==='审定'+original.slice(2),'Adoption did not replace only the original selection');
  assert(chapter().history.some(row=>row.text===original),'Adoption lost undo snapshot');
  const beforePartial=chapter().text, firstLine='前文。';
  const partialSource='她从北门进入旧城。屋里仍然点着一盏灯。雨还在下。';
  const partialCandidate='她从南门进入旧城。屋里仍然点着一盏灯。雨已经停了。';
  const rawManuscript=firstLine+'\r\n'+partialSource+'后文。';
  chapter().text=rawManuscript;render();
  query('#chapterText').setSelectionRange(firstLine.length+1,firstLine.length+1+partialSource.length);
  chatAPI=async()=>partialCandidate;
  click('.sw14-editor-bar [data-action="ai-assist"]');click('#sw8Ask');
  await wait(()=>query('#sw15-candidate')?.value===partialCandidate,'Partial rewrite did not return');
  click('#sw33-review summary');
  await wait(()=>query('[data-sw33-block]'),'Partial rewrite did not produce selectable changes');
  const southChange=[...document.querySelectorAll('.sw33-change')].find(row=>row.querySelector('.sw33-after').textContent.includes('南'));
  assert(southChange&&query('#sw15-apply').disabled,'Partial rewrite had no independent location change or auto-selected changes');
  southChange.querySelector('input').click();
  storageFailure=true;click('#sw15-apply');
  await wait(()=>query('#sw15-result-status')?.textContent.includes('保存失败'),'Partial rewrite ignored a save failure');
  assert(chapter().text===rawManuscript&&southChange.querySelector('input').checked,'Failed partial rewrite lost original text or selection');
  storageFailure=false;click('#sw15-apply');
  await wait(()=>chapter().text===rawManuscript.replace('北门','南门'),'Partial rewrite changed unchecked text or original line endings');
  assert(chapter().history.some(row=>row.text===rawManuscript),'Partial rewrite lost undo snapshot');
  edit(beforePartial);
  const priorSkills=state.skills, priorRecipes=state.skillPresets;
  const oversizedRule='超长规则起点'+'「'.repeat(1800)+'超长规则终点';
  const firstRule='用“动作”写出人物选择。', secondRule='保留线索与因果。';
  state.skills=[
    {id:'prompt-a',status:'ready',title:'技巧甲',rules:[oversizedRule,firstRule]},
    {id:'prompt-b',status:'ready',title:'技巧乙',rules:[secondRule]},
    {id:'prompt-pending',status:'candidate',title:'待审技能',rules:['不应进入请求']}
  ];
  state.skillPresets=[
    {id:'prompt-recipe',projectId:state.selected,name:'试用配方',skillIds:['prompt-b','prompt-a','prompt-pending']},
    {id:'prompt-unusable',projectId:null,name:'待审配方',skillIds:['prompt-pending']},
    {id:'prompt-other',projectId:'another-project',name:'其他作品配方',skillIds:['prompt-a']}
  ];
  state.settings.aiProvider='iridis';state.settings.localContextChars=1200;
  query('#chapterText').setSelectionRange(0,0);
  click('.sw14-editor-bar [data-action="ai-assist"]');
  assert(!query('#sw34-more-tasks').open&&query('#sw34-more-tasks [data-sw15-task="outline"]'),
    'The default writing panel did not collect secondary tasks');
  click('#sw34-more-tasks summary');click('[data-sw15-task="outline"]');
  assert(query('[data-sw15-task="outline"]').getAttribute('aria-pressed')==='true','Secondary writing task could not be selected');
  click('[data-sw15-task="continue"]');
  assert(!query('#sw8ActivePreset option[value="preset:prompt-other"]'),'Other work recipe leaked into the editor');
  input('#sw8ActivePreset','preset:prompt-unusable');
  assert(query('#sw8Ask').disabled&&query('#sw34-skills-summary').textContent.includes('1 项不可用'),'An unusable recipe could send a request without its skills');
  input('#sw8ActivePreset','preset:prompt-recipe');
  const preview=query('#sw15-payload').textContent;
  assert(preview.includes(firstRule)&&preview.includes(secondRule)&&!preview.includes('超长规则起点')&&
    preview.indexOf(secondRule)<preview.indexOf(firstRule)&&preview.includes('正文末尾'),
    'Skill context lost recipe order, complete rules, or the chapter tail');
  assert(query('[data-sw34-skill="prompt-a"]').closest('label').textContent.includes('1 / 2')&&
    query('#sw34-skills-summary').textContent.includes('1 项不可用'),'Skill omissions were hidden');
  click('[data-sw34-skill="prompt-b"]');
  let sentPrompt='';
  chatAPI=async(_system,user)=>{sentPrompt=user;return '配方测试候选';};
  const expectedPrompt=query('#sw15-payload').textContent.split('\n\n本次输入\n')[1];
  click('#sw8Ask');
  await wait(()=>query('#sw15-candidate')?.value==='配方测试候选','Recipe request did not return');
  assert(sentPrompt===expectedPrompt&&sentPrompt.length<=1200&&sentPrompt.includes(firstRule)&&
    !sentPrompt.includes(secondRule)&&!sentPrompt.includes('不应进入请求')&&state.skillPresets[0].skillIds.length===3,
    'Sent recipe content diverged from preview, ignored a toggle, or modified the stored recipe');
  click('#modalClose');
  state.skills=priorSkills;state.skillPresets=priorRecipes;
  state.settings.aiProvider=provider;state.settings.localContextChars=limit;
  chatAPI=previousChat;

  go('world');
  click('[data-action="v15-world"]');input('#sw14-premise','这座城在无日之年封闭。');input('#sw14-rules','夜间不得开启东门。');
  click('#sw15-save-world');
  await wait(()=>project().worldProfile?.premise.includes('无日之年'),'World background did not save');
  click('[data-action="v15-terms"]');click('#sw14-add-card');
  input('#sw14-title','巡灯人');input('#sw14-aliases','守烛');input('#sw14-body','专门巡查暗巷的职务。');click('#sw14-save-card');
  await wait(()=>query('#sw14-cards')?.textContent.includes('巡灯人'),'Glossary entry did not save');
  query('#sw14-search').value='守烛';query('#sw14-search').dispatchEvent(new Event('input'));
  assert(queryAllCards()===1,'Glossary alias search did not find term');
  click('[data-sw14-card]');click('#sw30-edit');input('#sw14-body','负责暗巷巡灯和报时。');click('#sw14-save-card');
  await wait(()=>query('.sw30-reader')?.textContent.includes('报时'),'Glossary entry editing failed');
  click('#sw30-back');
  assert(query('#sw14-search').value==='守烛'&&query('#sw14-category').value==='术语','Editing lost the glossary filters');
  click('#modalClose');go('write');
  openTool('v14-chapter-kb');click('.sw30-quick summary');click('#sw30-world');
  assert(query('.sw30-reader')?.textContent.includes('夜间不得开启东门')&&!query('#sw14-premise'),'World reference did not show saved settings read-only');
  click('#sw30-back');search('#sw14-search','西门 城防');click('[data-sw14-card]');
  click('.sw30-quick summary');click('[data-sw30-chapter]');
  assert(tab==='write'&&chapter().id===restoredWorkshop.projects.find(work=>work.id===state.selected).knowledgeCards[0].chapterIds[0],
    'Knowledge backlink did not return to its chapter');
  openTool('v14-chapter-kb');click('.sw30-quick summary');click('#sw30-people');
  assert(query('#sw7DrawerClose')&&tab==='write','The chapter materials shortcut did not open the character drawer over the editor');
  click('#sw7DrawerClose');click('#modalClose');
  click('#sw16-back');click('#sw15-add');click('#sw15-add-volume');input('#sw15-volume-name','卷一 · 无日之年');click('#sw15-save-volume');
  await wait(()=>query('[data-sw15-volume]'),'Volume did not appear in chapter overview');
  const target = chapters().at(-1).id, volume = project().volumes[0].id;
  click('[data-sw35-menu="'+target+'"]');click('[data-sw15-move="'+target+'"]');input('#sw15-target-volume',volume);click('#sw15-move-chapter');
  await wait(()=>chapters()[0].id===target&&chapters()[0].volumeId===volume,'Chapter did not move into volume order');
  assert(query('.sw15-volume [data-sw14-chapter]').dataset.sw14Chapter===target,'Chapter overview did not group the moved chapter');
  click('.sw19-directory-search summary');
  input('#sw24-directory-volume','volume:'+volume);
  assert(document.querySelectorAll('[data-sw14-chapter]').length===1 &&
    query('[data-sw14-chapter]').dataset.sw14Chapter===target,'Volume filter did not isolate its chapters');
  click('[data-sw14-chapter]');click('#sw16-back');
  assert(query('#sw24-directory-volume').value==='volume:'+volume,'Volume filter did not survive returning to the directory');
  assert(query('[data-sw14-chapter][aria-current="true"]')?.dataset.sw14Chapter===target,'Directory did not mark the last writing chapter');
  input('#sw24-directory-volume','volume:');
  assert(!query('[data-sw14-chapter="'+target+'"]'),'Unfiled filter included chapters in a volume');
  click('#sw19-clear-query');
  const previousDownload=downloadFile;
  let exported='';
  downloadFile=(_name,text)=>{exported=text;};
  exportBook();downloadFile=previousDownload;
  assert(exported.includes('【卷一 · 无日之年】')&&exported.includes('【未分卷】'),'Export omitted volume headings');
  const originalProjects=state.projects, exportWork=project();
  const [scopedDraft,scopedFinal]=exportWork.chapters;
  const finalText='  定稿正文。\n\n保留原稿空行。';
  const finalTitle='小标题 *星光*';
  state.projects=state.projects.map(work=>work.id===exportWork.id?{...work,chapters:work.chapters.map(ch=>{
    if(ch===scopedDraft)return {...ch,text:'已经改过的正文。',blueprint:{stage:'final',finalId:'stale-final'},
      history:[{id:'stale-final',text:'改动之前。',title:ch.title}]};
    if(ch===scopedFinal)return {...ch,title:finalTitle,text:finalText,blueprint:{stage:'final',finalId:'ready-final'},
      history:[{id:'ready-final',text:finalText,title:finalTitle}]};
    return {...ch,blueprint:{stage:'draft'}};
  })}:work);
  render();
  click('.sw16-directory-tools summary');click('[data-action="sw25-export"]');
  click('#sw25-export-final');
  input('#sw25-export-scope','volume:'+volume);
  assert(query('#sw25-export-save').disabled && query('#sw25-export-preview').hidden,'An edited final draft was eligible for final-only export');
  input('#sw25-export-scope','volume:');
  input('#sw25-export-format','md');
  assert(query('#sw25-export-preview').children.length===1 && query('#sw25-export-preview').textContent.includes('第2章 '+finalTitle),
    'Export preview lost the book chapter number or included other chapters');
  let exportedMarkdown;
  const exportBridge=window.StoryBridge;
  window.StoryBridge={...exportBridge,saveText:(name,text,mime)=>{exportedMarkdown={name,text,mime};}};
  const finalRow=chapters().find(ch=>ch.id===scopedFinal.id);
  finalRow.text+=' 临时改动。';
  click('#sw25-export-save');
  assert(!exportedMarkdown && query('#sw25-export-save').disabled,'A changed final manuscript was saved using a stale preview');
  finalRow.text=finalText;
  input('#sw25-export-scope','');input('#sw25-export-scope','volume:');
  click('#sw25-export-save');
  assert(exportedMarkdown?.name.endsWith('-未分卷-定稿.md') && exportedMarkdown.mime.startsWith('text/markdown') &&
    exportedMarkdown.text.includes('## 未分卷\n\n### 第2章 小标题 \\*星光\\*') &&
    exportedMarkdown.text.includes(finalText) && !exportedMarkdown.text.includes('已经改过的正文。'),
    'Markdown export had the wrong filename, format, chapter text or scope');
  window.StoryBridge=exportBridge;
  state.projects=originalProjects;
  render();
  const restoredV15=normalizeBackup(JSON.parse(JSON.stringify(state))).projects.find(row=>row.id===state.selected);
  assert(restoredV15.volumes[0].id===volume && restoredV15.chapters[0].volumeId===volume &&
    restoredV15.worldProfile.rules.includes('东门') && restoredV15.knowledgeCards.some(card=>card.aliases==='守烛') &&
    restoredV15.writingPrompts.polish==='保留日期，只调整表达。','Backup did not retain new writing metadata');
  click('[data-sw14-chapter="'+chapter().id+'"]');
  const longDraft='风吹过河堤。\n'.repeat(160);
  edit(longDraft);
  const originalChapter=chapter().id;
  const longEditor=query('#chapterText');
  longEditor.setSelectionRange(79,83,'backward');
  longEditor.scrollTop=220;
  assert(longEditor.scrollTop>0,'Resume fixture did not create a scrollable manuscript');
  const expectedScroll=longEditor.scrollTop;
  go('home');
  assert(query('#bottomNav').hidden && !query('#sw16-continue'),'Bookshelf exposed book controls');
  const storedPositions=JSON.parse(localStorage.getItem('storyweave_editor_positions'));
  assert(storedPositions.at(-1).chapter===originalChapter && storedPositions.at(-1).caret===83,'Caret was not persisted on leaving the writer');
  assert(query('#sw37-resume')?.textContent.includes(chapter().title)&&!query('.sw6-manuscript-cta')&&
    query('[data-action=shelf-add]'),'Bookshelf did not show the latest chapter and compact import');
  click('#sw37-resume');
  assert(tab==='write'&&chapter().id===originalChapter&&query('#chapterText').selectionStart===79&&
    query('#chapterText').selectionEnd===83&&query('#chapterText').selectionDirection==='backward'&&
    query('#chapterText').scrollTop===expectedScroll,'Bookshelf resume opened the wrong chapter or lost position');
  assert(StoryWeaveDesk.back()&&tab==='contents','Back from shelf resume did not open the current work directory');
  go('home');
  click('.book-card');
  assert(query('#sw16-continue')?.dataset.id===originalChapter,'Directory did not show the last chapter');
  click('#sw16-continue');
  assert(query('#chapterText').selectionStart===79 && query('#chapterText').selectionEnd===83 &&
    query('#chapterText').selectionDirection==='backward' && query('#chapterText').scrollTop===expectedScroll,
    'Returning to the chapter lost editor selection or scroll position');
  const markerLine='此处的渡船已经载走了最后一位巡灯人。\n';
  const markedText=longDraft.slice(0,640)+markerLine+longDraft.slice(640);
  const markedCaret=648;
  edit(markedText);
  query('#chapterText').setSelectionRange(markedCaret,markedCaret);
  openTool('sw27-bookmarks');
  input('#sw27-bookmark-title','渡船段落');
  storageFailure=true;click('#sw27-bookmark-add');
  await wait(()=>query('#modalRoot [role="status"]')?.textContent.includes('测试写入故障'),'Bookmark write failure was not shown');
  assert(!chapter().writingBookmarks?.length,'Failed write added a bookmark');
  storageFailure=false;click('#sw27-bookmark-add');
  await wait(()=>query('[data-sw27-jump]'),'Bookmark was not added');
  const savedMark=normalizeBackup(JSON.parse(localStorage.getItem('storyweave_fallback'))).projects
    .find(work=>work.id===state.selected).chapters.find(ch=>ch.id===originalChapter).writingBookmarks[0];
  assert(savedMark.title==='渡船段落' && savedMark.caret===markedCaret,'Backup lost the bookmark or its original position');
  click('#modalClose');
  const prefix='新增开篇。\n';
  edit(prefix+markedText);
  click('#sw16-back');click('.sw16-directory-tools summary');click('[data-action="sw27-bookmarks"]');
  assert(!query('#sw27-bookmark-add'),'Directory bookmark list tried to use a missing editor');
  click('[data-sw27-jump]');
  assert(chapter().id===originalChapter && query('#chapterText').selectionEnd===markedCaret+prefix.length &&
    query('#chapterText').scrollTop>0,'Bookmark failed to relocate after an insertion or did not reveal the caret');
  const rewritten=prefix+longDraft;
  edit(rewritten);
  openTool('sw27-bookmarks');click('[data-sw27-jump]');
  assert(query('#chapterText').selectionEnd===markedCaret && notices.at(-1)?.includes('书签附近的正文已变化'),
    'Missing bookmark context did not fall back to its previous position');
  openTool('sw27-bookmarks');click('[data-sw27-remove]');
  await wait(()=>query('#modalRoot')?.textContent.includes('还没有书签'),'Bookmark removal did not update the list');
  assert(chapter().text===rewritten,'Removing a bookmark changed the draft');
  click('#modalClose');
  edit(longDraft);
  const term='片段[甲]';
  const [searchFirst,searchSecond]=chapters();
  const firstDraft=searchFirst.text, secondDraft=searchSecond.text;
  const literal=StoryWeaveEditor.findMatches('İ foo.+','foo.+');
  assert(literal.length===1 && literal[0].start===2 && literal[0].end===7,'Literal search drifted after a Unicode case expansion');
  searchFirst.text='İ\r\n'+(term+'\r\n').repeat(73);
  searchSecond.text='她收起'+term+'。';
  chapterId=searchFirst.id;go('write');
  act('search');search('#sw7FullSearch',term);
  assert(query('#sw7SearchSummary').textContent.includes('74 条') &&
    document.querySelectorAll('[data-sw7-hit]').length===72,'Project search lost matches or failed to paginate');
  click('#sw28-page-next');click('[data-sw7-hit="72"]');
  let resultEditor=query('#chapterText');
  assert(resultEditor.value.slice(resultEditor.selectionStart,resultEditor.selectionEnd)===term &&
    resultEditor.selectionStart===2+72*(term.length+1) && resultEditor.scrollTop>0,'Search hit did not select or reveal the correct offset after CRLF');
  click('[data-sw28-results]');
  assert(query('#sw7FullSearch').value===term && query('[data-sw7-hit="72"]'),'Returning to results lost the query or page');
  click('[data-sw7-hit="72"]');click('[data-sw28-next]');
  assert(chapter().id===searchSecond.id && query('#chapterText').selectionStart===3,'Next match did not continue into the following chapter');
  click('[data-sw28-prev]');
  assert(chapter().id===searchFirst.id,'Previous match did not cross chapters');
  edit('全文已重写。');
  click('[data-sw28-next]');
  assert(chapter().id===searchSecond.id && query('#sw28-search-nav [role="status"]').textContent.includes('1 / 1'),
    'Search navigation retained stale matches after editing');
  click('[data-sw28-close]');
  assert(!query('#sw28-search-nav'),'Closing search left the navigation bar visible');
  searchFirst.text=firstDraft;searchSecond.text=secondDraft;
  chapterId=originalChapter;go('write');
  query('#chapterText').setSelectionRange(0,0);
  openTool('sw7-find');search('#sw7Find','河堤');click('#sw7Next');
  resultEditor=query('#chapterText');
  const firstLocalHit=resultEditor.selectionStart;
  click('[data-sw28-next]');
  assert(chapter().id===originalChapter && resultEditor.selectionStart>firstLocalHit &&
    resultEditor.value.slice(resultEditor.selectionStart,resultEditor.selectionEnd)==='河堤','Chapter search could not continue within the editor');
  click('[data-sw28-close]');
  const replaceDraft='İ前置。\n同名[词]与同名[词]。';
  edit(replaceDraft);
  openTool('sw7-find');search('#sw7Find','同名[词]');input('#sw7Replace','替换');click('#sw7ReplaceAll');
  await wait(()=>chapter().text==='İ前置。\n替换与替换。'&&!query('#modalClose'),'Literal replacement corrupted text near Unicode or brackets');
  assert(chapter().history.some(row=>row.text===replaceDraft),'Search replacement lost its undo snapshot');
  edit(longDraft);
  openTool('v14-display');
  input('#sw16-paper','ink');
  if (window.captureNight) input('#sw20-background','mist');
  click('#sw14-display-save');
  assert(document.body.dataset.sw16Paper==='ink' && getComputedStyle(query('#chapterText')).backgroundColor==='rgb(34, 43, 41)','Night paper was not applied to the manuscript');
  if (window.captureNight) {
    edit('　　入夜以后，河滩上只剩几盏灯。\n\n　　林澈循着水声往前走，脚下的石头还留着白天的余温。桥边那家茶铺早已打烊，门板缝里却漏出一线光。\n\n　　他停了停，把信折回袖口。约好的人没有出现。\n\n　　下游响起三声木梆。最后一声落下时，有人在身后叫了他的名字。');
    query('#chapterTitle').value = '河堤夜话';
    query('#chapterText').setSelectionRange(0,0);
    query('#chapterText').scrollTop = 0;
    click('.sw14-focus-button');
    return;
  }
  openTool('v14-display');input('#sw20-background','custom');
  assert(query('#sw14-display-save').disabled,'An empty image selection could be applied');
  selectFile('#sw20-image',new File(['invalid'],'broken.png',{type:'image/png'}));
  await wait(()=>query('#sw20-image-status')?.textContent.includes('无法读取'),'Invalid wallpaper was not reported');
  assert(document.body.dataset.sw20Background==='plain','An invalid image changed the applied background');
  const backgroundCanvas = document.createElement('canvas');
  backgroundCanvas.width=48;backgroundCanvas.height=32;
  const brush=backgroundCanvas.getContext('2d');
  brush.fillStyle='#6c9284';brush.fillRect(0,0,48,32);
  const image = await new Promise(resolve=>backgroundCanvas.toBlob(resolve,'image/png'));
  selectFile('#sw20-image',new File([image],'松影.png',{type:'image/png'}));
  await wait(()=>query('#sw20-preview')?.dataset.sw20Background==='custom','Local wallpaper did not decode and preview');
  click('#sw17-ruled');
  click('#sw14-display-save');
  const paperWithImage = () => getComputedStyle(query('#chapterText')).backgroundImage;
  assert(paperWithImage().includes('repeating-linear-gradient') && paperWithImage().includes('data:image/jpeg;'),
    'Local wallpaper and ruled paper did not appear together');
  click('.sw14-focus-button');
  assert(paperWithImage().includes('data:image/jpeg;'),'Focus mode lost the applied wallpaper');
  click('.sw14-focus-button');
  openTool('reader');
  assert(getComputedStyle(query('.reading-panel')).backgroundImage.includes('data:image/jpeg;'),'Reading preview lost the applied wallpaper');
  click('#modalClose');
  openTool('v14-display');
  assert(query('#sw20-background').value==='custom' && !query('#sw20-remove').disabled,'Applied wallpaper did not survive reopening preferences');
  click('#sw20-remove');click('#sw17-ruled');click('#sw14-display-save');
  assert(!paperWithImage().includes('data:image/jpeg;') &&
    JSON.parse(localStorage.getItem('storyweave_writer_display')).image==='','Removing wallpaper did not clear the stored image');
  openTool('v16-copy');
  let copied='';
  window.StoryBridge={copyChapterText:value=>{copied=value;}};
  input('#sw16-copy-part','title');click('#sw16-copy');
  assert(copied===chapter().title,'Title copy used the wrong scope');
  input('#sw16-copy-part','body');click('#sw16-copy');
  assert(copied===longDraft,'Body copy changed line breaks');
  delete window.StoryBridge;
  click('#modalClose');
  const messy='一段  \n\n\n  二段\t';
  edit(messy);
  openTool('v16-format');
  click('[name="indent"]');
  assert(query('#sw16-format-new').textContent==='　　一段\n\n　　二段' && chapter().text===messy,'Formatting preview was incorrect or wrote early');
  storageFailure=true;
  click('#sw16-format-apply');
  await wait(()=>query('#sw16-format-status')?.textContent.startsWith('保存失败'),'Formatting failed to report write failure');
  assert(chapter().text===messy,'Formatting failure changed the manuscript');
  storageFailure=false;
  await wait(()=>JSON.parse(localStorage.getItem('storyweave_fallback') || '{}').projects?.some(p=>
    p.id===state.selected && p.chapters.some(ch=>ch.id===originalChapter && ch.text===messy)),
    'Failed formatting cancelled the original draft autosave');
  click('#sw16-format-apply');
  await wait(()=>chapter().text==='　　一段\n\n　　二段','Formatting adoption failed');
  assert(chapter().history.some(row=>row.text===messy),'Formatting did not retain the original manuscript');
  const commonLines=Array.from({length:70},(_,i)=>'保持不变的段落 '+i).join('\n');
  const oldVersion='旧版开头\n'+commonLines+'\n旧版结尾';
  const currentVersion='现稿开头\n'+commonLines+'\n现稿结尾';
  chapter().history.unshift({id:'history-review-fixture',at:new Date().toISOString(),title:'旧章名',text:oldVersion});
  edit(currentVersion);
  openTool('view-history');click('[data-sw7-version="history-review-fixture"]');
  assert(query('#sw22-version-body').textContent.includes('2 处差异') &&
    query('#sw22-version-body').textContent.includes('旧版结尾'),'History skipped a change far from the first edit');
  click('[data-sw22-view="saved"]');
  assert(query('.sw22-version-full').textContent===oldVersion,'Full history preview lost part of the original manuscript');
  click('[data-sw22-view="current"]');
  assert(query('.sw22-version-full').textContent===currentVersion,'Full current preview is not the current chapter');
  click('#sw7RestoreVersion');click('#sw22-restore-cancel');
  assert(chapter().text===currentVersion && query('#sw22-restore-review').hidden,'Cancelling restore changed the manuscript');
  click('#sw7RestoreVersion');
  edit(currentVersion+'晚一点写的内容');
  click('#sw22-restore-confirm');
  await wait(()=>query('#sw22-version-status')?.textContent.includes('章节已变化'),'Stale restore preview could overwrite a newer manuscript');
  assert(chapter().text===currentVersion+'晚一点写的内容','Stale restore lost a new edit');
  edit(currentVersion);
  click('#modalClose');openTool('view-history');click('[data-sw7-version="history-review-fixture"]');click('#sw7RestoreVersion');
  storageFailure=true;click('#sw22-restore-confirm');
  await wait(()=>query('#sw22-version-status')?.textContent.includes('测试写入故障'),'Restore failure was not shown');
  assert(chapter().text===currentVersion && !chapter().history.some(row=>row.text===currentVersion),'Failed restore partly changed the manuscript or history');
  storageFailure=false;click('#sw22-restore-confirm');
  await wait(()=>chapter().text===oldVersion && !query('#modalClose'),'Retry did not restore the complete old version');
  assert(chapter().title==='旧章名' && chapter().history.some(row=>row.text===currentVersion),'Restore lost the previous title or undo snapshot');
  assert(StoryWeaveDesk.back() && document.body.dataset.sw16View==='contents','Back from editor did not reach the book directory');
  assert(StoryWeaveDesk.back() && document.body.dataset.sw16View==='home','Back from directory did not reach the bookshelf');
  const importFiles=new DataTransfer();
  const epubBytes=Uint8Array.from(atob(testEpub),char=>char.charCodeAt(0));
  const falseSize=epubBytes.slice();
  const zip=new DataView(falseSize.buffer);
  const firstEntry=zip.getUint32(falseSize.length-6,true);
  zip.setUint32(firstEntry+24,1,true);
  const booksBeforeMalformed=state.projects.length;
  selectFile('#manuscriptImport',new File([falseSize],'损坏.epub',{type:'application/epub+zip'}));
  await wait(()=>StoryWeaveManuscript.getLastError().includes('实际解压大小'),'Invalid EPUB expansion was not rejected');
  assert(state.projects.length===booksBeforeMalformed && !query('#sw6Commit'),'Damaged EPUB opened preview or created a work');
  importFiles.items.add(new File([epubBytes],'归途.epub',{type:'application/epub+zip'}));
  query('#manuscriptImport').files=importFiles.files;
  query('#manuscriptImport').dispatchEvent(new Event('change'));
  await wait(()=>query('#sw6Commit'),'Bookshelf import did not open the manuscript preview');
  assert(query('#sw26-import-mode').value==='volumes' && query('.sw26-import-list h4')?.textContent==='第一卷 · 河岸',
    'Manuscript import did not preview the detected volume');
  input('#sw26-import-mode','single');
  assert(query('#sw26-import-summary').textContent.startsWith('1 章'),'Single-chapter preview retained the split structure');
  input('#sw26-import-mode','chapters');
  assert(query('#sw26-import-summary').textContent.startsWith('2 章')&&!query('.sw26-import-list h4'),'Chapter-only preview kept volume grouping');
  input('#sw26-import-mode','volumes');
  const beforeImport=state.projects.length;
  storageFailure=true;click('#sw6Commit');
  await wait(()=>query('#modalRoot [role="status"]')?.textContent.includes('测试写入故障'),'Import did not report write failure');
  assert(state.projects.length===beforeImport,'Failed manuscript import created a work');
  storageFailure=false;
  click('#sw6Commit');
  await wait(()=>document.body.dataset.sw16View==='contents'&&project()?.title==='归途','Imported work did not open into its directory');
  assert(query('[data-sw14-chapter]') && !query('#chapterText'),'Imported work skipped the book directory');
  const [importedFirst,importedSecond] = chapters();
  assert(importedFirst.title==='第一章 归途' && importedSecond.title==='第二章 回声' && chapters().length===2,
    'EPUB import used archive order or included the navigation page');
  assert(project().volumes.length===1 && importedFirst.volumeId===project().volumes[0].id &&
    importedSecond.volumeId===importedFirst.volumeId,'Imported chapters lost their volume association');
  click('.sw19-directory-search summary');
  search('#sw19-directory-query','旧桥');
  assert(!query('[data-sw14-chapter]'),'Directory searched the manuscript before opting in');
  click('#sw24-directory-body');
  assert(document.querySelectorAll('[data-sw14-chapter]').length===1 &&
    query('[data-sw14-chapter]').dataset.sw14Chapter===importedFirst.id,'Directory body search did not find the right chapter');
  click('[data-sw14-chapter]');
  openTool('sw19-jump');
  search('#sw19-jump-query','缓缓关闭');
  assert(!query('[data-sw19-jump]'),'Chapter jump searched body text by default');
  click('#sw24-jump-body');
  const jumpField=query('#sw19-jump-query');
  jumpField.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true}));
  assert(query('#sw19-jump-list'),'Chapter jump interrupted an IME composition');
  jumpField.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));
  assert(chapter().id===importedSecond.id && !query('#sw19-jump-list'),'Enter did not open the unique body search match');
  click('#sw16-back');
  assert(query('#sw24-directory-body').checked && query('#sw19-directory-query').value==='旧桥',
    'Directory forgot the body search filter after editing');
  click('#sw19-clear-query');
  click('[data-sw35-menu="'+importedSecond.id+'"]');
  click('[data-sw15-move="'+importedSecond.id+'"]');
  input('#sw19-before-chapter',importedFirst.id);
  notices.length = 0;
  storageFailure=true;
  click('#sw15-move-chapter');
  await wait(()=>!query('#sw15-move-chapter')?.disabled && notices.some(message=>message.includes('测试写入故障')),'Failed chapter reorder was not reported');
  assert(chapters()[0].id===importedFirst.id,'Failed reorder changed chapter order');
  storageFailure=false;
  click('#sw15-move-chapter');
  await wait(()=>chapters()[0].id===importedSecond.id && !query('#modalClose'),'Chapter order did not change in the same group');
  const reorderedText = bookText(project());
  const firstExportIndex = reorderedText.indexOf(importedFirst.text);
  const secondExportIndex = reorderedText.indexOf(importedSecond.text);
  assert(secondExportIndex>=0 && firstExportIndex>secondExportIndex,'Manuscript export did not use the new chapter order');
  const trashed = chapters()[0], trashProject=state.selected;
  state.timelineEvents.push({id:'trash-event',projectId:trashProject,chapterId:trashed.id,title:'河岸钟声',participants:[]});
  state.sceneCards.push({id:'trash-scene',projectId:trashProject,chapterId:trashed.id,title:'桥边',participants:[],eventIds:['trash-event']});
  click('[data-sw35-menu="'+trashed.id+'"]');
  click('[data-sw17-remove="'+trashed.id+'"]');
  storageFailure=true;
  click('#sw17-confirm-trash');
  await wait(()=>query('#modalRoot [role="status"]')?.textContent.startsWith('操作失败'),'Trash did not report storage failure');
  assert(chapters().some(row=>row.id===trashed.id) && state.sceneCards.some(row=>row.id==='trash-scene'),'Failed trash operation partly removed chapter data');
  storageFailure=false;
  click('#sw17-confirm-trash');
  await wait(()=>!chapters().some(row=>row.id===trashed.id) && !query('#modalClose'),'Chapter did not enter trash');
  assert(!state.sceneCards.some(row=>row.id==='trash-scene') &&
    state.timelineEvents.find(row=>row.id==='trash-event')?.chapterId==='','Deleting a chapter left active broken links or removed the world event');
  state=normalizeBackup(JSON.parse(JSON.stringify(state)));render();
  assert(project().chapterTrash[0].chapter.text===trashed.text && project().chapterTrash[0].beforeId===importedFirst.id,
    'Backup lost recycled chapter text or its original neighbor');
  const insertedId='inserted-during-chapter-trash';
  await StoryWeaveDistillation.persist(next=>{
    next.projects=next.projects.map(work=>work.id===trashProject
      ? {...work,chapters:[{...importedFirst,id:insertedId,title:'序章',text:'新插入的章节。',history:[]},...work.chapters]} : work);
  });
  render();
  click('.sw16-directory-tools summary');
  click('[data-action="v17-trash"]');
  click('[data-sw17-restore="'+trashed.id+'"]');
  await wait(()=>chapters().some(row=>row.id===trashed.id)&&!query('#modalClose'),'Restoring chapter failed');
  assert(chapters()[0].id===insertedId && chapters()[1].id===trashed.id &&
    chapters()[2].id===importedFirst.id && state.timelineEvents.find(row=>row.id==='trash-event')?.chapterId===trashed.id &&
    state.sceneCards.some(row=>row.id==='trash-scene'&&row.eventIds.includes('trash-event')),'Restore lost chapter ordering or links');
  click('#sw16-back');click('[data-action=shelf-menu]');click('[data-shelf-command=settings]');
  if (window.captureSettings) {
    query('.modal-backdrop').style.width='390px';
    return;
  }
  click('[data-sw17-settings="shelf"]');
  input('#sw17-shelf','list');click('#sw17-shadows');click('#sw17-tags');click('#sw17-save');
  assert(document.body.dataset.sw17Shelf==='list' && document.body.dataset.sw17Shadows==='false' && document.body.dataset.sw17Tags==='false','Shelf preferences did not apply');
  click('[data-sw17-settings="typing"]');
  click('#sw17-pairs');click('#sw17-pairDelete');click('#sw17-indent');click('#sw17-symbols');
  input('#sw17-counting','noPunctuation');
  input('#sw17-focusChapterLabel','hidden');
  click('#sw17-save');
  click('#modalClose');
  click('.book-card[data-id="'+trashProject+'"]');
  click('[data-sw14-chapter="'+trashed.id+'"]');
  assert(getComputedStyle(query('[data-action="v17-quick-ai"]')).display==='none','Optional AI shortcut enabled itself');
  edit('');
  const testEditor=query('#chapterText');
  const beforeInput=(inputType,data=null,isComposing=false)=>testEditor.dispatchEvent(new InputEvent('beforeinput',
    {inputType,data,isComposing,bubbles:true,cancelable:true}));
  assert(beforeInput('insertText','“',true) && chapter().text==='','Pair automation interfered with composition');
  assert(!beforeInput('insertText','“') && chapter().text==='“”' && testEditor.selectionStart===1,'Auto pair did not leave caret inside quotes');
  assert(query('#charCount').textContent==='0 字','Punctuation-free count included quotation marks');
  assert(!beforeInput('deleteContentBackward') && chapter().text==='','Empty pair was not deleted together');
  assert(!beforeInput('insertLineBreak') && chapter().text==='\n　　','Optional indentation did not apply');
  openTool('settings');click('[data-sw17-settings="ai"]');click('#sw17-aiShortcut');click('#sw17-save');click('#modalClose');
  const requestCount=prompts.length;
  assert(query('[data-action="v17-quick-ai"]').textContent==='AI 开头','Empty chapter did not show the optional AI opening shortcut');
  click('.sw14-focus-button');
  assert(!query('.sw21-chapter-name').getClientRects().length && query('.sw21-chapter-generic').getClientRects().length &&
    !query('[data-action="v17-quick-ai"]').getClientRects().length,'Focus title or AI preference cluttered the toolbar');
  openTool('v17-quick-ai');
  assert(query('[data-sw15-task="opening"]').getAttribute('aria-pressed')==='true' &&
    query('#sw15-prompt-settings').open && prompts.length===requestCount,'AI opening did not show the editable prompt first');
  chatAPI=async (_system,prompt)=>{prompts.push({prompt});return '河面刚起雾。';};
  input('#sw15-instructions','从等船的人写起');
  click('#sw8Ask');
  await wait(()=>query('#sw15-candidate')?.value==='河面刚起雾。','Opening prompt did not produce a candidate');
  assert(prompts.at(-1).prompt.includes('从等船的人写起') && chapter().text==='\n　　','Opening task skipped instructions or modified the manuscript automatically');
  chatAPI=previousChat;
  click('#modalClose');
  click('.sw14-focus-button');
  edit('她在河边停下。');
  assert(query('[data-action="v17-quick-ai"]').textContent==='AI 续写','Nonempty chapter did not offer continuation');
  openTool('settings');click('[data-sw17-settings="ai"]');click('#sw17-aiShortcut');click('#sw17-save');click('#modalClose');
  assert(getComputedStyle(query('[data-action="v17-quick-ai"]')).display==='none','Turning off the AI shortcut left it visible');
  go('home');
  const survivor = state.projects.find(row=>row.id!==trashProject);
  const targetCard = () => query('.book-card[data-id="'+trashProject+'"]');
  const otherCard = () => query('.book-card[data-id="'+survivor.id+'"]');
  const press = (element,type,x,y) => element.dispatchEvent(new PointerEvent(type,{
    pointerType:'touch',pointerId:9,isPrimary:true,button:0,clientX:x,clientY:y,bubbles:true
  }));
  press(targetCard(),'pointerdown',5,5);press(targetCard(),'pointermove',5,35);
  await new Promise(resolve=>setTimeout(resolve,580));
  assert(!query('.sw18-menu'),'Scrolling a cover triggered its context menu');
  let shared;
  window.StoryBridge={shareBookText:(title,text)=>{shared={title,text};}};
  press(targetCard(),'pointerdown',5,5);
  await wait(()=>query('.sw18-menu'),'Long-press did not open book actions');
  press(targetCard(),'pointerup',5,5);targetCard().click();
  assert(query('.sw18-menu') && tab==='home','Long-press leaked a tap into the book directory');
  if (window.captureBookActions) {query('.modal-backdrop').style.width='390px';return;}
  click('[data-sw18-item="share"]');
  assert(shared?.title==='归途' && shared.text.includes('《归途》'),'Share used a different book from the context menu');
  delete window.StoryBridge;
  click('[data-sw18-item="group"]');input('#sw18-group','奇幻草稿');click('#sw18-save-group');
  await wait(()=>query('.sw18-group-filter'),'Grouping did not create a shelf filter');
  assert(!query('.sw37-shelf-filter').open,'Shelf filters crowded the default view');
  click('#shelfSearchBtn');
  input('.sw18-group-filter','group:奇幻草稿');
  assert(otherCard().closest('.sw18-card-wrap').hidden && !targetCard().closest('.sw18-card-wrap').hidden,'Shelf filter selected the wrong works');
  if (window.captureShelfResume) return;
  search('#sw37-shelf-query','归途 奇幻');
  assert(query('#sw37-shelf-status').textContent.includes('显示 1 / 2')&&!query('.sw37-shelf-empty').getClientRects().length,
    'Searching by title and group did not combine with group filtering');
  input('.sw18-group-filter','ungrouped');
  assert(query('#sw37-shelf-status').textContent.includes('显示 0 / 2')&&!query('.sw37-shelf-empty').hidden,
    'Conflicting shelf filters did not show the empty state');
  go('home');
  assert(query('.sw37-shelf-filter').open&&query('#sw37-shelf-query').value==='归途 奇幻'&&
    query('.sw18-group-filter').value==='ungrouped','Shelf search was lost on a new render');
  click('#sw37-filter-clear');input('.sw18-group-filter','ungrouped');
  assert(targetCard().closest('.sw18-card-wrap').hidden&&!otherCard().closest('.sw18-card-wrap').hidden,'Ungrouped filter showed a grouped work');
  click('#sw37-filter-clear');
  click('.book-card[data-id="'+trashProject+'"] + .sw18-more');
  click('[data-sw18-item="pin"]');
  await wait(()=>query('.books .book-card')?.dataset.id===trashProject && query('.sw18-pinned'),'Pinned work was not shown first');
  otherCard().click();go('home');
  const recentShelfChapter=StoryWeaveDesk.lastOpenedChapter();
  assert(recentShelfChapter.work.id===trashProject&&project()?.id===survivor.id,'Switching directories replaced the most recently opened chapter');
  click('#sw37-resume');
  assert(tab==='write'&&project()?.id===trashProject&&chapter().id===recentShelfChapter.chapter.id,
    'Shelf resume did not switch to the last active work');
  go('home');otherCard().click();go('home');
  assert(project()?.id===survivor.id,'Export test did not leave another work selected');
  click('.book-card[data-id="'+trashProject+'"] + .sw18-more');
  const priorDownload=downloadFile;
  let shelfExport='';
  downloadFile=(_name,text)=>{shelfExport=text;};
  click('[data-sw18-item="export"]');
  assert(!shelfExport && query('#sw25-export-preview'),'Shelf export skipped the preview');
  click('#sw25-export-save');downloadFile=priorDownload;
  assert(shelfExport.includes('《归途》') && project()?.id===survivor.id,'Shelf export targeted or activated the wrong work');
  click('.book-card[data-id="'+trashProject+'"] + .sw18-more');
  click('[data-sw18-item="delete"]');click('#sw18-cancel');
  assert(targetCard() && state.projects.some(row=>row.id===trashProject),'Cancel removed the work');
  state.worldMaps.push({id:'delete-map',projectId:trashProject});
  state.worldPlaces.push({id:'delete-place',projectId:trashProject});
  const savedSkills=state.skills.length;
  state.skills.push({id:'delete-scoped-skill',projectId:trashProject,title:'作品技能'});
  state.skillPresets.push({id:'delete-scope-probe',projectId:null,skillIds:[state.skills[0].id,'delete-scoped-skill']});
  click('.book-card[data-id="'+trashProject+'"] + .sw18-more');click('[data-sw18-item="delete"]');
  storageFailure=true;
  click('#sw18-confirm');
  await wait(()=>query('#modalRoot [role="status"]')?.textContent.startsWith('删除失败'),'Delete failed silently');
  assert(targetCard() && state.worldMaps.some(row=>row.id==='delete-map'),'Failed delete partly removed the work');
  storageFailure=false;
  const writeOriginal=storeAppState;
  let finishDeletion;
  storeAppState=async value=>{
    await writeOriginal(value);
    if (!value.projects.some(row=>row.id===trashProject) && state.projects.some(row=>row.id===trashProject)) {
      await new Promise(resolve=>{finishDeletion=resolve;});
    }
  };
  click('#sw18-confirm');
  await wait(()=>finishDeletion,'Could not pause deletion after writing and before adopting state');
  Object.defineProperty(document,'hidden',{value:true,configurable:true});
  document.dispatchEvent(new Event('visibilitychange'));
  delete document.hidden;
  assert(!JSON.parse(localStorage.getItem('storyweave_fallback')).projects.some(row=>row.id===trashProject),
    'Background autosave overwrote the committed deletion with stale state');
  finishDeletion();
  storeAppState=writeOriginal;
  await wait(()=>!targetCard() && !query('#sw18-confirm'),'Confirmed deletion did not remove the work');
  assert(otherCard() && state.selected===survivor.id && state.skills.length===savedSkills &&
    !state.worldMaps.some(row=>row.projectId===trashProject) && !state.worldPlaces.some(row=>row.projectId===trashProject),
    'Deletion affected other books or left orphaned map records');
  assert(state.skillPresets.find(row=>row.id==='delete-scope-probe').skillIds.join()===state.skills[0].id,
    'Deletion left a dangling reference to the work skill');
  await StoryWeaveWorkspace.transact(next=>{next.skillPresets=next.skillPresets.filter(row=>row.id!=='delete-scope-probe');});
  assert(StoryWeaveDesk.lastOpenedChapter()?.work.id===survivor.id&&!query('#sw37-resume')?.textContent.includes('归途'),
    'Shelf resume retained a removed project instead of using the latest valid position');
  window.dispatchEvent(new Event('pagehide'));
  await saveCurrentState();
  assert(!JSON.parse(localStorage.getItem('storyweave_fallback')).projects.some(row=>row.id===trashProject),'Autosave resurrected the deleted book');
  state.documents.push({id:'delete-reference',projectId:survivor.id,title:'测试参考书',type:'txt',text:'写作参考原文。'});
  state.distillationJobs.push({id:'delete-job',projectId:survivor.id,docId:'delete-reference',samples:[]});
  click('[data-action=shelf-menu]');click('[data-shelf-command=skills]');
  click('.library-item [data-id="delete-reference"] + .sw18-more');
  click('[data-sw18-item="delete"]');click('#sw18-confirm');
  await wait(()=>!state.documents.some(row=>row.id==='delete-reference'),'Reference book deletion failed');
  assert(!state.distillationJobs.some(row=>row.id==='delete-job')&&state.skills.length===savedSkills,'Reference deletion lost skills or left a task');
  go('home');click('.book-card');click('.sw16-directory-tools summary');click('[data-action="world-about"]');
  window.confirm=()=>{throw Error('Native confirm called for a book deletion');};
  click('#deleteProject');click('#sw18-confirm');
  await wait(()=>tab==='home'&&state.projects.length===0,'Deleting the final work through project settings failed');
  click('[data-action=shelf-menu]');click('[data-shelf-command=skills]');
  const referenceText = Array.from({length:4},(_,chapter)=>'第'+(chapter+1)+'章\n'+
    Array.from({length:50},(_,i)=>'第'+i+'段，窗外的灯火照在旧桥上，行人循着灯光找到了那条岔路。').join('\n')).join('\n');
  const referenceBytes = new Uint8Array(2+referenceText.length*2), referenceView = new DataView(referenceBytes.buffer);
  referenceView.setUint16(0,0xfeff,true);
  for (let i=0;i<referenceText.length;i++) referenceView.setUint16(2+i*2,referenceText.charCodeAt(i),true);
  const referenceFile = new File([referenceBytes],'灯火研究.txt',{type:'text/plain'});
  storageFailure=true;
  notices.length=0;
  selectFile('#bookImport',referenceFile);
  await wait(()=>notices.some(message=>message.includes('导入失败')),'Failed reference import was not reported');
  assert(!state.documents.length && !state.projects.length,'Failed reference import partially changed the workshop');
  storageFailure=false;
  selectFile('#bookImport',referenceFile);
  await wait(()=>query('.library-item [data-action="distill"]'),'Reference import was blocked by an empty bookshelf');
  const referenceId = query('.library-item [data-action="distill"]').dataset.id;
  const distill = '[data-action="distill"][data-id="'+referenceId+'"]';
  assert(state.documents.find(doc=>doc.id===referenceId).projectId===null && !state.projects.length,
    'Import created a dummy novel or linked the reference to a work');
  assert(state.documents.find(doc=>doc.id===referenceId).text===referenceText,'UTF-16 reference import corrupted text');
  click(distill);click('#sw8Basic');
  await wait(()=>state.skills.some(skill=>skill.sourceId===referenceId && skill.analysisType==='offline' && skill.status==='candidate'),
    'Offline skill extraction required a project');
  await wait(()=>query('#sw23-approve'),'Offline extraction did not open batch review');
  assert([...document.querySelectorAll('[data-sw23-id]')].every(field=>field.checked&&
    state.skills.find(skill=>skill.id===field.dataset.sw23Id).sourceId===referenceId),'Offline review included unrelated or unselected skills');
  click('#modalClose');
  click(distill);click('#sw8NewConsent');input('#sw8Sampling','opening');
  assert(query('#sw8ChunksField').hidden && document.querySelectorAll('#sw8PlanPreview .source-preview').length===3,
    'Opening analysis did not select the first three chapter openings');
  assert(query('#sw8PlanPreview .source-preview').textContent.startsWith('第0段'),'Opening analysis used the chapter heading instead of its body');
  input('#sw8Focus','scene');
  assert(query('#sw8Start').disabled,'Changing the excerpts did not revoke consent');
  const plannedExcerpt = query('#sw8PlanPreview .source-preview').textContent;
  let analysisCalls = 0;
  chatAPI=async (system,prompt,_maxTokens,purpose)=>{
    const excerpt=prompt.split('<source_text>\n')[1]?.split('\n</source_text>')[0];
    if (!excerpt || (!analysisCalls && excerpt!==plannedExcerpt)) throw Error('Model request differed from the preview');
    if (!system.includes('分类仅可选：场景细节、叙事视角')) throw Error('Selected focus missing from request');
    if (purpose!=='distillation') throw Error('Analysis did not request the structured-output policy');
    analysisCalls++;
    if(analysisCalls===2)throw Error('测试第二段暂时失败');
    return JSON.stringify({techniques:[{category:'场景细节',title:'用灯光引导行动',description:'把人物实际看到的灯光安排为选择下一步行动的线索',
      situation:'人物探索',rules:['先提供可见细节','再展示人物依据线索行动'],quote:excerpt.split('\n').find(line=>line.length>=12).slice(0,12),reason:'可见的灯光影响了人物行动'}]});
  };
  click('#sw8NewConsent');click('#sw8Start');
  await wait(()=>query('#sw8ResumeConsent'),'Empty bookshelf could not create a deep analysis job');
  assert(analysisCalls===0,'Deep analysis sent text before explicit start');
  const restoredLibrary = normalizeBackup(JSON.parse(localStorage.getItem('storyweave_fallback')));
  assert(!restoredLibrary.projects.length && restoredLibrary.documents.some(doc=>doc.id===referenceId) &&
    restoredLibrary.distillationJobs.some(job=>job.docId===referenceId && job.projectId===null),'Backup lost the independent reference or pending job');
  click('#modalClose');
  state=restoredLibrary;render();
  const restoredJob = state.distillationJobs.find(job=>job.docId===referenceId);
  click('[data-action="sw8-job"][data-id="'+restoredJob.id+'"]');
  click('#sw8ResumeConsent');click('#sw8Resume');
  await wait(()=>query('#sw8JobBody .alert')?.textContent.includes('测试第二段暂时失败'),'Request failure did not pause the job');
  assert(state.distillationJobs.find(job=>job.id===restoredJob.id).nextIndex===1,'An error discarded the first completed interval');
  click('#sw8ResumeConsent');click('#sw8Resume');
  await wait(()=>state.distillationJobs.some(job=>job.docId===referenceId && job.status==='complete'),'Deep analysis failed on an empty bookshelf');
  assert(analysisCalls===4 && state.skills.some(skill=>skill.sourceId===referenceId && skill.analysisType==='evidence-pipeline' &&
    skill.status==='candidate' && skill.evidenceRefs.length===3),'Deep analysis did not preserve verified evidence or author review');
  assert(query('[data-sw8-review]'),'Job completion did not expose the candidate for review');
  click('#modalClose');click(distill);input('#sw8Sampling','opening');input('#sw8Focus','scene');
  assert(query('#sw8Start').textContent==='查看已有结果'&&!query('#sw8Rerun').hidden,'An identical task could not be reopened');
  click('#sw8Start');
  assert(query('[data-sw8-review]') && analysisCalls===4 &&
    state.distillationJobs.filter(job=>job.docId===referenceId).length===1,'Opening an existing result created a new task or called the model');
  const distilled=state.skills.find(skill=>skill.sourceId===referenceId&&skill.analysisType==='evidence-pipeline');
  click('#sw23-job-approve');
  assert(query('[data-sw23-id="'+distilled.id+'"]').checked,'Batch review did not preselect the current task candidate');
  click('#sw23-approve');
  await wait(()=>state.skills.find(skill=>skill.id===distilled.id)?.status==='ready','Scoped batch review did not approve verified evidence');
  click('#modalClose');
  const localSkill=state.skills.find(skill=>skill.sourceId===referenceId&&skill.analysisType==='offline');
  click('[data-action="sw23-audit"]');click('#sw23-approve');
  await wait(()=>state.skills.find(skill=>skill.id===localSkill.id)?.status==='ready','Workshop audit could not approve offline skills');
  click('#modalClose');click('[data-action="sw23-manage"]');
  click('[data-sw23-id="'+distilled.id+'"]');click('[data-sw23-id="'+localSkill.id+'"]');
  click('#sw23-merge');click('#sw23-merge-replace');
  await wait(()=>query('#sw23-edit-merged'),'Merge of distilled sources did not complete');
  const mergedDistill=state.skills.find(skill=>skill.replacesSources&&skill.mergedSources.some(source=>source.id===distilled.id));
  click('#sw23-edit-merged');
  const evidencePanel=[...document.querySelectorAll('.v3-skill-evidence details details')].find(panel=>panel.textContent.includes(distilled.title));
  evidencePanel.closest('details details').parentElement.open=true;
  evidencePanel.open=true;
  await wait(()=>evidencePanel.textContent.includes('3 / 3 条证据位置有效'),'Merged card lost usable source evidence');
  click('#modalClose');
  click(distill);click('#sw8Basic');
  await wait(()=>!query('#modalClose'),'Rerunning offline distillation did not finish');
  assert(!state.skills.some(skill=>skill.dedupKey===localSkill.dedupKey),'Offline rerun recreated a merged source card');
  click(distill);input('#sw8Sampling','opening');input('#sw8Focus','scene');
  click('#sw8NewConsent');click('#sw8Rerun');
  await wait(()=>query('#sw8ResumeConsent'),'Could not prepare a fresh deep distillation');
  click('#sw8ResumeConsent');click('#sw8Resume');
  await wait(()=>state.distillationJobs.filter(job=>job.docId===referenceId&&job.status==='complete').length===2,'Deep distillation rerun did not complete');
  assert(state.distillationJobs.filter(job=>job.docId===referenceId).every(job=>job.outputSkillIds.join()===mergedDistill.id)&&
    !state.skills.some(skill=>skill.analysisType==='evidence-pipeline'&&skill.sourceId===referenceId),
    'Deep rerun recreated a merged source or failed to link its replacement');
  click('#modalClose');
  click('[data-action="sw8-preset-new"]');input('[name="presetName"]','独立技能配方');click('[data-sw8-skill]');click('#sw8SavePreset');
  await wait(()=>state.skillPresets.some(row=>row.projectId===null),'An empty shelf could not save a skill recipe');
  go('home');
  click('[data-action="new-project"]');
  assert(query('#saveProject'),'Empty shelf can no longer create a book');
  input('[name="title"]','真实存储删除验证');
  storageFailure=true;
  click('#saveProject');
  await wait(()=>query('#modalRoot [role="status"]')?.textContent.startsWith('保存失败'),'Book creation hid a storage failure');
  assert(!state.projects.length && query('[name="title"]').value==='真实存储删除验证','Failed creation changed the shelf or discarded the form');
  storageFailure=false;
  click('#saveProject');
  await wait(()=>tab==='contents' && project()?.title==='真实存储删除验证','Book creation retry failed');
  storageFailure=true;
  click('#sw15-add');click('#sw15-add-chapter');
  await wait(()=>query('#toastRoot')?.textContent.includes('新建章节失败'),'Chapter creation hid a storage failure');
  assert(tab==='contents' && chapters().length===1,'Failed chapter creation changed the directory');
  storageFailure=false;
  click('#sw15-add');click('#sw15-add-chapter');
  await wait(()=>tab==='write' && chapters().length===2,'Chapter creation retry did not open the new chapter');
  const persistedBook=project().id;
  go('home');
  query('.book-card').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
  click('[data-sw18-item="edit"]');input('[name="title"]','改名后再删除');
  storageFailure=true;click('#saveProject');
  await wait(()=>query('#modalRoot [role="status"]')?.textContent.startsWith('保存失败'),'Book rename hid a storage failure');
  assert(project().title==='真实存储删除验证','Failed rename changed the live book');
  storageFailure=false;click('#saveProject');
  await wait(()=>tab==='home' && project()?.title==='改名后再删除','Book rename retry failed');
  assert(JSON.parse(localStorage.getItem('storyweave_fallback')).projects[0].title==='改名后再删除','Book rename was not persisted');
  query('.book-card').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
  click('[data-sw18-item="delete"]');click('#sw18-confirm');
  await wait(()=>!state.projects.length,'Right-click deletion did not finish');
  assert(!JSON.parse(localStorage.getItem('storyweave_fallback')).projects.some(row=>row.id===persistedBook),'Right-click deletion was not saved');
  assert(state.documents.some(doc=>doc.id===referenceId) && state.distillationJobs.some(job=>job.docId===referenceId),
    'Deleting a novel removed independent workshop data');
  const backupLocal={id:'restore-local',title:'本机原稿',chapters:[{id:'restore-local-ch',title:'本机章',text:'当前手写正文。',history:[]}]};
  const backupNew={id:'restore-new',title:'备份中的新书',chapters:[{id:'restore-new-ch',title:'第一章',text:'已备份正文。',
    history:[{id:'restore-history',title:'旧稿',text:'较早正文。',at:new Date().toISOString()}]}]};
  const localEndpoint=state.settings.endpoint;
  await StoryWeaveDistillation.persist(next=>{next.projects=[backupLocal];next.selected=backupLocal.id;});
  render();
  const oldCopy={...backupLocal,title:'旧备份的同一本书',chapters:[{...backupLocal.chapters[0],text:'应跳过的旧正文'}]};
  const backupFixture={version:3,selected:backupNew.id,projects:[oldCopy,backupNew],skills:[],
    characters:[{id:'restore-person',projectId:backupNew.id,name:'备份人物'}],settings:{endpoint:'https://restore.test/v1',model:'恢复模型'}};
  const loadBackup = data=>selectFile('#projectImport',new File([JSON.stringify(data)],'小说备份.json',{type:'application/json'}));
  click('[data-action=shelf-menu]');click('[data-shelf-command=settings]');click('[data-sw17-settings="backup"]');
  assert(query('#sw17-import') && query('#sw17-export'),'Backup settings lost their import or export entry');
  loadBackup(backupFixture);
  await wait(()=>query('#sw22-restore-backup'),'Import did not open a preview');
  assert(query('.sw22-backup-list').textContent.includes('备份中的新书') &&
    query('#sw22-backup-summary').textContent.includes('跳过 1 部') && state.projects.length===1,'Preview did not identify a duplicate or changed state early');
  click('#modalClose');
  assert(state.projects.length===1 && state.projects[0].chapters[0].text==='当前手写正文。','Closing preview modified the local manuscript');
  loadBackup(backupFixture);
  await wait(()=>query('#sw22-restore-backup'),'Backup could not be selected twice');
  storageFailure=true;click('#sw22-restore-backup');
  await wait(()=>query('#sw22-backup-status')?.textContent.includes('测试写入故障'),'Failed append did not report the write error');
  assert(state.projects.length===1 && !state.characters.some(row=>row.id==='restore-person'),'Failed append partially published incoming records');
  storageFailure=false;click('#sw22-restore-backup');
  await wait(()=>state.projects.length===2 && !query('#modalClose'),'Append could not be retried');
  assert(state.projects[0].chapters[0].text==='当前手写正文。' && state.projects[1].chapters[0].history[0].text==='较早正文。' &&
    state.characters.some(row=>row.id==='restore-person') && state.selected===backupLocal.id && state.settings.endpoint===localEndpoint &&
    state.documents.some(doc=>doc.id===referenceId),'Append lost original data, imported history, related characters, or settings');
  loadBackup({...backupFixture,projects:[{...backupNew,id:'restore-colliding'}]});
  await wait(()=>query('#sw22-restore-backup'),'Collision fixture did not open preview');
  assert(query('#sw22-restore-backup').disabled && query('#sw22-backup-summary').textContent.includes('重复的章节 ID'),
    'Append allowed an ambiguous chapter ID to be imported');
  click('#modalClose');
  loadBackup({...backupFixture,projects:[backupNew]});
  await wait(()=>query('#sw22-restore-backup'),'Replace fixture did not open preview');
  click('[name="sw22-restore-mode"][value="replace"]');
  assert(query('#sw22-restore-backup').disabled && !query('#sw22-replace-check').hidden &&
    query('#sw22-backup-first'),'Whole restore did not require explicit confirmation and offer current backup');
  click('#sw22-confirm-replace');
  storageFailure=true;click('#sw22-restore-backup');
  await wait(()=>query('#sw22-backup-status')?.textContent.includes('测试写入故障'),'Failed restore did not report the write error');
  assert(state.projects.length===2 && state.settings.endpoint===localEndpoint,'Failed whole restore replaced existing state');
  storageFailure=false;click('#sw22-restore-backup');
  await wait(()=>state.projects.length===1 && state.selected===backupNew.id && !query('#modalClose'),'Whole restore did not replace the library');
  const savedRestore=JSON.parse(localStorage.getItem('storyweave_fallback'));
  assert(savedRestore.projects[0].id===backupNew.id && savedRestore.settings.endpoint==='https://restore.test/v1',
    'Whole restore did not persist the incoming library and model configuration');
  const technique={title:'用动作打断沉默',category:'对白',description:'把转折放进行为里。',source:'同一来源',rules:['观察动作','减少解释']};
  await StoryWeaveDistillation.persist(next=>{
    next.skills=[
      {...technique,id:'batch-original',status:'ready',version:2},
      {...technique,id:'batch-duplicate',status:'candidate',history:[{at:'2026-11-08',status:'candidate',title:'较早的写法'}]},
      {...technique,id:'batch-keep-unselected',title:'另一组相同技能',status:'ready'},
      {...technique,id:'batch-duplicate-unselected',title:'另一组相同技能',status:'ready'},
      {...technique,id:'batch-other',title:'留出对白空白',rules:['减少解释','保留停顿'],status:'candidate'},
      {...technique,id:'batch-bad',title:'失去原文的候选',sourceId:'missing-doc',analysisType:'evidence-pipeline',status:'candidate'}
    ];
    next.skillPresets=[{id:'batch-linked',projectId:next.selected,name:'已有配方',skillIds:['batch-duplicate','batch-original']}];
    next.distillationJobs=[{id:'batch-linked-job',projectId:next.selected,docId:'missing-doc',status:'complete',outputSkillIds:['batch-duplicate'],samples:[]}];
    next.writingFeedback=[{id:'batch-feedback',projectId:next.selected,skillId:'batch-duplicate'}];
  });
  go('skills');click('[data-action="sw23-audit"]');
  assert(query('[data-sw23-id="batch-other"]').checked&&query('#sw23-filter').value==='candidate',
    'Workshop audit did not open with pending skills selected');
  click('#modalClose');click('[data-action="sw23-manage"]');
  const skillSearch=query('#sw23-search');
  skillSearch.value='保留停顿';skillSearch.dispatchEvent(new Event('input'));
  click('#sw23-select-pending');
  assert(query('[data-sw23-id="batch-other"]').checked&&!query('[data-sw23-id="batch-bad"]').checked,
    'Filtered bulk selection included a hidden candidate');
  skillSearch.value='失去原文';skillSearch.dispatchEvent(new Event('input'));
  assert(query('#sw23-selection').textContent.includes('含筛选外 1 项'),'Filter concealed the existing selection count');
  const skillFilter=query('#sw23-filter');
  skillFilter.value='ready';skillFilter.dispatchEvent(new Event('change'));
  assert(!query('#sw23-empty').hidden,'No-results state was not shown');
  skillFilter.value='all';skillFilter.dispatchEvent(new Event('change'));
  skillSearch.value='';skillSearch.dispatchEvent(new Event('input'));
  click('#sw23-clear');
  click('#sw23-find-duplicates');
  assert(query('#sw23-duplicates').textContent.includes('2 项重复')&&state.skills.length===6&&query('#sw23-delete-duplicates').disabled,
    'Duplicate scan changed data, grouped a distinct skill, or selected deletions automatically');
  click('[data-sw23-duplicate="0"]');
  storageFailure=true;click('#sw23-delete-duplicates');
  await wait(()=>query('#modalRoot [role="status"]')?.textContent.includes('测试写入故障'),'Duplicate deletion did not report save failure');
  assert(state.skills.length===6 && state.skillPresets[0].skillIds.includes('batch-duplicate'),'Failed duplicate removal broke related data');
  storageFailure=false;click('#sw23-delete-duplicates');
  await wait(()=>state.skills.length===5 && query('#sw23-find-duplicates'),'Duplicate removal did not complete');
  assert(state.skills.some(skill=>skill.id==='batch-duplicate-unselected'),'Deduplication deleted an unselected group');
  assert(state.skills.find(skill=>skill.id==='batch-original').history[0].title==='较早的写法' &&
    state.skillPresets[0].skillIds.join()==='batch-original' && state.distillationJobs[0].outputSkillIds.join()==='batch-original' &&
    state.writingFeedback[0].skillId==='batch-original','Duplicate removal lost history or related recipe/job references');
  click('#sw23-find-duplicates');click('#sw23-select-duplicates');
  await StoryWeaveDistillation.persist(next=>{
    next.skills=next.skills.map(skill=>skill.id.endsWith('-unselected')?{...skill,rules:['重新编辑后的规则']}:skill);
  });
  click('#sw23-delete-duplicates');
  await wait(()=>query('#modalRoot [role="status"]')?.textContent.includes('技能库已变化'),'Stale duplicate preview was accepted');
  assert(state.skills.some(skill=>skill.id==='batch-duplicate-unselected'),'Stale preview deleted a changed skill');
  click('#sw23-select-pending');click('#sw23-approve');
  await wait(()=>query('#modalRoot [role="status"]')?.textContent.includes('缺少有效证据'),'Bulk audit did not report an invalid candidate');
  assert(state.skills.find(skill=>skill.id==='batch-other').status==='ready' &&
    state.skills.find(skill=>skill.id==='batch-bad').status==='candidate','Bulk audit approved a skill without evidence or skipped a valid candidate');
  click('#sw23-clear');
  click('[data-sw23-id="batch-original"]');click('[data-sw23-id="batch-other"]');
  click('#sw23-combine');
  await wait(()=>state.skillPresets.length===2 && query('#sw23-merge')&&!query('#sw23-merge').disabled,'One-click combination did not retain its selection');
  assert(state.skillPresets[1].projectId===null&&state.skillPresets[1].skillIds.join()==='batch-original,batch-other',
    'One-click combination did not create a reusable recipe');
  click('#sw23-combine');
  await wait(()=>query('#modalRoot [role="status"]')?.textContent.includes('已有相同组合'),'Identical combination was not recognized');
  assert(state.skillPresets.length===2,'Identical combination created a duplicate recipe');
  click('#sw23-merge');
  assert(query('#sw23-merge-preview').textContent.includes('保留停顿')&&state.skills.length===5,
    'Merge preview modified data or omitted a selected rule');
  click('#sw23-merge-copy');
  await wait(()=>query('#sw23-edit-merged'),'Skill merge did not offer to open the combined skill');
  const merged=state.skills.find(skill=>skill.mergedSources?.length===2);
  assert(merged.status==='candidate' && merged.rules.join()===['观察动作','减少解释','保留停顿'].join() &&
    state.skills.some(skill=>skill.id==='batch-original'),'Merge lost rules or originals');
  click('#sw23-edit-merged');
  assert(query('#modalRoot [name="title"]').value===merged.title,'Merge shortcut did not open the new draft');
  click('#modalClose');
  click('[data-action="sw23-manage"]');
  click('[data-sw23-id="batch-original"]');click('[data-sw23-id="batch-other"]');click('#sw23-merge');
  input('#sw23-merge-title','对白动作与停顿');
  storageFailure=true;click('#sw23-merge-replace');
  await wait(()=>query('#modalRoot [role="status"]')?.textContent.includes('测试写入故障'),'Failed replacement was not reported');
  assert(state.skills.some(skill=>skill.id==='batch-original')&&state.skillPresets[0].skillIds[0]==='batch-original',
    'Failed merge replaced source cards or references');
  storageFailure=false;click('#sw23-merge-replace');
  await wait(()=>query('#sw23-edit-merged')&&state.skills.some(skill=>skill.title==='对白动作与停顿'),'Replacement merge did not save');
  const consolidated=state.skills.find(skill=>skill.title==='对白动作与停顿');
  assert(consolidated.status==='ready'&&consolidated.mergedSources.some(source=>source.id==='batch-original'&&source.history[0].title==='较早的写法')&&
    !state.skills.some(skill=>['batch-original','batch-other'].includes(skill.id))&&state.skillPresets.every(recipe=>recipe.skillIds.join()===consolidated.id)&&
    state.distillationJobs[0].outputSkillIds.join()===consolidated.id&&state.writingFeedback[0].skillId===consolidated.id,
    'Replacement lost provenance, duplicated references, or broke a related feature');
  click('#modalClose');
  const bulkWorkId=state.selected, north='move-north', south='move-south';
  const moveChapter=(key,title,volumeId)=>({id:key,title,text:title+'的正文。',volumeId,history:[]});
  await StoryWeaveDistillation.persist(next=>{
    next.projects=next.projects.map(work=>work.id===bulkWorkId?{...work,volumes:[{id:north,title:'北卷'},{id:south,title:'南卷'}],
      chapters:[moveChapter('move-a','查找甲章',north),
        {...moveChapter('move-b','乙章',north),history:[{id:'move-history',text:'原稿'}]},
        moveChapter('move-e','留在北卷',north),moveChapter('move-c','南卷插入点',south)]}:work);
    next.sceneCards=[...(next.sceneCards||[]),{id:'move-scene',projectId:bulkWorkId,chapterId:'move-b',title:'随章节定位的场景'}];
  });
  go('contents');
  click('.sw16-directory-tools summary');click('[data-sw15-volume="'+south+'"]');
  input('#sw29-volume-before',north);click('#sw15-save-volume');
  await wait(()=>chapters()[0]?.id==='move-c'&&!query('#modalClose'),'Volume reorder did not change the chapter order');
  assert(project().volumes[0].id===south && bookText(project()).indexOf('【南卷】')<bookText(project()).indexOf('【北卷】'),
    'Volume reorder did not reach manuscript export');
  const foldNorth='[data-sw35-fold="'+north+'"]';
  const northRows=()=>query('[data-sw14-chapter="move-a"]').closest('[data-sw35-rows]');
  assert(!query('[data-sw15-move]')&&!query('[data-sw17-remove]'),'Chapter actions appeared in the directory rows');
  click('[data-sw35-menu="move-b"]');click('#sw35-plan');
  assert(query('#modalRoot .modal').textContent.includes('乙章')&&tab==='contents','Chapter blueprint opened the wrong chapter or left the directory');
  click('#modalClose');
  click(foldNorth);
  assert(northRows().hidden&&query(foldNorth).getAttribute('aria-expanded')==='false','Named volume did not collapse');
  go('world');go('contents');
  assert(northRows().hidden,'Returning to the directory lost the volume fold');
  click('.sw19-directory-search summary');search('#sw19-directory-query','查找甲章');
  assert(!northRows().hidden,'Search did not reveal a matching chapter in a collapsed volume');
  click('#sw19-clear-query');
  assert(northRows().hidden,'Clearing the search reset the volume fold');
  click(foldNorth);
  click('.sw16-directory-tools summary');click('#sw29-start');
  click('[data-sw29-chapter="move-b"]');
  click(foldNorth);click('#sw29-select-visible');
  assert(query('#sw29-count').textContent.includes('已选 2 章 · 折叠卷内 1 章')&&
    query('[data-sw29-chapter="move-c"]').checked&&!query('[data-sw29-chapter="move-a"]').checked,
    'Select visible crossed a collapsed volume or forgot its prior selection');
  click('#sw29-clear');click(foldNorth);
  click('[data-sw29-chapter="move-b"]');
  search('#sw19-directory-query','查找甲章');
  click('#sw29-select-visible');
  assert(query('#sw29-count').textContent.includes('已选 2 章 · 筛选外 1 章') && query('[data-sw29-chapter="move-a"]').checked,
    'Filtered selection lost checked chapters or included unrelated rows');
  click('#sw29-move');input('#sw15-target-volume',south);input('#sw19-before-chapter','move-c');
  storageFailure=true;click('#sw15-move-chapter');
  await wait(()=>!query('#sw15-move-chapter')?.disabled&&notices.at(-1)?.includes('测试写入故障'),'Bulk move failed silently');
  assert(chapters().map(ch=>ch.id).join()==='move-c,move-a,move-b,move-e','Failed bulk move changed the directory');
  storageFailure=false;click('#sw15-move-chapter');
  await wait(()=>chapters()[0]?.id==='move-a'&&!query('#modalClose'),'Bulk move could not be retried');
  assert(chapters().map(ch=>ch.id).join()==='move-a,move-b,move-c,move-e' && chapters()[1].volumeId===south &&
    chapters()[1].history[0].id==='move-history' && state.sceneCards.some(row=>row.id==='move-scene'&&row.chapterId==='move-b'),
    'Bulk move changed selection order, history, or chapter links');
  assert(query('#sw29-selection').hidden&&query('#sw19-directory-query').value==='查找甲章','Bulk move reset the search or left selection mode open');
  click('#sw19-clear-query');
  storageFailure=true;click('[data-sw35-add="'+south+'"]');
  await wait(()=>!query('[data-sw35-add="'+south+'"]').disabled&&notices.at(-1)?.includes('新建章节失败'),'Failed volume chapter creation did not report the error');
  assert(tab==='contents'&&chapters().length===4,'Failed volume chapter creation changed the work');
  storageFailure=false;click('[data-sw35-add="'+south+'"]');
  await wait(()=>tab==='write'&&chapters().length===5,'Volume chapter was not created and opened');
  const addedChapter=chapter();
  assert(addedChapter.volumeId===south&&chapters().map(ch=>ch.id).join()===['move-a','move-b','move-c',addedChapter.id,'move-e'].join(),
    'The new chapter did not append to the chosen volume');
  const savedVolumeBook=JSON.parse(localStorage.getItem('storyweave_fallback')).projects.find(work=>work.id===bulkWorkId);
  assert(savedVolumeBook.chapters.some(ch=>ch.id===addedChapter.id&&ch.volumeId===south),'The new volume chapter was not saved');
  assert(!uiErrors.length, uiErrors.join('\n'));
  function queryAllCards(){return document.querySelectorAll('[data-sw14-card]').length;}
  function queryAllTasks(){return document.querySelectorAll('[data-sw15-task]').length;}
  function openTool(action){click('[data-action="v15-tools"]');click('[data-sw15-tool="'+action+'"]');}
}

const markup = html.replace('</body>', () => `<output id="storyweave-test">RUNNING</output><script>
  window.captureAtlas = ${Boolean(process.env.STORYWEAVE_CAPTURE && !['focus','ai','tools','night','shelf','shelf-resume','contents','settings','books','reference','atlas-bindings'].includes(process.env.STORYWEAVE_CAPTURE_STAGE))};
  window.captureAtlasMobile = ${process.env.STORYWEAVE_CAPTURE_STAGE === 'atlas-mobile'};
  window.captureAtlasBindings = ${process.env.STORYWEAVE_CAPTURE_STAGE === 'atlas-bindings'};
  window.captureFocus = ${process.env.STORYWEAVE_CAPTURE_STAGE === 'focus'};
  window.captureAI = ${process.env.STORYWEAVE_CAPTURE_STAGE === 'ai'};
  window.captureTools = ${process.env.STORYWEAVE_CAPTURE_STAGE === 'tools'};
  window.captureNight = ${process.env.STORYWEAVE_CAPTURE_STAGE === 'night'};
  window.captureShelf = ${process.env.STORYWEAVE_CAPTURE_STAGE === 'shelf'};
  window.captureShelfResume = ${process.env.STORYWEAVE_CAPTURE_STAGE === 'shelf-resume'};
  window.captureContents = ${process.env.STORYWEAVE_CAPTURE_STAGE === 'contents'};
  window.captureSettings = ${process.env.STORYWEAVE_CAPTURE_STAGE === 'settings'};
  window.captureBookActions = ${process.env.STORYWEAVE_CAPTURE_STAGE === 'books'};
  window.captureReference = ${process.env.STORYWEAVE_CAPTURE_STAGE === 'reference'};
  (${interactions.toString()})().then(() => {
    document.getElementById('storyweave-test').textContent = 'PASS-V11-INTERACTIONS';
    if (storageTestMode === 'indexeddb') fetch('/__test-result',{method:'POST',body:'PASS-V11-INTERACTIONS'});
  }, error => {
    document.getElementById('storyweave-test').textContent = 'FAIL: ' + error.message;
    if (storageTestMode === 'indexeddb') fetch('/__test-result',{method:'POST',body:'FAIL: ' + error.message});
  });
</script></body>`);

async function runIndexedDb() {
  let report;
  const outcome = new Promise(resolve => { report = resolve; });
  const server = createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/__test-result') {
      let result = '';
      req.setEncoding('utf8');
      req.on('data', chunk => { result = (result + chunk).slice(0, 1000); });
      req.on('end', () => { res.end(); report(result); });
      return;
    }
    const url = new URL(req.url, 'http://127.0.0.1');
    const file = path.resolve(temp, '.' + url.pathname);
    if (!file.startsWith(temp + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    const contentTypes = {'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'};
    res.setHeader('Content-Type', contentTypes[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).on('error',error=>res.destroy(error)).pipe(res);
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const child = spawn(browser, ['--headless=new', '--no-first-run', '--no-sandbox', '--disable-gpu',
    '--disable-crash-reporter', '--disable-crashpad-for-testing', '--disable-background-networking',
    '--user-data-dir=' + path.join(temp, 'profile'),
    'http://127.0.0.1:' + server.address().port + '/index.html'], {windowsHide:true, stdio:'ignore'});
  child.on('error', error => report(error.message));
  child.on('exit', code => report('Chromium exited: ' + code));
  const childClosed = new Promise(resolve => child.once('close', resolve));
  const timer = setTimeout(() => report('No IndexedDB result from Chromium'), 15000);
  try {
    assert.equal(await outcome, 'PASS-V11-INTERACTIONS');
    console.log('PASS Chromium: real IndexedDB transaction and queue recovery');
  } finally {
    clearTimeout(timer);
    child.kill();
    const serverClosed = new Promise(resolve => server.close(resolve));
    server.closeAllConnections();
    await Promise.all([childClosed,serverClosed]);
  }
}

async function run() {
  const fixture = path.join(temp, 'index.html');
  fs.cpSync(web, temp, {recursive:true});
  fs.writeFileSync(fixture, markup, 'utf8');
  if (process.env.STORYWEAVE_STORAGE_TEST === 'indexeddb') return runIndexedDb();
  const args = ['--headless=new', '--dump-dom', '--virtual-time-budget=10500', '--window-size=390,844',
    '--no-first-run', '--no-sandbox', '--disable-gpu', '--disable-crash-reporter', '--disable-crashpad-for-testing',
    '--disable-background-networking', '--user-data-dir=' + path.join(temp, 'profile'), pathToFileURL(fixture).href];
  if (process.env.STORYWEAVE_CAPTURE) {
    args.push('--screenshot=' + path.resolve(process.env.STORYWEAVE_CAPTURE));
    if (!['focus','tools','night','shelf','shelf-resume','contents','settings','books','reference','atlas-mobile','atlas-bindings'].includes(process.env.STORYWEAVE_CAPTURE_STAGE)) args.push('--window-size=1280,1000');
  }
  const child = spawn(browser, args, {windowsHide:true, stdio:['ignore', 'pipe', 'pipe']});
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
  const timer = setTimeout(() => child.kill(), 35000);
  try {
    await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  } finally {
    clearTimeout(timer);
  }
  const outcome = stdout.match(/<output id="storyweave-test">([^<]*)<\/output>/)?.[1];
  assert.equal(outcome, 'PASS-V11-INTERACTIONS', outcome || stderr);
  console.log('PASS Chromium: batch skill review, combinations, deduplication and merge, backup append and restore, and previous writing flows');
}

run().finally(() => {
  const resolved = fs.realpathSync(temp);
  assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
  assert(path.basename(resolved).startsWith('storyweave-v11-ui-'));
  try { fs.rmSync(resolved, {recursive:true, force:true, maxRetries:4}); }
  catch (error) { console.warn('Temporary browser profile cleanup: ' + error.code); }
}).catch(error => { console.error(error); process.exitCode = 1; });
