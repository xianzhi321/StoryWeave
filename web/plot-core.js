/* StoryWeave v0.9 pure narrative sandbox helpers: no network, no UI, no direct persistence. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.StoryWeavePlotCore=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const STATUSES=['unknown','known','suspected','mistaken'];
 const safeString=(value,max=6000)=>String(value??'').slice(0,max);
 function fingerprint(text){
   const str=String(text??'');let hash=2166136261;
   for(let i=0;i<str.length;i++){hash^=str.charCodeAt(i);hash=Math.imul(hash,16777619)}
   return (hash>>>0).toString(16).padStart(8,'0')+':'+str.length;
 }
 function checkBranchConflict(branch,currentChapter){
   if(!branch||!currentChapter||branch.chapterId!==currentChapter.id)return {ok:false,reason:'原章节已删除或已切换'};
   if(fingerprint(currentChapter.text)!==branch.baseFingerprint)return {ok:false,reason:'原章节在分支建立后已被修改。为避免覆盖新稿，请新建分支或手动合并。'};
   return {ok:true,reason:''};
 }
 function createBranch({newId,projectId,chapterId,title,premise,baseText,created}){
   if(!newId||!projectId||!chapterId)throw Error('分支缺少所属作品或章节');
   const source=safeString(baseText,500000);
   if(String(baseText??'').length>500000)throw Error('当前分支章节正文超过 50 万字符上限');
   return {id:newId,projectId,chapterId,title:safeString(title||'未命名分支',90),premise:safeString(premise,1800),baseFingerprint:fingerprint(source),
     baseText:source,draft:source,status:'sandbox',created:created||new Date().toISOString(),updated:created||new Date().toISOString(),promotedAt:null};
 }
 function planPromotion(branch,chapter,newSnapshotId,at){
   const check=checkBranchConflict(branch,chapter);
   if(!check.ok)throw Error(check.reason);
   if(!String(branch.draft??'').trim())throw Error('空白分支不能覆盖正式正文');
   if(String(branch.draft).length>500000)throw Error('分支正文过长');
   const existing=Array.isArray(chapter.history)?chapter.history:[];
   const history=[{id:newSnapshotId,at,title:chapter.title,text:chapter.text,automatic:false,reason:'分支晋升前自动备份'},...existing].slice(0,30);
   return {...chapter,text:String(branch.draft),history,updated:at};
 }
 function normalizeView(value){
   if(!value||typeof value!=='object')return null;
   const status=STATUSES.includes(value.status)?value.status:'unknown';
   return {status,belief:status==='known'||status==='unknown'?'':safeString(value.belief,1200),sinceChapterId:safeString(value.sinceChapterId,80)};
 }
 function viewSignature(value){return JSON.stringify(normalizeView(value));}
 function validateKnowledgeProposal(input,project,roles,facts){
   const role=roles.find(x=>x.id===input?.roleId&&x.projectId===project?.id);
   const fact=facts.find(x=>x.id===input?.factId&&x.projectId===project?.id);
   if(!role||!fact)throw Error('事实或人物不属于当前作品');
   if(!STATUSES.includes(input.status)||input.status==='unknown')throw Error('请选择具体的认知变化状态');
   if(input.sinceChapterId&&!project.chapters.some(x=>x.id===input.sinceChapterId))throw Error('认知时间必须指向本作品的章节');
   if(input.status!=='known'&&!String(input.belief||'').trim())throw Error('怀疑或误解必须写明人物自己的看法');
   return {roleId:role.id,factId:fact.id,status:input.status,belief:input.status==='known'?'':safeString(input.belief,1200),sinceChapterId:safeString(input.sinceChapterId,80)};
 }
 function applyKnowledgeProposal(proposal,facts){
   if(proposal.status!=='pending')throw Error('此认知提案已处理');
   const pos=facts.findIndex(x=>x.id===proposal.factId&&x.projectId===proposal.projectId);
   if(pos<0)throw Error('关联事实已被删除');
   const fact=facts[pos],existing=fact.views?.[proposal.roleId];
   if(viewSignature(existing)!==proposal.expectedViewSignature)throw Error('认知状态已在提案创建后改变，请重新提交，不可覆盖新设定');
   const next={...fact,views:{...(fact.views||{}),[proposal.roleId]:{
     status:proposal.targetStatus,belief:proposal.targetStatus==='known'?'':proposal.belief,sinceChapterId:proposal.sinceChapterId||''
   }}};
   return facts.map((x,i)=>i===pos?next:x);
 }
 function parseKnowledgeSuggestions(raw,project,roles,facts,defaultChapterId){
   let str=String(raw??'').trim();
   if(str.startsWith('```'))str=str.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
   let obj;try{obj=JSON.parse(str)}catch(_){throw Error('模型给出的认知建议不是有效 JSON')}
   if(!obj||!Array.isArray(obj.changes))throw Error('模型未返回 changes 数组');
   const seen=new Set(),out=[];
   for(const x of obj.changes.slice(0,5)){
     try{
       const valid=validateKnowledgeProposal({roleId:x.roleId,factId:x.factId,status:x.status,belief:x.belief,sinceChapterId:defaultChapterId},project,roles,facts);
       const pair=valid.roleId+'|'+valid.factId;
       if(seen.has(pair))continue;seen.add(pair);
       const reason=safeString(x.reason,700).trim();
       if(reason.length<8)continue;
       out.push({...valid,reason});
     }catch(_){/* Ignore invented role/fact identifiers and invalid status. */}
   }
   return out.slice(0,3);
 }
 function editMetrics(original,revised){
   const o=String(original??''),r=String(revised??'');
   if(!o.trim()||!r.trim())throw Error('请提供修改前和修改后的文本');
   if(o===r)throw Error('修改后的文本与原稿相同');
   const segments=s=>(s.match(/[。！？!?\n]+/g)||[]).length||1;
   const dialogue=s=>(s.match(/[“「]/g)||[]).length;
   return {originalChars:o.length,revisedChars:r.length,deltaChars:r.length-o.length,
     originalAvgSentence:Math.round(o.replace(/\s/g,'').length/segments(o)*10)/10,
     revisedAvgSentence:Math.round(r.replace(/\s/g,'').length/segments(r)*10)/10,
     originalDialogueOpenings:dialogue(o),revisedDialogueOpenings:dialogue(r)};
 }
 function parseFeedbackReply(raw){
   let str=String(raw??'').trim();
   if(str.startsWith('```'))str=str.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
   let obj;try{obj=JSON.parse(str)}catch(_){throw Error('模型返回的技能建议不是有效 JSON')}
   if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error('技能建议格式不正确');
   const title=safeString(obj.title,65).trim(),category=safeString(obj.category||'个性化写作',30),description=safeString(obj.description,600).trim();
   const rules=Array.isArray(obj.rules)?obj.rules.filter(x=>typeof x==='string').map(x=>x.trim()).filter(Boolean).slice(0,5).map(x=>safeString(x,180)):[];
   if(title.length<3||description.length<16||rules.length<2)throw Error('模型建议缺少可执行的写作规则');
   if(rules.some(x=>x.length<8))throw Error('有写作规则过于简短，无法执行');
   return {title,category,description,rules,situation:safeString(obj.situation,240)};
 }
 return {fingerprint,createBranch,checkBranchConflict,planPromotion,normalizeView,viewSignature,validateKnowledgeProposal,applyKnowledgeProposal,parseKnowledgeSuggestions,editMetrics,parseFeedbackReply};
});
