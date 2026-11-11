/* StoryWeave v1.0 narrative continuity core. Pure functions, no DOM/network. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.StoryWeaveNarrativeCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const LINK_STAGES=['planted','developed','mentioned','payoff'];
const EVENT_TYPES=['剧情事件','人物行动','关系变化','世界变化','历史背景','其他'];
const SEVERITIES=['info','warning','critical'];
const clean=v=>String(v==null?'':v).trim();
const byId=(xs,id)=>Array.isArray(xs)?xs.find(x=>x&&x.id===id):null;
const chapterIndex=(chapters,id)=>Math.max(-1,(chapters||[]).findIndex(c=>c.id===id));
function safeText(v,max=1200){return clean(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,max)}
function validatePlotLink(raw,project,plots,chapters,existing=[]){
 if(!raw||!project)throw Error('缺少作品或关联信息');
 const plot=byId(plots,raw.plotId),chapter=byId(chapters,raw.chapterId);
 if(!plot||plot.projectId!==project.id)throw Error('线索不属于当前作品');
 if(!chapter)throw Error('必须关联一个有效章节');
 if(!LINK_STAGES.includes(raw.stage))throw Error('线索阶段无效');
 const duplicate=existing.some(x=>x.projectId===project.id&&x.plotId===plot.id&&x.chapterId===chapter.id&&x.stage===raw.stage);
 if(duplicate)throw Error('这条线索已在该章节建立相同阶段的关联');
 return {id:safeText(raw.id,100)||`link-${Date.now().toString(36)}`,projectId:project.id,plotId:plot.id,chapterId:chapter.id,stage:raw.stage,note:safeText(raw.note,700),allowNonlinear:!!raw.allowNonlinear,created:raw.created||new Date().toISOString()};
}
function auditPlotLinks(plots,links,chapters){
 const issues=[],order=new Map((chapters||[]).map((c,i)=>[c.id,i]));
 for(const plot of plots||[]){
  const refs=(links||[]).filter(x=>x.plotId===plot.id),planted=refs.filter(x=>x.stage==='planted'),payoffs=refs.filter(x=>x.stage==='payoff');
  refs.forEach(x=>{if(!order.has(x.chapterId))issues.push({id:`plot-missing-${x.id}`,kind:'plot',severity:'warning',title:`线索关联章节不存在：${plot.title}`,detail:'该关联指向已删除或不存在的章节。',plotId:plot.id,chapterId:x.chapterId});});
  if(refs.length&&!planted.length)issues.push({id:`plot-no-plant-${plot.id}`,kind:'plot',severity:'notice',title:`「${plot.title}」没有明确的埋设章节`,detail:'建议标记首次出现线索的章节，便于核对后续回收。',plotId:plot.id});
  if(payoffs.length>1)issues.push({id:`plot-multi-payoff-${plot.id}`,kind:'plot',severity:'notice',title:`「${plot.title}」有多个回收节点`,detail:'请确认这是分阶段揭示，还是误重复标记。',plotId:plot.id});
  for(const p of planted)for(const q of payoffs){if(order.has(p.chapterId)&&order.has(q.chapterId)&&order.get(q.chapterId)<order.get(p.chapterId)&&!q.allowNonlinear){issues.push({id:`plot-order-${plot.id}-${q.id}`,kind:'plot',severity:'warning',title:`「${plot.title}」的回收章节早于埋设章节`,detail:`埋设：${byId(chapters,p.chapterId)?.title||'未知'}；回收：${byId(chapters,q.chapterId)?.title||'未知'}。如果是倒叙，请标记为非线性叙事。`,plotId:plot.id,chapterId:q.chapterId});}}
  if(!refs.length&&plot.status!=='已回收')issues.push({id:`plot-unlinked-${plot.id}`,kind:'plot',severity:'info',title:`「${plot.title}」尚未关联章节`,detail:'这条伏笔目前没有章节级位置，无法检查埋设与回收顺序。',plotId:plot.id});
 }
 for(const link of links||[])if(!byId(plots,link.plotId))issues.push({id:`link-orphan-${link.id}`,kind:'plot',severity:'warning',title:'存在孤立的伏笔关联',detail:'关联的线索档案已不存在。',chapterId:link.chapterId});
 return issues;
}
function relationOrder(a,b,chapters){const ai=chapterIndex(chapters,a.chapterId),bi=chapterIndex(chapters,b.chapterId);return ai-bi||String(a.created||'').localeCompare(String(b.created||''))||String(a.id).localeCompare(String(b.id));}
function relationStateAt(relation,chapterId,chapters,history=[]){
 if(!relation)return null;
 const target=chapterIndex(chapters,chapterId);
 const initialTrust=Number(relation.initialTrust??relation.trust);
 const state={type:relation.initialType??relation.type??'普通关系',trust:Number.isFinite(initialTrust)?initialTrust:0,detail:relation.initialDetail??relation.detail??'',aAttitude:relation.initialAAttitude??relation.aAttitude??'',bAttitude:relation.initialBAttitude??relation.bAttitude??''};
 const events=(history||[]).filter(x=>x.relationId===relation.id&&chapterIndex(chapters,x.chapterId)>=0&&chapterIndex(chapters,x.chapterId)<=target).sort((a,b)=>relationOrder(a,b,chapters));
 for(const event of events){state.type=event.afterType;state.trust=Number(event.afterTrust)||0;state.detail=event.afterDetail||'';state.aAttitude=event.aAttitude||'';state.bAttitude=event.bAttitude||'';}
 return {...state,throughChapterId:chapterId,eventCount:events.length};
}
function createRelationshipEvent(raw,relation,project,chapters,history=[]){
 if(!relation||relation.projectId!==project?.id)throw Error('人物关系不属于当前作品');
 if(!byId(chapters,raw.chapterId))throw Error('请选择有效章节');
 const type=safeText(raw.afterType,70);if(type.length<2)throw Error('请填写变化后的关系');
 const trust=Number(raw.afterTrust);if(!Number.isFinite(trust)||trust< -100||trust>100)throw Error('关系信任值必须在 -100 到 100 之间');
 const prior=relationStateAt(relation,raw.chapterId,chapters,history);
 return {id:safeText(raw.id,100)||`rel-${Date.now().toString(36)}`,projectId:project.id,relationId:relation.id,a:relation.a,b:relation.b,chapterId:raw.chapterId,
  beforeType:prior.type,beforeTrust:prior.trust,afterType:type,afterTrust:Math.round(trust),afterDetail:safeText(raw.afterDetail,800),aAttitude:safeText(raw.aAttitude,300),bAttitude:safeText(raw.bAttitude,300),cause:safeText(raw.cause,800),created:raw.created||new Date().toISOString()};
}
function applyLatestRelationship(relation,history,chapters){
 const ordered=(history||[]).filter(x=>x.relationId===relation.id).sort((a,b)=>relationOrder(a,b,chapters));
 if(!ordered.length)return {...relation};
 const e=ordered[ordered.length-1];return {...relation,type:e.afterType,trust:e.afterTrust,detail:e.afterDetail,aAttitude:e.aAttitude,bAttitude:e.bAttitude,updated:e.created};
}
function auditRelationshipHistory(relations,history,chapters,characters){
 const issues=[],roleIds=new Set((characters||[]).map(x=>x.id));
 for(const ev of history||[]){const r=byId(relations,ev.relationId);if(!r||!roleIds.has(ev.a)||!roleIds.has(ev.b)||!byId(chapters,ev.chapterId)){issues.push({id:`rel-invalid-${ev.id}`,kind:'relationship',severity:'warning',title:'人物关系历史存在失效引用',detail:'请检查关联人物、关系档案或章节是否已删除。',chapterId:ev.chapterId});}}
 for(const relation of relations||[]){const events=(history||[]).filter(x=>x.relationId===relation.id).sort((a,b)=>relationOrder(a,b,chapters));for(let i=1;i<events.length;i++){const prev=events[i-1],cur=events[i];if((cur.beforeType&&prev.afterType&&cur.beforeType!==prev.afterType)||(Number.isFinite(Number(cur.beforeTrust))&&Number.isFinite(Number(prev.afterTrust))&&Number(cur.beforeTrust)!==Number(prev.afterTrust))){issues.push({id:`rel-gap-${cur.id}`,kind:'relationship',severity:'notice',title:`「${relation.type}」的关系变化记录可能断档`,detail:`${byId(chapters,cur.chapterId)?.title||'某章'}记录的变化前状态为「${cur.beforeType} / 信任 ${cur.beforeTrust}」，而上一条记录结束于「${prev.afterType} / 信任 ${prev.afterTrust}」。如果是有意的回溯修订，可忽略。`,chapterId:cur.chapterId});}}}
 return issues;
}
function validateTimelineEvent(raw,project,chapters,characters){
 if(!project)throw Error('请先选择作品');const title=safeText(raw.title,120);if(title.length<2)throw Error('事件标题至少需要两个字');
 const chapter=raw.chapterId?byId(chapters,raw.chapterId):null;if(raw.chapterId&&!chapter)throw Error('事件关联章节不存在');
 const date=safeText(raw.storyDate,20);if(date){const m=date.match(/^(\d{1,6})(?:-(\d{2})(?:-(\d{2}))?)?$/);if(!m)throw Error('故事内日期格式应为 YYYY、YYYY-MM 或 YYYY-MM-DD');const month=m[2]?Number(m[2]):null,day=m[3]?Number(m[3]):null;if(month!==null&&(month<1||month>12))throw Error('故事内月份必须在 01 至 12 之间');if(day!==null){const year=Number(m[1]),leap=year%4===0&&(year%100!==0||year%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];if(day<1||day>days[month-1])throw Error('故事内日期不是有效日历日期');}}
 const allowed=new Set((characters||[]).map(x=>x.id)),participants=Array.isArray(raw.participants)?raw.participants.filter(x=>allowed.has(x)).slice(0,20):[];
 return {id:safeText(raw.id,100)||`event-${Date.now().toString(36)}`,projectId:project.id,title,type:EVENT_TYPES.includes(raw.type)?raw.type:'剧情事件',storyDate:date,chapterId:chapter?.id||'',location:safeText(raw.location,160),participants,description:safeText(raw.description,1800),cause:safeText(raw.cause,900),consequence:safeText(raw.consequence,900),isFlashback:!!raw.isFlashback,created:raw.created||new Date().toISOString(),updated:new Date().toISOString()};
}
function storyDateRange(value){
 const match=clean(value).match(/^(\d{1,6})(?:-(\d{2})(?:-(\d{2}))?)?$/);
 if(!match)return null;
 const year=Number(match[1]),month=Number(match[2])||0,day=Number(match[3])||0;
 return [year*10000+(month||1)*100+(day||1),year*10000+(month||12)*100+(day||31)];
}
function sortTimeline(events,chapters){const order=new Map((chapters||[]).map((c,i)=>[c.id,i]));return [...(events||[])].sort((a,b)=>{
 const d=(storyDateRange(a.storyDate)?.[0]??Infinity)-(storyDateRange(b.storyDate)?.[0]??Infinity);if(d)return d;
 const ai=order.has(a.chapterId)?order.get(a.chapterId):Number.MAX_SAFE_INTEGER,bi=order.has(b.chapterId)?order.get(b.chapterId):Number.MAX_SAFE_INTEGER;return ai-bi||String(a.created||'').localeCompare(String(b.created||''));
 });}
function auditTimeline(events,chapters){
 const issues=[],byChapter=new Map();
 for(const event of events||[]){
  const date=storyDateRange(event.storyDate);
  if(!event.chapterId||!date||event.isFlashback)continue;
  const group=byChapter.get(event.chapterId)||[];
  group.push({event,date});byChapter.set(event.chapterId,group);
 }
 let latest=null;
 for(const chapter of chapters||[]){
  const group=byChapter.get(chapter.id)||[];
  for(const item of group){
   if(!latest||item.date[1]>=latest.date[0])continue;
   const a=latest.event,b=item.event;
   issues.push({id:`time-reverse-${b.id}`,kind:'timeline',severity:'warning',title:`故事时间可能倒退：${b.title}`,
    detail:`章节顺序上「${b.title}」晚于「${a.title}」，但故事日期 ${b.storyDate} 早于 ${a.storyDate}。如果是倒叙，请标记为非线性事件。`,chapterId:b.chapterId,eventId:b.id});
  }
  for(const item of group)if(!latest||item.date[0]>latest.date[0])latest=item;
 }
 for(const e of events||[])if(e.chapterId&&chapterIndex(chapters,e.chapterId)<0)issues.push({id:`time-missing-${e.id}`,kind:'timeline',severity:'warning',title:`事件「${e.title}」关联章节不存在`,detail:'请重新关联章节或删除这条事件。',eventId:e.id});
 return issues;
}
function auditContinuity(input){
 const {project,plots=[],plotLinks=[],relations=[],relationshipHistory=[],timelineEvents=[],characters=[]}=input||{};const chapters=project?.chapters||[];
 if(!project)return {issues:[],counts:{critical:0,warning:0,notice:0,info:0}};
 const issues=[...auditPlotLinks(plots.filter(x=>x.projectId===project.id),plotLinks.filter(x=>x.projectId===project.id),chapters),
 ...auditRelationshipHistory(relations.filter(x=>x.projectId===project.id),relationshipHistory.filter(x=>x.projectId===project.id),chapters,characters.filter(x=>x.projectId===project.id)),
 ...auditTimeline(timelineEvents.filter(x=>x.projectId===project.id),chapters)];
 const counts={critical:0,warning:0,notice:0,info:0};issues.forEach(x=>counts[x.severity]=(counts[x.severity]||0)+1);
 return {issues,counts};
}
function parseAuditFindings(reply,project,selectedChapterIds){
 let data;try{data=JSON.parse(clean(reply).replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch(_){throw Error('AI 未返回合法 JSON');}
 if(!data||!Array.isArray(data.findings))throw Error('AI 结果缺少 findings 数组');
 const allowed=new Set(selectedChapterIds||[]),valid=[],rejected=[];
 for(const raw of data.findings.slice(0,15)){
  const chapter=byId(project?.chapters,raw?.chapterId),quote=typeof raw?.quote==='string'?raw.quote:'',title=safeText(raw?.title,100),detail=safeText(raw?.detail,600),suggestion=safeText(raw?.suggestion,500),severity=raw?.severity;
  if(!chapter||!allowed.has(chapter.id)||!SEVERITIES.includes(severity)||quote.length<8||quote.length>120||!chapter.text.includes(quote)||title.length<3||detail.length<12){rejected.push(raw);continue;}
  const at=chapter.text.indexOf(quote);valid.push({id:`audit-${Date.now().toString(36)}-${valid.length}`,chapterId:chapter.id,severity,title,detail,suggestion,quote,offset:at,status:'pending',created:new Date().toISOString(),source:'ai'});
 }
 return {valid,rejectedCount:rejected.length};
}
function buildAuditPayload(project,chapterIds,characters,plots,timelineEvents,relationshipHistory,options={}){
 const maxChapters=Math.max(1,Math.min(5,Number(options.maxChapters)||5)),maxTotalChars=Math.max(800,Math.min(16000,Number(options.maxTotalChars)||14000)),maxEachChars=Math.max(300,Math.min(4200,Number(options.maxEachChars)||4200));
 const allowed=new Set((chapterIds||[]).slice(0,maxChapters)),selected=(project.chapters||[]).filter(c=>allowed.has(c.id)),perChapter=Math.max(1,Math.min(maxEachChars,Math.floor(maxTotalChars/Math.max(1,selected.length))));const chapters=selected.map(c=>{const text=String(c.text||'').slice(0,perChapter);return {id:c.id,title:safeText(c.title,100),text,truncated:text.length<String(c.text||'').length};});
 const payload={workTitle:safeText(project.title,100),genre:safeText(project.genre,100),summary:safeText(project.summary,700),chapters,limits:{maxTotalChars,maxEachChars,maxChapters},
 characters:(characters||[]).slice(0,18).map(c=>({id:c.id,name:safeText(c.name,60),role:safeText(c.role,100),personality:safeText(c.personality,300),goal:safeText(c.goal,240)})),
 plotThreads:(plots||[]).slice(0,30).map(p=>({id:p.id,title:safeText(p.title,100),type:safeText(p.type,40),status:safeText(p.status,40)})),
 timeline:(timelineEvents||[]).slice(0,40).map(e=>({title:safeText(e.title,100),storyDate:safeText(e.storyDate,20),chapterId:e.chapterId,isFlashback:!!e.isFlashback})),
 relationshipChanges:(relationshipHistory||[]).slice(-50).map(e=>({chapterId:e.chapterId,afterType:safeText(e.afterType,70)}))};
 if(options.maxPayloadChars)fitAuditPayload(payload,options.maxPayloadChars);
 return payload;
}
function fitAuditPayload(payload,budget){
 const sources=payload.chapters.map(chapter=>chapter.text);
 const truncated=payload.chapters.map(chapter=>chapter.truncated);
 const setLength=length=>payload.chapters.forEach((chapter,index)=>{
  let end=Math.min(length,sources[index].length);
  if(end<sources[index].length&&/[\uD800-\uDBFF]/.test(sources[index][end-1]||''))end--;
  chapter.text=sources[index].slice(0,end);
  chapter.truncated=truncated[index]||end<sources[index].length;
 });
 if(JSON.stringify(payload).length<=budget)return;
 setLength(0);
 // Leave most of a small local context for manuscript evidence.
 for(const key of ['relationshipChanges','timeline','plotThreads','characters']){
  while(payload[key].length&&JSON.stringify(payload).length>budget/2)payload[key].pop();
 }
 if(JSON.stringify(payload).length>budget/2)payload.summary='';
 if(JSON.stringify(payload).length>=budget)throw Error('章节资料超过上下文容量，请减少所选章节');
 let low=0,high=Math.max(0,...sources.map(value=>value.length));
 while(low<high){
  const size=Math.ceil((low+high)/2);setLength(size);
  if(JSON.stringify(payload).length<=budget)low=size;else high=size-1;
 }
 setLength(low);
}
function validateFindingDecision(finding,project){if(!finding||finding.status!=='pending')throw Error('该审查意见已处理');if(!byId(project?.chapters,finding.chapterId))throw Error('原章节已不存在');const ch=byId(project.chapters,finding.chapterId);if(!ch.text.includes(finding.quote))throw Error('原文已修改，证据引用失效，请重新检查');return true;}
return {LINK_STAGES,EVENT_TYPES,SEVERITIES,validatePlotLink,auditPlotLinks,relationStateAt,createRelationshipEvent,applyLatestRelationship,auditRelationshipHistory,validateTimelineEvent,sortTimeline,auditTimeline,auditContinuity,parseAuditFindings,buildAuditPayload,validateFindingDecision,chapterIndex};
});
