'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/web/app.js','utf8').replace(/bootstrap\(\);\s*$/,'');
const timers=new Set();
const win={};
const ctx={console,Date,Math,JSON,Intl,URL,AbortController,
  setTimeout:(fn,ms)=>{let t=setTimeout(fn,ms);timers.add(t);return t;},clearTimeout:t=>{clearTimeout(t);timers.delete(t)},
  window:win,document:{},navigator:{},sessionStorage:{getItem(){return null}},fetch:()=>{throw Error('Cloud/browser fetch forbidden in native path')}};
vm.createContext(ctx);vm.runInContext(source,ctx);
const run=s=>vm.runInContext(s,ctx);
run('state=DEMO();state.settings.aiProvider="iridis";state.settings.localModel="default";state.settings.localContextChars=2000;chapterId=project().chapters[0].id;');
assert.ok(run('writePage()').includes('手机本地 AI'));
let calls=[];
win.StoryBridge={localAiRequest:(id,route,body,key)=>{
  calls.push({id,route,body:JSON.parse(body),key});
  setImmediate(()=>win.__storyLocalAiReceive(id,true,JSON.stringify({choices:[{message:{content:'本机输出的原创建议'}}]})));
}};
(async()=>{
  const response=await run('chatAPI("本机系统指令","x".repeat(10000),1800)');
  assert.equal(response,'本机输出的原创建议');
  assert.equal(calls.length,1);
  assert.equal(calls[0].route,'chat');
  assert.equal(calls[0].body.model,'default');
  assert.ok(calls[0].body.messages[1].content.length<=2000);
  assert.equal(calls[0].body.max_tokens,1024);
  assert.equal(calls[0].body.enable_thinking,false);
  let rejected=false;
  try{await run('swLocalRequest("custom-url",{})')}catch(_){rejected=true}
  assert.ok(rejected);
  const java=fs.readFileSync(__dirname+'/android/app/src/main/java/com/storyweave/studio/MainActivity.java','utf8');
  assert.ok(java.includes('http://127.0.0.1:8686'));
  assert.ok(!java.includes('setAllowUniversalAccessFromFileURLs(true)'));
  assert.ok(java.includes('localAiRequest('));
  assert.ok(fs.readFileSync(__dirname+'/android/app/src/main/AndroidManifest.xml','utf8').includes('networkSecurityConfig'));
  timers.forEach(clearTimeout);
  console.log('PASS v0.4: native local route, payload budget, no cloud fallback, URL whitelist, Android wiring');
})().catch(err=>{timers.forEach(clearTimeout);console.error(err);process.exit(1)});
