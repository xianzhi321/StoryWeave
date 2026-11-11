const assert = require('node:assert/strict');
const Core = require('./web/archive-core.js');
const Narrative = require('./web/narrative-core.js');

const project = {id: 'p', chapters: [
  {id: 'one', title: '出发', text: '林澈在雨中拆开信封，发现一张车票。'},
  {id: 'two', title: '揭露', text: '沈雾公开了真相，二人正式结盟。'},
  {id: 'three', title: '黎明', text: '档案终于公开。'},
]};
const roles = [{id:'a', projectId:'p', name:'林澈', personality:'谨慎', goal:'找证人', secret:'隐藏文字'},
  {id:'b', projectId:'p', name:'沈雾'}];
const foreign = {id:'other', projectId:'foreign', name:'另一作品人物'};
const relation = {id:'r', projectId:'p', a:'a', b:'b', type:'盟友', trust: 40, initialType:'陌生', initialTrust:0};
const history = [{id:'h', projectId:'p', relationId:'r', a:'a', b:'b', chapterId:'two', afterType:'盟友', afterTrust:40}];
const growth = Core.growthRecord({id:'g', roleId:'a', chapterId:'two', goal:'查清真相', belief:'同伴可信', cause:'沈雾公开真相'}, project, roles);
assert.equal(Core.growthAt(roles[0], 'one', project.chapters, [growth]).goal, '找证人');
assert.equal(Core.growthAt(roles[0], 'three', project.chapters, [growth]).goal, '查清真相');
assert.equal(Core.growthAt(roles[0], 'three', project.chapters, [growth]).secret, '隐藏文字');
assert.throws(() => Core.growthRecord({...growth, cause:''}, project, roles), /原因/);
assert.equal(Core.relationshipsAt(project, 'one', [relation], history)[0].type, '陌生');
assert.equal(Core.relationshipsAt(project, 'three', [relation], history)[0].trust, 40);
assert.equal(Core.relationshipsAt(project, 'one', [{...relation, initialTrust:undefined}], [])[0].trust, 40);

const events = [{id:'e', projectId:'p', chapterId:'one', participants:['b'], title:'车票'},
  {id:'later', projectId:'p', chapterId:'two', title:'真相'}];
const scene = {id:'s', projectId:'p', chapterId:'one', title:'拆信', viewpoint:'林澈', purpose:'引出悬念',
  participants:['b', 'a', 'a', 'other'], eventIds:['e','later']};
const state = {projects:[project], characters:[...roles,foreign], relations:[relation], relationshipHistory:history,
  timelineEvents:events, sceneCards:[scene], characterGrowth:[growth,{...growth,roleId:'other'}]};
const clean = Core.normalize(state);
assert.deepEqual(clean.sceneCards[0].participants, ['b','a']);
assert.deepEqual(clean.sceneCards[0].eventIds, ['e']);
assert.equal(clean.sceneCards[0].purpose, '引出悬念');
assert.deepEqual(clean.characterGrowth, [growth]);
assert.deepEqual(Core.normalize({...state, characterGrowth:undefined}).characterGrowth, []);
const scan = Core.scan({...state, canonFacts:[{projectId:'p', title:'信封的来历',
  views:{a:{status:'suspected', sinceChapterId:'missing'}}}]}, project);
assert(scan.some(issue => issue.title === '认知记录引用失效'));
assert(scan.some(issue => issue.title === '场景与世界事件的章节不一致'));

const body = project.chapters[0].text + ('😀\\\n\t"' + '正文'.repeat(250)).repeat(8);
const batches = Core.archiveBatches({...project.chapters[0], text:body}, roles,
  [relation, {...relation,id:'private',private:true}], 1200);
assert(batches.length > 1);
assert.equal(batches.map(batch => batch.payload.text).join(''), body);
assert(batches.every(batch => JSON.stringify(batch.payload).length <= 1200));
assert(!batches.some(batch => JSON.stringify(batch).includes('隐藏文字')));
assert.deepEqual(batches[0].payload.relations, [{id:'r',a:'a',b:'b'}]);
const quote = project.chapters[0].text;
const item = {kind:'action', title:'拆开信封', detail:'林澈拆开了信封', roleId:'a', quote};
const parsed = Core.parseArchive(JSON.stringify({items:[
  item, {...item, roleId:'other'}, {...item, quote:'这条证据并没有出现在正文中'},
  {...item, kind:'relationship', relationId:'private', afterType:'结盟'},
  {...item, kind:'event', participants:['other']},
]}), batches[0]);
assert.equal(parsed.length, 1);
assert(Core.evidenceMatches(project.chapters[0], parsed[0]));
assert(!Core.evidenceMatches({...project.chapters[0], text:'前言' + quote}, parsed[0]));
assert.equal(Core.normalize({...state, archiveRecords:[{...parsed[0], id:'ai', projectId:'p',
  chapterId:'one', status:'pending'}]}).archiveRecords.length, 1);

const event = (id, chapterId, storyDate, isFlashback = false) => ({id, chapterId, storyDate, isFlashback, title:id});
assert.deepEqual(Narrative.sortTimeline([event('unknown','one',''),event('new','two','1000'),event('old','three','999')],
  project.chapters).map(e => e.id), ['old','new','unknown']);
assert.equal(Narrative.auditTimeline([event('first','one','2020-12'), event('approx','two','2020'),
  event('memory','three','1900',true)], project.chapters).length, 0);
assert(Narrative.auditTimeline([event('first','one','2020-12'), event('memory','two','1900',true),
  event('late','three','2019')], project.chapters).some(issue => issue.eventId === 'late'));
console.log('PASS v1.1 core: growth, chapter graph, scene ordering/references, scan, archive privacy/evidence, chronology');
