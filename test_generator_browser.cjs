const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const browser=process.env.STORYWEAVE_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'storyweave-generator-'));
fs.cpSync(path.join(__dirname,'web'),temp,{recursive:true});
async function interactions() {
  const assert=(ok,message)=>{if(!ok) throw Error(message);};
  const $=s=>document.querySelector(s);
  const wait=async(p,message)=>{for(let i=0;i<1800;i++){if(p())return;await new Promise(r=>setTimeout(r,25));}throw Error(message+': '+$('#genStatus')?.textContent);};
  await wait(()=>typeof state!=='undefined'&&state.projects?.length,'App not loaded');
  go('world');
  const before=state.worldMaps?.length||0;
  StoryWeaveGenerator.open({seed:'storyweave-42',template:'continents',style:'physical'});
  await wait(()=>!$('#genSave')?.disabled||$('#genStatus')?.textContent.startsWith('生成失败'),'Generation timeout');
  assert(!$('#genSave').disabled,$('#genStatus').textContent);
  const firstImage=$('#genPreview img').src;
  assert(firstImage.length>20000,'Empty map image');
  assert((state.worldMaps?.length||0)===before,'Preview was committed without adoption');
  if(window.capturePreview){$('#modalRoot .modal').scrollTop=0;return;}
  // Re-run the real engine with a fixed seed, independently of previous iframe state.
  $('#genRun').click();
  await wait(()=>!$('#genSave')?.disabled||$('#genStatus')?.textContent.startsWith('生成失败'),'Repeat generation timeout');
  assert(!$('#genSave').disabled,$('#genStatus').textContent);
  assert($('#genPreview img').src===firstImage,'Fixed seed is not reproducible');
  storageFailure=true;$('#genSave').click();
  await wait(()=>$('#genStatus').textContent.startsWith('保存失败'),'Storage failure not reported');
  assert((state.worldMaps?.length||0)===before,'Failed save left a partial map');
  storageFailure=false;$('#genSave').click();
  await wait(()=>$('#atlasMapCanvas'),'Map not adopted');
  const map=state.worldMaps.at(-1),places=state.worldPlaces.filter(p=>p.mapId===map.id);
  assert(map.generation.seed==='storyweave-42'&&places.length>5,'Missing provenance or settlements');
  assert(places.every(p=>p.position.x>=0&&p.position.x<=map.width&&p.position.y>=0&&p.position.y<=map.height),'Invalid coordinates');
  const restored=normalizeBackup(JSON.parse(JSON.stringify(state)));
  assert(restored.worldMaps.at(-1).generation.seed===map.generation.seed,'Backup lost generator settings');
  assert(!document.querySelector('.generator-engine'),'Generator iframe leaked');
  $('#atlasManage summary').click();$('#atlasEditMap').click();$('#atlasRecreate').click();
  await wait(()=>!$('#genSave')?.disabled||$('#genStatus')?.textContent.startsWith('生成失败'),'Saved settings replay timeout');
  assert(!$('#genSave').disabled,$('#genStatus').textContent);
  assert($('#genPreview img').src===firstImage,'Saved settings did not reproduce map');
  $('#modalClose').click();StoryWeaveAtlas.open(map.id);
  if(window.captureGenerator){$('#modalRoot .modal').scrollTop=0;return;}
  $('#atlasManage summary').click();$('#atlasGenerate').click();$('#modalClose').click();
  await new Promise(r=>setTimeout(r,50));
  assert(!document.querySelector('.generator-engine'),'Cancel leaked engine');
  assert(state.worldMaps.length===before+1,'Cancel changed saved maps');
  StoryWeaveGenerator.open({seed:'storyweave-43',template:'archipelago',style:'political'});
  await wait(()=>!$('#genSave')?.disabled||$('#genStatus')?.textContent.startsWith('生成失败'),'Political generation timeout');
  assert(!$('#genSave').disabled,$('#genStatus').textContent);
  assert($('#genPreview img').src!==firstImage,'Different template/seed did not change map');
  $('#genPlaces').checked=false;$('#genSave').click();
  await wait(()=>state.worldMaps.length===before+2,'Image-only save failed');
  assert(!state.worldPlaces.some(p=>p.mapId===state.worldMaps.at(-1).id),'Unchecked import still added places');
  $('#modalClose').click();
  for(const template of ['highIsland','pangea','mediterranean','peninsula','volcano']) {
    StoryWeaveGenerator.open({seed:'template-42',template,style:'physical'});
    await wait(()=>!$('#genSave')?.disabled||$('#genStatus')?.textContent.startsWith('生成失败'),'Template '+template+' timeout');
    assert(!$('#genSave').disabled,template+': '+$('#genStatus').textContent);
    assert($('#genPreview img').src.length>20000,'Empty image: '+template);
    $('#modalClose').click();
  }
  assert(!uiErrors.length,uiErrors.join('\n'));
}
let html=fs.readFileSync(path.join(temp,'index.html'),'utf8');
html=html.replace('</head>',`<script>const uiErrors=[];window.addEventListener('error',e=>uiErrors.push(e.message));
Object.defineProperty(window,'indexedDB',{value:undefined});const cache=new Map();let storageFailure=false;
Object.defineProperty(window,'localStorage',{value:{getItem:k=>cache.get(k)||null,setItem:(k,v)=>{if(storageFailure)throw Error('test storage failure');cache.set(k,v)},removeItem:k=>cache.delete(k)}});window.confirm=()=>true;</script></head>`);
html=html.replace('</body>',`<output id="test-result">RUNNING</output><script>window.capturePreview=${process.env.STORYWEAVE_CAPTURE_STAGE==='preview'};window.captureGenerator=${!!process.env.STORYWEAVE_CAPTURE};(${interactions.toString()})().then(()=>document.getElementById('test-result').textContent='PASS',e=>document.getElementById('test-result').textContent='FAIL: '+e.message);</script></body>`);
fs.writeFileSync(path.join(temp,'index.html'),html);
async function run(){
 const args=['--headless=new','--dump-dom','--virtual-time-budget=150000','--window-size=390,844','--no-first-run','--no-sandbox','--disable-gpu','--disable-crash-reporter','--disable-crashpad-for-testing','--disable-background-networking','--user-data-dir='+path.join(temp,'profile'),pathToFileURL(path.join(temp,'index.html')).href];
 if(process.env.STORYWEAVE_CAPTURE)args.push('--screenshot='+path.resolve(process.env.STORYWEAVE_CAPTURE),'--window-size=1280,1000');
 const child=spawn(browser,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='';
 child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);
 const timer=setTimeout(()=>child.kill(),150000);
 try{await new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject)});}finally{clearTimeout(timer);}
 const result=out.match(/<output id="test-result">([^<]*)<\/output>/)?.[1];
 if(result!=='PASS')fs.writeFileSync(path.join(__dirname,'generator-test-failure.txt'),(result||'No output')+'\n'+err);
 assert.equal(result,'PASS',result||err);
 console.log('PASS real offline Azgaar generation, reproducible seed, save failure/retry, settlement import, backup, cancel, political map and image-only adoption');
}
run().finally(()=>{const real=fs.realpathSync(temp);assert.equal(path.dirname(real),fs.realpathSync(os.tmpdir()));assert(path.basename(real).startsWith('storyweave-generator-'));try{fs.rmSync(real,{recursive:true,force:true,maxRetries:4});}catch(e){console.warn('Profile cleanup: '+e.code);}}).catch(e=>{console.error(e);process.exitCode=1;});
