/* V0.4 · ON-PHONE MODEL ROUTING
   IRIDIS must be installed on the SAME Android phone. The native bridge only
   contacts fixed loopback endpoints and never exposes arbitrary HTTP requests.
   Generated text stays a suggestion until the writer accepts it. */
const SW_LOCAL_BASE='http://127.0.0.1:8686';
const swLocalPending=new Map();
let swLocalCounter=0;
window.__storyLocalAiReceive=function(requestId,ok,body){
  const pending=swLocalPending.get(String(requestId));
  if(!pending)return;
  swLocalPending.delete(String(requestId));
  clearTimeout(pending.timer);
  if(!ok){pending.reject(new Error(String(body||'本机模型连接失败')));return;}
  try{pending.resolve(JSON.parse(body));}catch(e){pending.reject(new Error('本机模型返回了无法解析的数据'));}
};
function swLocalRequest(route,payload={},apiKey=''){
  if(!['health','models','chat'].includes(route))return Promise.reject(new Error('不支持的本地接口'));
  // Android native bridge prevents WebView file:// CORS and browser Origin
  // authentication problems. Only connections to 127.0.0.1:8686 are allowed.
  if(window.StoryBridge&&typeof window.StoryBridge.localAiRequest==='function'){
    return new Promise((resolve,reject)=>{
      const requestId='sw'+(++swLocalCounter);
      const timer=setTimeout(()=>{
        swLocalPending.delete(requestId);
        reject(new Error('本机模型响应超时，请检查 IRIDIS 是否保持在后台运行'));
      },185000);
      swLocalPending.set(requestId,{resolve,reject,timer});
      try{window.StoryBridge.localAiRequest(requestId,route,JSON.stringify(payload),apiKey||'');}
      catch(error){clearTimeout(timer);swLocalPending.delete(requestId);reject(new Error('Android 本地模型桥接失败：'+error.message));}
    });
  }
  // Browser-only preview: IRIDIS requires an API key when an Origin is sent.
  // No LAN hostnames or cloud fallback are used in this mode.
  const path={health:'/health',models:'/v1/models',chat:'/v1/chat/completions'}[route];
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),180000);
  return fetch(SW_LOCAL_BASE+path,{
    method:route==='chat'?'POST':'GET',
    headers:{...(route==='chat'?{'Content-Type':'application/json'}:{}),...(apiKey?{'Authorization':'Bearer '+apiKey}:{})},
    ...(route==='chat'?{body:JSON.stringify(payload)}:{}),
    signal:ctrl.signal
  }).then(async response=>{
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data?.error?.message||`本地服务返回 HTTP ${response.status}`);
    return data;
  }).catch(error=>{if(error.name==='AbortError')throw Error('本机模型等待超时');if(error instanceof TypeError)throw Error('浏览器连接受跨域策略限制。请使用 Android 原生安装版，或在 IRIDIS 中配置 API Key。');throw error;}).finally(()=>clearTimeout(timer));
}
function swLocalMode(){return state?.settings?.aiProvider==='iridis';}
const sw04CloudChatAPI=chatAPI;
chatAPI=async function(system,user,maxTokens=1600){
  if(!swLocalMode())return sw04CloudChatAPI(system,user,maxTokens);
  const p=state.settings;
  const contextLimit=Math.max(1200,Math.min(8000,Number(p.localContextChars)||4000));
  // Longer novels can exceed tiny phone-model contexts. Truncation is explicit
  // in the UI: last N characters of current task, plus a bounded system rule.
  const body={model:p.localModel||'default',messages:[
    {role:'system',content:String(system||'').slice(0,1500)},
    {role:'user',content:String(user||'').slice(-contextLimit)}],
    stream:false,max_tokens:Math.min(Number(maxTokens)||800,1024),temperature:0.7,
    enable_thinking:false};
  const data=await swLocalRequest('chat',body,sessionGet('storyweave_local_api_key'));
  const content=data?.choices?.[0]?.message?.content;
  if(typeof content!=='string'||!content.trim())throw Error('本机模型未返回正文。请检查模型是否加载，或换一个更小的模型。');
  return content;
};
function sw04LocalSettingsPanel(root){
  const p=state.settings;
  const panel=document.createElement('section');
  panel.className='sw-local-settings';
  panel.innerHTML=`<div class="sw-local-head"><span class="sw-local-emblem">✦</span><div><div class="tiny-label">ON-DEVICE AI · 仅手机本机</div><h3>手机本地模型</h3></div><span class="sw-local-chip">离线优先</span></div>
   <p>通过同一部手机安装的 IRIDIS 运行 GGUF / MNN / LiteRT 模型，不连接电脑；IRIDIS 必须已经启动模型和本地 API 服务。</p>
   <div class="field"><label>AI 运行方式</label><select name="aiProvider"><option value="cloud">云端 AI</option><option value="iridis">本机 IRIDIS（127.0.0.1:8686）</option></select></div>
   <div class="sw-local-only">
     <div class="sw-local-endpoint">固定本机地址 <code>http://127.0.0.1:8686/v1</code></div>
     <div class="field"><label>手机模型 ID</label><input name="localModel" value="${esc(p.localModel||'default')}" placeholder="default 或模型文件名"/></div>
     <div class="field"><label>上下文输入上限（字数）</label><select name="localContextChars"><option value="2000">2000 · 小内存手机</option><option value="4000">4000 · 推荐</option><option value="6000">6000 · 较大模型</option><option value="8000">8000 · 高内存手机</option></select></div>
     <div class="field"><label>IRIDIS API Key（选填，临时保存）</label><input name="localKey" type="password" autocomplete="off" placeholder="仅在 IRIDIS 开启密钥时填写"/></div>
     <div class="two-col"><button class="button outline" id="swProbeLocal">检查连接</button><button class="button light" id="swListModels">读取手机模型</button></div>
     <div id="swLocalProbe" class="small-note mt12" role="status">模型在手机上运行，正文不发送到云端。仅 Android 应用版提供原生桥接；网页版可能受跨域限制。</div>
     <div id="swLocalModels" class="sw-local-model-list"></div>
     <div class="alert">本机模式下写作请求只发往固定的手机回环地址。IRIDIS 若未启动 API 或被系统结束后台进程，会导致请求失败；不会自动切换到云端。</div>
   </div>
   <button class="button primary block mt12" id="swSaveLocal">保存模型配置</button>`;
  const old=root.querySelector('.form-actions');
  if(old)old.parentNode.insertBefore(panel,old);else root.append(panel);
  const selector=panel.querySelector('[name="aiProvider"]'),nativeOnly=panel.querySelector('.sw-local-only');
  selector.value=p.aiProvider==='iridis'?'iridis':'cloud';
  panel.querySelector('[name="localContextChars"]').value=String(p.localContextChars||4000);
  const refresh=()=>{nativeOnly.style.display=selector.value==='iridis'?'block':'none'};
  refresh();selector.onchange=refresh;
  const persist=()=>{
    p.aiProvider=selector.value;
    p.localModel=panel.querySelector('[name="localModel"]').value.trim()||'default';
    p.localContextChars=Number(panel.querySelector('[name="localContextChars"]').value);
    sessionPut('storyweave_local_api_key',panel.querySelector('[name="localKey"]').value.trim());
    queueSave();
  };
  panel.querySelector('#swSaveLocal').onclick=()=>{persist();closeModal();render();toast(p.aiProvider==='iridis'?'手机本地模型已选中':'已切换到云端 AI')};
  const oldSave=root.querySelector('#saveSettings');
  if(oldSave)oldSave.addEventListener('click',persist,true);
  const note=panel.querySelector('#swLocalProbe'),list=panel.querySelector('#swLocalModels');
  const run=async(route)=>{
    note.textContent='正在检查本机 IRIDIS…';
    const key=panel.querySelector('[name="localKey"]').value.trim();
    try{
      const data=await swLocalRequest(route,{},key);
      if(route==='health'){note.textContent='已连接手机 IRIDIS。'+(data?.model?'当前模型：'+data.model:'可以尝试读取模型列表。');return;}
      const models=Array.isArray(data.data)?data.data:[];
      note.textContent=models.length?`找到 ${models.length} 个已安装模型。选择模型后保存设置。`:'已连接，但没有找到模型。请先在 IRIDIS 中加载 GGUF。';
      list.innerHTML='';
      models.forEach(item=>{
        const name=String(item?.id||'').slice(0,170);if(!name)return;
        const button=document.createElement('button');button.className='sw-local-model-choice';button.type='button';button.textContent=name;
        button.onclick=()=>{panel.querySelector('[name="localModel"]').value=name;note.textContent='已选：'+name+'，请点击保存模型配置';};
        list.append(button);
      });
    }catch(err){note.textContent='连接失败：'+err.message+'。请在 IRIDIS → 设置 → API 服务中开启。';}
  };
  panel.querySelector('#swProbeLocal').onclick=()=>run('health');
  panel.querySelector('#swListModels').onclick=()=>run('models');
}
const sw04OpenSettings=openSettings;
openSettings=function(){sw04OpenSettings();const root=document.querySelector('#modalRoot .modal');if(root)sw04LocalSettingsPanel(root)};
const sw04WritePage=writePage;
writePage=function(){const html=sw04WritePage();if(!project())return html;
  const local=swLocalMode(),banner=`<div class="sw-ai-source">${local?'✦ 手机本地 AI · IRIDIS · 仅本机推理':'✦ 云端 AI · 可在设置中切换为手机本地模型'}<button class="text-button" data-action="ai-source-settings">切换</button></div>`;
  return html.replace('<div class="writing-top">',banner+'<div class="writing-top">')};
const sw04Act=act;
act=function(action,x){if(action==='ai-source-settings')return openSettings();return sw04Act(action,x)};
