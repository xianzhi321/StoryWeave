/* StoryWeave v0.6.0 — safe manuscript import (separate from reference-book import). */
'use strict';
(function(){
const MAX_MANUSCRIPT_BYTES = 12 * 1024 * 1024;
const MAX_MANUSCRIPT_CHARS = 4_500_000;
const MAX_CHAPTERS = 500;
const MAX_VOLUMES = 60;
let isImporting = false;
let lastImportProblem = '';
function importError(message){lastImportProblem=String(message||'未知错误').slice(0,300);console.error('[StoryWeave Manuscript Import]',message);toast('书稿导入失败：'+short(lastImportProblem,80));}

/** TextDecoder fatal UTF-8 avoids silent U+FFFD replacement of GB18030 manuscripts. */
function decodeManuscript(bytes) {
  const raw=new Uint8Array(bytes);
  if(raw.length>=3&&raw[0]===0xEF&&raw[1]===0xBB&&raw[2]===0xBF)
    return new TextDecoder('utf-8',{fatal:true}).decode(raw.subarray(3));
  if(raw.length>=2&&raw[0]===0xFF&&raw[1]===0xFE)
    return new TextDecoder('utf-16le',{fatal:true}).decode(raw.subarray(2));
  if(raw.length>=2&&raw[0]===0xFE&&raw[1]===0xFF)
    return new TextDecoder('utf-16be',{fatal:true}).decode(raw.subarray(2));
  const first=raw.subarray(0,Math.min(raw.length,8192));
  // A legacy UTF-16 without BOM is common in exported manuscripts.
  if(first.length>=80){
    let evenZeros=0,oddZeros=0;for(let i=0;i+1<first.length;i+=2){if(first[i]===0)evenZeros++;if(first[i+1]===0)oddZeros++;}
    const pairs=first.length/2;
    if(oddZeros/pairs>.25 && evenZeros/pairs<.06)return new TextDecoder('utf-16le',{fatal:true}).decode(raw);
    if(evenZeros/pairs>.25 && oddZeros/pairs<.06)return new TextDecoder('utf-16be',{fatal:true}).decode(raw);
  }
  if(first.includes(0))throw Error('文件含有二进制内容，请选 TXT、Markdown 或 EPUB');
  try {return new TextDecoder('utf-8',{fatal:true}).decode(raw);}
  catch(utf8Error){
    try {return new TextDecoder('gb18030',{fatal:true}).decode(raw);}
    catch(encodingError){throw Error('文本编码无法识别，请保存为 UTF-8 后重新导入');}
  }
}
const cleanHeading=line=>line.trim().replace(/^#{1,6}\s+/, '');
function headingKind(title){
 if(!title||title.length>100)return '';
 const normalized=title.normalize('NFKC');
 const match=/^第[零〇一二三四五六七八九十百千万两\d]{1,12}([章回卷部篇集])/u.exec(normalized);
 if(match){
   const rest=normalized.slice(match[0].length);
   const volume=match[1]==='卷';
   if((volume&&rest&&!/^[\s:·、.\-—]/u.test(rest)) || !/^[^。!?;！？；]{0,76}$/u.test(rest))return '';
   return volume?'volume':'chapter';
 }
 const english=/^(Chapter|Volume)\s+\d+(?:(?:\s*[:.\-—]\s*|\s+)[^.!?;]{0,72})?$/iu.exec(normalized);
 return english ? (english[1].toLowerCase()==='volume'?'volume':'chapter') : '';
}
function isChapterHeading(line){return Boolean(headingKind(cleanHeading(String(line||''))));}
function structureOf(src,title){
 if(!src.trim())throw Error('书稿里没有文字');
 if(src.length>MAX_MANUSCRIPT_CHARS)throw Error('书稿超出当前单次导入上限（450 万字符）');
 const lines=src.split('\n'),chapters=[],volumes=[];
 let currentTitle='',parts=[],volume=null,fence='';
 function push(){
   const start=parts.findIndex(line=>line.trim());
   let end=parts.length;
   while(end>0&&!parts[end-1].trim())end--;
   const text=start<0?'':parts.slice(start,end).join('\n');
   if(currentTitle||text)chapters.push({title:currentTitle||(volume===null?'序章 · 导入正文':'卷首正文'),text,volume});
   currentTitle='';
   parts=[];
 }
 for(const [index,line] of lines.entries()){
   const marker=/^\s*(`{3,}|~{3,})(.*)$/u.exec(line);
   if(fence||marker){
     if(!fence)fence=marker[1];
     else if(marker&&marker[1][0]===fence[0]&&marker[1].length>=fence.length&&!marker[2].trim())fence='';
     parts.push(line);
     continue;
   }
   const title=cleanHeading(line);
   const bracket=/^【(.{1,100})】$/u.exec(title);
   const markdownVolume=/^\s*##\s+\S/u.test(line)&&title.length<=100;
   let kind=headingKind(title), volumeTitle=title;
   if(!kind&&(bracket||markdownVolume)){
     let next=index+1;
     while(next<lines.length&&!lines[next].trim())next++;
     const following=lines[next]||'';
     if((bracket||/^\s*###\s+\S/u.test(following))&&headingKind(cleanHeading(following))==='chapter'){
       kind='volume';
       volumeTitle=bracket?.[1]||title;
     }
   }
   if(!kind){parts.push(line);continue;}
   push();
   if(kind==='volume'){
     volume=volumes.length;
     volumes.push(volumeTitle);
   }else currentTitle=title;
 }
 push();
 if(!chapters.length)chapters.push({title:title||'正文',text:src.trim(),volume:null});
 if(volumes[volumes.length-1]==='未分卷'){
   const last=volumes.length-1;
   volumes.pop();
   for(const ch of chapters)if(ch.volume===last)ch.volume=null;
 }
 // The directory puts unfiled chapters last. Keep a true preface before the first volume.
 if(volumes.length&&chapters[0].volume===null){
   const firstVolumeChapter=chapters.findIndex(ch=>ch.volume!==null);
   if(firstVolumeChapter>0){
     for(const [index,ch] of chapters.entries()){
       if(index<firstVolumeChapter)ch.volume=0;
       else if(ch.volume!==null)ch.volume++;
     }
     volumes.unshift('卷前章节');
   }
 }
 return {chapters,volumes};
}
const normalizedManuscript=text=>String(text||'').replace(/\r\n?/g,'\n').replace(/\u0000/g,'').replace(/^\uFEFF/,'');
function chapterize(text,title){
 const result=structureOf(normalizedManuscript(text),title);
 if(result.chapters.length>MAX_CHAPTERS)throw Error(`识别到超过 ${MAX_CHAPTERS} 章，请分卷导入`);
 return result.chapters;
}
function epubReadingOrder(entries){
 const files=new Map(entries.map(entry=>[entry.name,entry]));
 const container=files.get('META-INF/container.xml');
 if(!container)return entries.filter(entry=>/\.(xhtml|html|htm)$/i.test(entry.name));
 const parser=new DOMParser();
 const elements=(doc,tag)=>Array.from(doc.getElementsByTagNameNS('*',tag));
 const xml=entry=>{
   const doc=parser.parseFromString(entry.text,'application/xml');
   if(elements(doc,'parsererror').length)throw Error('EPUB 的阅读目录无法解析');
   return doc;
 };
 const path=elements(xml(container),'rootfile')[0]?.getAttribute('full-path');
 const packageFile=files.get(path);
 if(!packageFile)throw Error('EPUB 缺少阅读目录文件');
 const packageDoc=xml(packageFile), spine=elements(packageDoc,'spine')[0];
 const refs=spine?elements(spine,'itemref'):[];
 if(!refs.length)throw Error('EPUB 阅读目录没有章节');
 const manifest=new Map(elements(packageDoc,'item').map(item=>[item.getAttribute('id'),item]));
 const origin='https://epub.invalid';
 const base=origin+'/'+path.split('/').map(encodeURIComponent).join('/');
 return refs.flatMap(ref=>{
   const item=manifest.get(ref.getAttribute('idref'));
   const href=item?.getAttribute('href');
   if(!href)throw Error('EPUB 阅读目录包含缺失章节');
   if((item.getAttribute('properties')||'').split(/\s+/).includes('nav'))return [];
   if(!['application/xhtml+xml','text/html'].includes(item.getAttribute('media-type')))return [];
   const url=new URL(href,base);
   const entry=url.origin===origin&&files.get(decodeURIComponent(url.pathname.slice(1)));
   if(!entry)throw Error('EPUB 阅读目录包含缺失正文');
   return [entry];
 });
}
/** Preserve paragraph boundaries and follow the package's default reading order. */
async function parseEPUBForManuscript(buffer){
 const entries=epubReadingOrder(await StoryWeaveEpub.unzipEntries(buffer,{includePackage:true}));
 if(!entries.length)throw Error('EPUB 没有可读取的正文');
 const blockTags=new Set(['p','h1','h2','h3','h4','h5','h6','div','section','article','li','blockquote','pre','title']);
 const skippedTags=new Set(['script','style','nav','head','footer','header','svg']);
 function textOf(root){
   const text=[];
   const tagOf=node=>node.nodeType===1?node.localName.toLowerCase():'';
   let node=root.firstChild;
   while(node){
     const tag=tagOf(node);
     if(node.nodeType===3)text.push(node.nodeValue||'');
     if(blockTags.has(tag)||tag==='br'||tag==='hr')text.push('\n');
     if(node.firstChild&&!skippedTags.has(tag)){
       node=node.firstChild;
       continue;
     }
     while(node!==root){
       if(blockTags.has(tagOf(node)))text.push('\n');
       if(node.nextSibling){
         node=node.nextSibling;
         break;
       }
       node=node.parentNode;
     }
     if(node===root)break;
   }
   return text.join('');
 }
 const parts=[];
 for(const entry of entries){
   const doc=new DOMParser().parseFromString(entry.text,'text/html');
   const content=textOf(doc.body||doc.documentElement).replace(/[ \t]+/g,' ').replace(/\n[ \t]*/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
   if(content)parts.push(content);
 }
 const joined=parts.join('\n\n');
 if(!joined.trim())throw Error('EPUB 无可识别的文字');
 return joined;
}
function importPreview(filename,{chapters,volumes},text){
 const bookTitle=filename.replace(/\.(txt|md|markdown|epub)$/i,'').replace(/[_-]+/g,' ').trim().slice(0,90)||'未命名作品';
 const tooManyChapters=chapters.length>MAX_CHAPTERS, tooManyVolumes=volumes.length>MAX_VOLUMES;
 const single={title:'正文',text,volume:null};
 const chapterCounts=new Map();
 modal('导入小说书稿',`<p class="small-note">确认后创建一部新作品。原文保存在本设备。</p>
 <div class="field"><label for="sw6-title">作品标题</label><input id="sw6-title" name="manuscriptTitle" maxlength="90" value="${esc(bookTitle)}"/></div>
 <div class="field"><label for="sw26-import-mode">导入结构</label><select id="sw26-import-mode">
 ${volumes.length?`<option value="volumes" ${tooManyChapters||tooManyVolumes?'disabled':''}>按卷和章</option>`:''}
 <option value="chapters" ${tooManyChapters?'disabled':''}>仅分章</option><option value="single">合并为一章</option></select></div>
 ${tooManyChapters?`<p class="small-note">检测到超过 ${MAX_CHAPTERS} 章。可合并为一章，或分批导入。</p>`:
   tooManyVolumes?`<p class="small-note">检测到超过 ${MAX_VOLUMES} 卷。可选择仅分章，或分批导入。</p>`:''}
 <p class="small-note" id="sw26-import-summary" aria-live="polite"></p>
 <div class="sw6-preview-list sw26-import-list" aria-label="识别的章节"></div>
 <p class="small-note" role="status"></p>
 <div class="form-actions"><button class="button outline" id="sw6Cancel">返回</button><button class="button primary" id="sw6Commit">确认导入到书架</button></div>`,root=>{
  const mode=root.querySelector('#sw26-import-mode'), list=root.querySelector('.sw26-import-list');
  const summary=root.querySelector('#sw26-import-summary'), status=root.querySelector('[role="status"]');
  const btn=root.querySelector('#sw6Commit'), cancel=root.querySelector('#sw6Cancel'), close=root.querySelector('#modalClose');
  const chosen=()=>mode.value==='single'?[single]:chapters;
  function paint(){
    const parts=chosen(), group=mode.value==='volumes';
    let total=0, previous;
    list.innerHTML=parts.map((c,index)=>{
      const heading=group&&c.volume!==previous?`<h4>${esc(volumes[c.volume]||'未分卷')}</h4>`:'';
      previous=c.volume;
      if(!chapterCounts.has(c))chapterCounts.set(c,count(c.text));
      const size=chapterCounts.get(c);
      total+=size;
      return `${heading}<div class="sw6-preview-line"><span>${index+1}</span><strong>${esc(c.title)}</strong><small>${size} 字</small></div>`;
    }).join('');
    summary.textContent=`${group?volumes.length+' 卷 · ':''}${parts.length} 章 · ${total.toLocaleString('zh-CN')} 字`;
  }
  mode.value=tooManyChapters?'single':volumes.length&&!tooManyVolumes?'volumes':'chapters';
  mode.onchange=paint;
  paint();
  cancel.onclick=closeModal;
  root.closest('.modal-backdrop').addEventListener('click',event=>{
    if(btn.disabled&&event.target.classList.contains('modal-backdrop'))event.stopImmediatePropagation();
  },true);
  btn.onclick=async()=>{
    if(btn.disabled)return;
    const title=formVal(root,'manuscriptTitle').slice(0,90);
    if(!title)return toast('请填写作品标题');
    const parts=chosen(), group=mode.value==='volumes';
    if(parts.length>MAX_CHAPTERS||(group&&volumes.length>MAX_VOLUMES))return;
    btn.disabled=cancel.disabled=close.disabled=mode.disabled=true;
    btn.textContent='正在保存…';status.textContent='';
    try{
      const projectId=id();
      const now=time();
      const projectVolumes=group?volumes.map(title=>({id:id(),title})):[];
      const novel={id:projectId,title,subtitle:'导入书稿',genre:'',summary:'',created:now,updated:now,volumes:projectVolumes,
        chapters:parts.map(c=>({id:id(),title:c.title,text:c.text,volumeId:projectVolumes[c.volume]?.id||'',updated:now,history:[]}))};
      await StoryWeaveWorkspace.transact(next=>{
        next.projects=[...next.projects,novel];
        next.selected=projectId;
      });
      chapterId=novel.chapters[0].id;
      if(root.isConnected)closeModal();
      go('contents');toast(`《${title}》已导入 · ${novel.chapters.length} 章`);
    }catch(err){
      lastImportProblem='设备保存失败。'+String(err?.message||err);
      status.textContent=lastImportProblem;
      btn.textContent='重试导入';
    }finally{
      btn.disabled=cancel.disabled=close.disabled=mode.disabled=false;
    }
  };
 });
}
async function onManuscriptSelected(event){
 const input=event.target, file=input.files?.[0];input.value='';
 if(!file)return;
 if(isImporting)return toast('上一份书稿仍在读取，请稍后');
 const ext=(file.name.split('.').pop()||'').toLowerCase();
 if(!['txt','md','markdown','epub'].includes(ext))return importError('目前支持 TXT、Markdown、EPUB');
 if(!file.size ||file.size>MAX_MANUSCRIPT_BYTES)return importError('文件大小必须在 1 字节至 12 MB 之间');
 isImporting=true;
 try{
   toast('正在读取书稿与识别章节…');
   const content=normalizedManuscript(ext==='epub'?await parseEPUBForManuscript(await file.arrayBuffer()):decodeManuscript(await file.arrayBuffer()));
   if(content.trim().length<20)throw Error('文字不足 20 字，不作为小说书稿导入');
   importPreview(file.name,structureOf(content,file.name),content);
 }catch(err){importError(err?.message||String(err));}
 finally{isImporting=false;}
}
const oldAct=act;
act=function(action,x){
 if(action==='import-manuscript'){
   const input=document.getElementById('manuscriptImport');
   if(!input)return toast('当前界面缺少书稿导入控件');
   try{input.click();}catch(err){importError('系统文件管理器未能打开：'+err.message);}
   return;
 }
 return oldAct(action,x);
};
const input=document.getElementById('manuscriptImport');
if(input)input.addEventListener('change',onManuscriptSelected);
window.StoryWeaveManuscript={decodeManuscript,chapterize,isChapterHeading,parseEPUBForManuscript,getLastError:()=>lastImportProblem};
})();
