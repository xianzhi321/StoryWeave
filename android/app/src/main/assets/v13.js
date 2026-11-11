(function() {
  'use strict';
  const Core = window.StoryWeaveGeneratorCore;
  const randomSeed = () => {
    const value = new Uint32Array(2); crypto.getRandomValues(value);
    return [...value].map(n => n.toString(36)).join('-');
  };
  function openGenerator(initial) {
    if (!project()) return toast('先创建作品');
    if (StoryWeaveAtlasCore.own(state,'worldMaps',state.selected).length >= 4) return toast('每部作品最多 4 张地图，请先删除不需要的地图');
    const projectId = state.selected;
    modal('一键生成世界地图', `<div class="generator-heading"><span class="tiny-label">STORYWEAVE × AZGAAR</span>
      <p>从大陆、河流到城镇，为故事生成一个可以探索的世界。</p></div>
      <div class="generator-fields"><div class="field"><label for="genTitle">地图名称</label><input id="genTitle" maxlength="100" value="新的世界"></div>
      <div class="field"><label for="genTemplate">地形模板</label><select id="genTemplate">${Object.entries(Core.templates).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></div>
      <div class="field"><label for="genStyle">底图样式</label><select id="genStyle"><option value="physical">自然地形</option><option value="political">国家分区</option></select></div>
      <div class="field"><label for="genSeed">随机种子 · 相同设置可复现</label><input id="genSeed" maxlength="40" autocomplete="off"></div></div>
      <div class="atlas-actions"><button id="genRun" class="button outline">按设置生成</button><button id="genRandom" class="button outline">换一个世界</button></div>
      <p id="genStatus" role="status" aria-live="polite">准备生成…</p>
      <div id="genPreview" class="generator-preview"><div class="generator-placeholder">正在勾勒世界的轮廓…</div></div>
      <div class="generator-footer"><label><input type="checkbox" id="genPlaces" checked> 同时导入城镇为可编辑地点</label>
      <p id="genSummary" class="small-note"></p><button id="genSave" class="button primary" disabled>采用此地图</button></div>
      <p class="small-note">完全本地生成，无需 AI 密钥。城镇可改名并关联章节、人物与事件；地形和国家分区保存为静态底图。
      采用后新增地图。Azgaar 生成的地名默认保留原文，可在地点详情中修改。</p>`, root => {
      root.classList.add('atlas-modal');
      const $ = selector => root.querySelector(selector), save = $('#genSave');
      $('#genSeed').value = initial?.seed || randomSeed();
      $('#genTemplate').value = initial?.template || 'continents';
      $('#genStyle').value = initial?.style || 'physical';
      let frame = null, timeout = null, result = null, request = '', expected = null, saving = false;
      const stop = () => {clearTimeout(timeout); frame?.remove();frame=null;request='';};
      const fail = message => {stop(); result=null;save.disabled=true;$('#genStatus').textContent='生成失败：'+message;};
      const invalidate = () => {stop();result=null;save.disabled=true;$('#genStatus').textContent='设置已修改，点击“按设置生成”更新预览';};
      for (const key of ['#genSeed','#genTemplate','#genStyle']) $(key).addEventListener('input',invalidate);
      const listener = event => {
        const message=event.data;
        if (!root.isConnected || state.selected !== projectId) return stop();
        if (!frame || event.source !== frame.contentWindow || !message || message.channel !== 'storyweave-azgaar' || message.request !== request) return;
        if (message.type === 'progress') $('#genStatus').textContent=String(message.message || '').slice(0,200);
        if (message.type === 'error') fail(String(message.message || '引擎无法启动').slice(0,200));
        if (message.type === 'result') {
          try {
            result=Core.validate(message.result,expected);
            const image = document.createElement('img');image.alt='生成的世界地图预览';image.src=result.image;
            $('#genPreview').replaceChildren(image);
            $('#genStatus').textContent='世界已生成，可以采用或继续调整。';
            $('#genSummary').textContent=`${result.width} × ${result.height} · ${result.settlements.length} 个城镇 · 种子 ${result.seed}`;
            save.disabled=false;stop();
          } catch(error) {fail(error.message);}
        }
      };
      window.addEventListener('message',listener);
      const observer = new MutationObserver(() => {
        if (!root.isConnected) {stop();observer.disconnect();window.removeEventListener('message',listener);}
      });
      observer.observe(document.getElementById('modalRoot'),{childList:true,subtree:true});
      function run() {
        if (saving) return;
        stop();result=null;save.disabled=true;
        try {expected=Core.config({seed:$('#genSeed').value,template:$('#genTemplate').value,style:$('#genStyle').value});}
        catch(error) {return fail(error.message);}
        $('#genStatus').textContent='正在启动本地地图引擎…';
        $('#genSummary').textContent='';
        $('#genPreview').innerHTML='<div class="generator-placeholder">正在生成，可在完成后预览地图。首次运行可能稍慢。</div>';
        request=randomSeed();
        frame=document.createElement('iframe');
        frame.title='本地地图生成引擎';frame.className='generator-engine';frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
        frame.src='vendor/azgaar/index.html?'+new URLSearchParams({...expected,request,width:'1200',height:'800'});
        root.appendChild(frame);
        timeout=setTimeout(()=>fail('生成超时，请重试或选择另一种地形'),90000);
      }
      $('#genRun').onclick=run;
      $('#genRandom').onclick=()=>{$('#genSeed').value=randomSeed();run();};
      save.onclick=async()=>{
        if (!result || saving) return;
        const accepted=result, title=$('#genTitle').value, includePlaces=$('#genPlaces').checked;
        saving=true;save.disabled=true;$('#genRun').disabled=true;$('#genRandom').disabled=true;
        try {
          let created;
          await StoryWeaveWorkspace.transact(next=>{
            if (next.selected !== projectId || !next.projects.some(p=>p.id===projectId)) throw Error('作品已切换或删除');
            if (StoryWeaveAtlasCore.own(next,'worldMaps',projectId).length>=4) throw Error('每部作品最多保存 4 张地图');
            created=Core.build(accepted,title,projectId,id,includePlaces);
            next.worldMaps=[...(next.worldMaps||[]),created.map];
            next.worldPlaces=[...(next.worldPlaces||[]),...created.places];next.version=13;
          });
          if (root.isConnected && state.selected===projectId) {render();StoryWeaveAtlas.open(created.map.id);toast('已保存地图与 '+created.places.length+' 个地点');}
        } catch(error) {if(root.isConnected) $('#genStatus').textContent='保存失败：'+error.message+'。预览仍保留，可重试。';}
        finally {saving=false;if(root.isConnected) {save.disabled=!result;$('#genRun').disabled=false;$('#genRandom').disabled=false;}}
      };
      run();
    });
  }
  const previousAct=act;
  act=function(action,key){if(action==='v13-generate') return openGenerator();return previousAct(action,key);};
  window.StoryWeaveGenerator={open:openGenerator};
})();
