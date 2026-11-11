/* StoryWeave literary distillation core v0.8 — independent and testable.
 * Input text is untrusted. Evidence must be found VERBATIM in the selected slice.
 * Only source offsets + analytical notes persist; reference passages are never
 * embedded in portable SKILL.md files by this module.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StoryWeaveDistillCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const CATEGORIES=['人物对白','叙事节奏','人物塑造','场景细节','悬念伏笔','叙事视角','结构转场','其他方法'];
  const MAX_QUOTE=72;
  const clean=v=>String(v==null?'':v).trim();
  function techniqueKey(technique){
    const title=clean(technique.title).normalize('NFKC').toLowerCase().replace(/[\s\p{P}]+/gu,'');
    return technique.category+'|'+title;
  }
  function fingerprint(text){
    const t=String(text||'');let h=2166136261;
    // Check the entire reference text, including edits in the middle of a book.
    for(let i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,16777619)}
    return `${t.length}-${(h>>>0).toString(16)}`;
  }
  function planSamples(text,count=6,maxChars=1600){
    const t=String(text||'');if(t.trim().length<100)throw Error('参考资料不足100字');
    const n=Math.max(1,Math.min(12,Math.floor(Number(count)||6),Math.floor(t.length/280)||1));
    const size=Math.max(400,Math.min(2400,Math.floor(Number(maxChars)||1600)));
    const ranges=[];
    for(let i=0;i<n;i++){
      const lo=Math.floor(i*t.length/n),hi=Math.floor((i+1)*t.length/n);
      const usable=Math.min(hi-lo,size),center=Math.round((lo+hi)/2);
      let start=Math.min(hi-usable,Math.max(lo,center-Math.floor(usable/2)));
      let end=start+usable;
      if(start>lo){const p=t.indexOf('\n',start);if(p>=0&&p<Math.min(start+75,end-180))start=p+1;}
      if(end<hi){const p=t.lastIndexOf('\n',end);if(p>end-75&&p>start+180)end=p;}
      ranges.push(sampleRange(t,i,start,end,`区段 ${i+1}`));
    }
    return ranges;
  }
  function sampleRange(text,index,start,end,name){
    const isLowSurrogate=at=>text.charCodeAt(at)>=0xdc00&&text.charCodeAt(at)<=0xdfff;
    if(isLowSurrogate(start))start++;
    if(isLowSurrogate(end))end--;
    return {index,start,end,name,length:end-start};
  }
  function planOpeningSamples(text,maxChars,isHeading){
    const samples=[];
    let body=null;
    function collect(boundary){
      if(body===null)return;
      while(body<boundary&&/\s/.test(text[body]))body++;
      if(body===boundary)return;
      const index=samples.length;
      samples.push(sampleRange(text,index,body,Math.min(boundary,body+maxChars),`章首片段 ${index+1}`));
    }
    for(const line of text.matchAll(/[^\r\n]+/g)){
      if(!isHeading(line[0]))continue;
      collect(line.index);
      if(samples.length===3)return samples;
      body=line.index+line[0].length;
    }
    collect(text.length);
    return samples.length ? samples : [sampleRange(text,0,0,Math.min(text.length,maxChars),'开篇片段')];
  }
  function parseJSON(text){
    let s=clean(text).replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
    // JSON only: no extraction from surrounding prose or arbitrary JS evaluation.
    let parsed;try{parsed=JSON.parse(s)}catch(e){throw Error('模型未返回完整 JSON，请重试当前区段')}
    if(!parsed||!Array.isArray(parsed.techniques))throw Error('模型未返回 techniques 数组');
    return parsed.techniques.slice(0,3);
  }
  function normalizeTechnique(obj,slice,docText){
    if(!obj||typeof obj!=='object')return null;
    const category=clean(obj.category),title=clean(obj.title),description=clean(obj.description);
    const quote=clean(obj.quote),reason=clean(obj.reason),situation=clean(obj.situation);
    const rules=Array.isArray(obj.rules)?[...new Set(obj.rules.filter(x=>typeof x==='string').map(x=>clean(x).slice(0,160)).filter(Boolean))].slice(0,5):[];
    if(!CATEGORIES.includes(category)||title.length<3||title.length>64||description.length<12||rules.length<2||!reason||!situation)return null;
    if(quote.length<6||quote.length>MAX_QUOTE||/[\r\n]/.test(quote))return null;
    if(quote.length>=12&&[title,description,situation,...rules].some(field=>field.includes(quote)))return null;
    const passage=String(docText||'').slice(slice.start,slice.end);
    const offset=passage.indexOf(quote);
    if(offset<0)return null; // reject invented or slightly paraphrased evidence
    const start=slice.start+offset,end=start+quote.length;
    if(String(docText||'').slice(start,end)!==quote)return null;
    return {
      category,title,description:description.slice(0,480),rules,
      situation:situation.slice(0,240),
      evidence:{start,end,sampleIndex:slice.index,reason:reason.slice(0,240)}
    };
  }
  function verifyTechniqueReply(reply,slice,docText,categories=CATEGORIES){
    const arr=parseJSON(reply),valid=[];let rejected=0;
    for(const v of arr){
      const normalized=normalizeTechnique(v,slice,docText);
      if(normalized&&categories.includes(normalized.category))valid.push(normalized);
      else rejected++;
    }
    if(!valid.length&&arr.length)throw Error('未找到能在本区段原文定位的证据与合规观察，请重试当前段');
    return {valid,rejected};
  }
  function aggregate(accepted,doc,makeId){
    const groups=new Map();
    for(const a of accepted){
      if(!a||!CATEGORIES.includes(a.category)||!a.evidence)continue;
      const key=techniqueKey(a);
      let g=groups.get(key);
      if(!g){g={title:a.title,category:a.category,description:a.description,situation:a.situation,rules:[],evidenceRefs:[]};groups.set(key,g);}
      for(const rule of a.rules||[]){if(!g.rules.includes(rule)&&g.rules.length<7)g.rules.push(rule)}
      const e=a.evidence;
      if(!g.evidenceRefs.some(x=>x.start===e.start&&x.end===e.end))g.evidenceRefs.push({...e,docId:doc.id});
    }
    const sourceFingerprint=fingerprint(doc.text||'');
    return [...groups.entries()].map(([key,x],i)=>{
      const count=new Set(x.evidenceRefs.map(e=>e.sampleIndex)).size;
      return {...x,id:makeId?makeId():`candidate-${i}`,source:doc.title,sourceId:doc.id,
        analysisType:'evidence-pipeline',confidence:count>=2?'跨区段观察':'单区段观察',
        evidenceCount:x.evidenceRefs.length,sourceCoverage:count,sourceFingerprint,distillTechnique:key,status:'candidate',
        version:1,created:new Date().toISOString()};
    }).sort((a,b)=>b.sourceCoverage-a.sourceCoverage||b.evidenceCount-a.evidenceCount);
  }
  function verifyRefs(doc,refs,expectedFingerprint){
    const text=String(doc?.text||'');const sameSource=!expectedFingerprint||fingerprint(text)===expectedFingerprint;return (refs||[]).map(e=>({
      ...e,valid:Boolean(e&&sameSource&&doc&&e.docId===doc.id&&Number.isInteger(e.start)&&Number.isInteger(e.end)&&e.start>=0&&e.end<=text.length&&e.end>e.start&&e.end-e.start<=MAX_QUOTE),
      snippet:e&&Number.isInteger(e.start)&&Number.isInteger(e.end)?text.slice(Math.max(0,e.start),Math.min(text.length,e.end)):''
    }));
  }
  function portableSkillMarkdown(skill){
    const name=clean(skill.title).replace(/[\r\n#]/g,' ').slice(0,80)||'写作技巧';
    const section=clean(skill.description).replace(/[\u0000-\u001f]/g,' ');
    const rules=(skill.rules||[]).map(r=>`- ${String(r).replace(/[\r\n]/g,' ').slice(0,160)}`).join('\n');
    const situation=clean(skill.situation||'结合具体场景判断').replace(/[\r\n]/g,' ');
    return `---\nname: literary-writing-skill\ndescription: ${JSON.stringify(name)}\n---\n\n# ${name}\n\n## 适用场景\n${situation}\n\n## 方法\n${section}\n\n## 操作规则\n${rules}\n\n## 使用约束\n仅借鉴抽象技法，生成原创文字；不能复刻参考书籍原句或其独特表达。\n`;
  }
  return {CATEGORIES,MAX_QUOTE,fingerprint,techniqueKey,planSamples,planOpeningSamples,parseJSON,normalizeTechnique,verifyTechniqueReply,aggregate,verifyRefs,portableSkillMarkdown};
});
