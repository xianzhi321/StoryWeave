(() => {
  'use strict';
  const credentialPrefix = 'storyweave.cloud.key:';
  const legacyName = 'storyweave_api_key';
  const deepSeekBase = 'https://api.deepseek.com';
  const deepSeekDefault = 'deepseek-flash';
  const pending = new Map();
  let requestNumber = 0;
  let legacyBase;

  function baseAddress(input) {
    let url;
    try { url = new URL(input.trim()); } catch (_) { throw Error('请输入完整的 API 地址'); }
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
        url.username || url.password || url.search || url.hash) {
      throw Error('接口须使用 HTTPS 或手机回环地址，且地址中不能包含密钥、查询参数或片段');
    }
    const path = url.pathname.replace(/\/+$/, '').replace(/\/(?:chat\/completions|models)$/, '');
    const result = url.origin + path.replace(/\/+$/, '');
    if (result.length > 2048) throw Error('API 地址过长');
    return result;
  }
  function validatedKey(key) {
    if (key.length > 4096 || /[^!-~]/.test(key)) throw Error('本机校验 · API Key 含内部空白或非标准字符，请从控制台复制完整密钥');
    return key;
  }
  function unwrapKey(text) {
    const pairs = {'"':'"',"'":"'",'“':'”','‘':'’','「':'」'};
    return text.length > 1 && pairs[text[0]] === text.at(-1) ? text.slice(1,-1).trim() : text;
  }
  function normalizePastedKey(input) {
    if (!input) return '';
    let key = unwrapKey(input.replace(/[\u00ad\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g,'').trim());
    key = unwrapKey(key.replace(/^(?:authorization\s*:\s*)?bearer(?:\s+|$)/i,'').trim());
    if (!key || /[•●…]/.test(key) || /^[*·]+$/.test(key) || /^sk-[A-Za-z0-9_-]*\*{3,}$/.test(key)) {
      throw Error('本机校验 · 请复制控制台提供的完整 API Key，或保留已保存的密钥');
    }
    return validatedKey(key);
  }
  const isDeepSeek = base => base === deepSeekBase || base === deepSeekBase + '/v1';
  function bindLegacyEndpoint(endpoint) {
    if (legacyBase !== undefined) return;
    try { legacyBase = baseAddress(endpoint); } catch (_) { legacyBase = ''; }
  }
  function legacyKey(base) {
    return legacyBase === base ? sessionGet(legacyName) || '' : '';
  }
  const nativeBridge = () => typeof window.StoryBridge?.cloudAiRequest === 'function' ? window.StoryBridge : null;
  function keyState(base) {
    try {
      const bridge = nativeBridge();
      if (bridge) {
        const status = bridge.cloudKeyState(base);
        if (status !== 'missing') return status;
      } else {
        if (sessionStorage.getItem(credentialPrefix + base)) return 'session';
        if (localStorage.getItem(credentialPrefix + base)) return 'saved';
      }
    } catch (_) { return 'unavailable'; }
    return legacyKey(base) ? 'legacy' : 'missing';
  }
  function storeKey(base,key,remember) {
    validatedKey(key);
    const bridge = nativeBridge();
    if (bridge) {
      if (!bridge.saveCloudKey(base,key,remember)) throw Error('Android 未能保存或清除 API Key');
    } else {
      const name = credentialPrefix + base;
      if (key && remember) localStorage.setItem(name,key);
      else localStorage.removeItem(name);
      if (key && !remember) sessionStorage.setItem(name,key);
      else sessionStorage.removeItem(name);
    }
    if (legacyKey(base)) sessionPut(legacyName,'');
  }
  function keyForRequest(base,draft) {
    if (draft) return validatedKey(draft);
    const bridge = nativeBridge();
    const status = keyState(base);
    if (status === 'legacy') return normalizePastedKey(legacyKey(base));
    if (bridge || status === 'missing') return '';
    if (status === 'unavailable') throw Error('无法访问浏览器密钥存储，请重新输入 API Key');
    const name = credentialPrefix + base;
    return validatedKey(sessionStorage.getItem(name) || localStorage.getItem(name) || '');
  }
  function readResponse(route,status,text) {
    if (status === 0) throw Error(text || '无法连接服务商');
    if (status < 200 || status >= 300) {
      const messages = {
        400:'模型 ID 或接口参数被拒绝，请核对服务商要求',
        401:'鉴权失败，请检查当前地址对应的 API Key',
        403:'访问被拒绝，请检查密钥权限',
        404:route === 'models' ? '未找到模型列表。可手填模型 ID 后测试' : '未找到模型或对话接口，请核对 API 地址和模型 ID',
        405:'接口不支持此操作。若拉取列表失败，可手填模型 ID 后测试',
        429:'请求受限，请检查额度或稍后再试'
      };
      const detail = messages[status] || (status >= 300 && status < 400 ? '接口发生重定向，请填写最终 API 地址' : '服务商暂时无法完成请求');
      throw Error(`HTTP ${status} · ${detail}`);
    }
    try { return JSON.parse(text); } catch (_) { throw Error('服务商返回的内容不是 JSON，请确认填写的是 API 地址'); }
  }
  window.__storyCloudReceive = (id,status,text) => {
    const item = pending.get(id);
    if (!item) return;
    pending.delete(id);
    clearTimeout(item.timer);
    item.resolve({status,text});
  };
  async function request(base,route,draft='',payload=null) {
    const key = keyForRequest(base,draft), bridge = nativeBridge();
    const chat = route === 'chat';
    if (bridge) {
      const id = 'cloud' + (++requestNumber);
      const response = await new Promise((resolve,reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(Error('云端 AI 响应超时'));
        },chat ? 100000 : 28000);
        pending.set(id,{resolve,timer});
        try { bridge.cloudAiRequest(id,base,route,chat ? JSON.stringify(payload) : '',key); }
        catch (_) {
          clearTimeout(timer);
          pending.delete(id);
          reject(Error('Android 云端连接桥接失败'));
        }
      });
      return readResponse(route,response.status,response.text);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(),chat ? 90000 : 20000);
    try {
      const response = await fetch(base + (chat ? '/chat/completions' : '/models'),{
        method:chat ? 'POST' : 'GET',credentials:'omit',redirect:'error',cache:'no-store',
        headers:{Accept:'application/json',...(key ? {Authorization:'Bearer '+key} : {}),
          ...(chat ? {'Content-Type':'application/json'} : {})},
        ...(chat ? {body:JSON.stringify(payload)} : {}),signal:controller.signal
      });
      return readResponse(route,response.status,response.ok ? await response.text() : '');
    } catch (error) {
      if (error.name === 'AbortError') throw Error('服务商响应超时');
      if (error instanceof TypeError) throw Error('浏览器无法连接服务商，请检查网络、重定向和跨域限制');
      throw error;
    } finally { clearTimeout(timer); }
  }
  function modelEntries(data) {
    const items = Array.isArray(data) ? data : data?.data ?? data?.models;
    if (!Array.isArray(items)) throw Error('服务商未返回可用的模型列表，可手填模型 ID 后测试');
    const models = new Map();
    for (const item of items) {
      const id = typeof item === 'string' ? item : item?.id;
      if (typeof id !== 'string' || !id.trim() || id.length > 240) continue;
      const name = typeof item?.name === 'string' ? item.name.trim().slice(0,120) : '';
      const model = id.trim();
      if (name || !models.has(model)) models.set(model,name);
    }
    return [...models].sort(([a],[b])=>a.localeCompare(b)).map(([id,name])=>({id,name}));
  }
  async function completion(base,key,model,messages,maxTokens,temperature,purpose) {
    if (!model) throw Error('请先选择或填写模型 ID');
    if (isDeepSeek(base) && /^deepseek$/i.test(model)) throw Error('DeepSeek 是服务商名称。请先拉取并选择具体模型 ID');
    const options = {};
    if (isDeepSeek(base) && (purpose==='probe' || purpose==='distillation')) options.thinking={type:'disabled'};
    if (isDeepSeek(base) && purpose==='distillation') options.response_format={type:'json_object'};
    const data = await request(base,'chat',key,{model,messages,stream:false,max_tokens:maxTokens,temperature,...options});
    const choice = data?.choices?.[0];
    const message = choice?.message;
    const content = message?.content;
    const text = typeof content === 'string' ? content : Array.isArray(content)
      ? content.map(part=>typeof part?.text === 'string' ? part.text : '').join('') : '';
    if (purpose==='distillation' && (choice?.finish_reason==='length' || (!text.trim() && message?.reasoning_content))) {
      throw Error('本段未返回完整分析。可关闭服务商思考模式或调整模型输出上限，再重试本段');
    }
    if (text.trim()) return text;
    if (message?.reasoning_content || choice?.finish_reason === 'length') {
      throw Error('模型未返回正文，可能在输出上限内只生成了推理内容');
    }
    throw Error('模型没有返回正文，请核对所选模型是否支持对话');
  }
  function chat(system,user,maxTokens,purpose) {
    const {endpoint,model} = state.settings;
    return completion(baseAddress(endpoint),'',model,[{role:'system',content:system},{role:'user',content:user}],maxTokens,.75,purpose);
  }

  function markup() {
    const p = state.settings;
    return `<section class="sw-cloud-settings">
      <div class="tiny-label">CLOUD AI</div>
      <div class="field"><label for="swCloudEndpoint">OpenAI 兼容 API 地址</label>
        <input id="swCloudEndpoint" name="endpoint" type="url" autocomplete="off" maxlength="2048" value="${esc(p.endpoint || 'https://api.openai.com/v1')}"></div>
      <button type="button" class="text-button" id="swCloudDeepSeek">使用 DeepSeek 官方地址</button>
      <div class="field"><label for="swCloudKey">API Key</label>
        <input id="swCloudKey" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="4096" placeholder="输入新密钥"></div>
      <label class="sw-cloud-remember"><input type="checkbox" id="swCloudRemember" checked> 长期保存在本机</label>
      <p class="small-note" id="swCloudKeyStatus" role="status"></p>
      <button type="button" class="text-button" id="swCloudClear" hidden>清除此地址的密钥</button>
      <div class="field"><label for="swCloudModel">模型 ID</label>
        <input id="swCloudModel" name="model" autocomplete="off" maxlength="240" value="${esc(p.model || '')}" placeholder="从列表选择或手动输入"></div>
      <div class="sw15-actions"><button type="button" class="button outline" id="swCloudList">拉取模型</button>
        <button type="button" class="button outline" id="swCloudTest">测试连接</button></div>
      <div id="swCloudChoices" hidden>
        <div class="field"><label for="swCloudSearch">筛选模型</label><input type="search" id="swCloudSearch" autocomplete="off"></div>
        <div class="field"><label for="swCloudSelect">选择模型</label><select id="swCloudSelect"></select></div>
      </div>
      <p class="small-note" id="swCloudStatus" role="status"></p>
      <div class="alert">拉取模型只请求列表，测试只发送一句测试提示。密钥按 API 地址保存，不写入作品备份。${nativeBridge()?'Android 使用系统密钥库加密。':'网页版长期保存使用当前浏览器的站点存储，且服务商须允许跨域请求。'}</div>
      <div class="form-actions"><button type="button" class="button primary" id="saveSettings">保存云端配置</button></div>
    </section>`;
  }
  function bind(root) {
    const node = id => root.querySelector('#' + id);
    const endpoint=node('swCloudEndpoint'),key=node('swCloudKey'),model=node('swCloudModel'),remember=node('swCloudRemember');
    const status=node('swCloudStatus'),keyStatus=node('swCloudKeyStatus'),clear=node('swCloudClear');
    const choices=node('swCloudChoices'),search=node('swCloudSearch'),select=node('swCloudSelect');
    const list=node('swCloudList'),test=node('swCloudTest'),save=node('saveSettings');
    let revision=0, models=[], draftBase=readBase(), pasteError='';
    function readBase() {
      try { return baseAddress(endpoint.value); } catch (_) { return ''; }
    }
    function describeKey() {
      const base=readBase();
      const stored = base ? keyState(base) : 'missing';
      keyStatus.textContent = key.value ? (remember.checked ? '已填写新密钥。保存配置后可在下次使用。' : '已填写新密钥。保存后仅在本次会话使用。') : {
        saved:'此地址已保存密钥。留空会继续使用它。',
        session:'此地址已有会话密钥。若要长期保存，请重新输入并勾选。',
        legacy:'已找到旧版会话密钥。保存配置可迁移到本机存储。',
        unavailable:'密钥存储不可用，可输入密钥后测试。',
        missing:'此地址还没有保存密钥。'
      }[stored] || '';
      clear.hidden = !['saved','session','legacy'].includes(stored);
    }
    function reset() {
      revision++;
      choices.hidden=true;
      models=[];
      status.textContent='';
      list.disabled=test.disabled=false;
    }
    function showChoices() {
      const query=search.value.trim().toLowerCase();
      const found=models.filter(({id,name})=>(id+' '+name).toLowerCase().includes(query));
      const label=found.length>150 ? `匹配 ${found.length} 个，显示前 150 个` : `匹配 ${found.length} 个模型`;
      select.replaceChildren(new Option(label,''));
      for (const {id,name} of found.slice(0,150)) select.add(new Option(name && name!==id ? name+' · '+id : id,id));
    }
    function readDraftKey() {
      if (pasteError) throw Error(pasteError);
      return normalizePastedKey(key.value);
    }
    async function check(route) {
      const current=++revision;
      list.disabled=test.disabled=true;
      if (route==='models') choices.hidden=true;
      status.textContent=route==='models'?'正在拉取模型…':'正在发送测试提示…';
      try {
        const base=baseAddress(endpoint.value),draft=readDraftKey();
        if (route==='models') {
          const found=modelEntries(await request(base,route,draft));
          if (current!==revision || !root.isConnected) return;
          models=found;
          search.value='';
          choices.hidden=!models.length;
          showChoices();
          if (isDeepSeek(base) && (!model.value.trim() || /^deepseek$/i.test(model.value.trim())) &&
              models.some(item=>item.id===deepSeekDefault)) {
            model.value=select.value=deepSeekDefault;
            status.textContent=`找到 ${models.length} 个模型，已选中 ${deepSeekDefault}，可以测试或改选。`;
          } else {
            status.textContent=models.length ? `找到 ${models.length} 个模型。选择后可测试并保存。` : '服务商返回了空列表，可手填模型 ID 后测试。';
          }
        } else {
          const tested=model.value.trim();
          await completion(base,draft,tested,[{role:'user',content:'请只回复：叙境就绪'}],128,.2,'probe');
          if (current===revision && root.isConnected) status.textContent='连接与生成测试通过。点击保存后应用。';
        }
      } catch (error) {
        if (current===revision && root.isConnected) status.textContent=error.message;
      } finally {
        if (current===revision) list.disabled=test.disabled=false;
      }
    }
    endpoint.oninput=()=>{
      const next=readBase();
      if (next && next!==draftBase) {key.value='';pasteError='';}
      if (next) draftBase=next;
      reset();
      describeKey();
    };
    node('swCloudDeepSeek').onclick=()=>{
      if (isDeepSeek(readBase())) return;
      model.value='';
      endpoint.value=deepSeekBase;
      endpoint.oninput();
    };
    remember.onchange=describeKey;
    key.oninput=()=>{pasteError='';reset();describeKey();};
    key.onpaste=event=>{
      if (!event.clipboardData) return;
      event.preventDefault();
      const pasted=event.clipboardData.getData('text/plain');
      try {
        key.value=normalizePastedKey(key.value.slice(0,key.selectionStart)+pasted+key.value.slice(key.selectionEnd));
        key.oninput();
      } catch (error) {
        reset();
        status.textContent=pasteError=error.message;
      }
    };
    model.oninput=()=>{if (test.disabled) reset();else status.textContent='';};
    search.oninput=showChoices;
    select.onchange=()=>{if(select.value){model.value=select.value;model.oninput();}};
    list.onclick=()=>check('models');
    test.onclick=()=>check('chat');
    clear.onclick=()=>{
      try {
        storeKey(baseAddress(endpoint.value),'',false);
        key.value='';
        key.oninput();
        status.textContent='已清除此地址的密钥。';
      } catch (_) { status.textContent='无法清除密钥，请重试。'; }
    };
    save.onclick=async()=>{
      save.disabled=true;
      try {
        const base=baseAddress(endpoint.value),name=model.value.trim();
        const newKey=readDraftKey() || (keyState(base)==='legacy' ? normalizePastedKey(legacyKey(base)) : '');
        if (newKey) {
          storeKey(base,newKey,remember.checked);
          key.value='';
          describeKey();
        }
        await StoryWeaveWorkspace.transact(next=>{
          next.settings={...next.settings,endpoint:base,model:name,aiProvider:'cloud'};
        });
        if (root.isConnected) closeModal();
        toast('云端配置已保存');
      } catch (error) { status.textContent=error.message || '保存失败，请重试'; }
      finally { save.disabled=false; }
    };
    describeKey();
  }
  window.StoryWeaveCloud = {markup,bind,chat,bindLegacyEndpoint};
})();
