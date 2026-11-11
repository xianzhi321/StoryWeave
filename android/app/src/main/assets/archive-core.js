(function (root, factory) {
  const api = factory(root ? root.StoryWeaveNarrativeCore : require('./narrative-core.js'));
  if (root) root.StoryWeaveArchiveCore = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? null : window, function (Narrative) {
  'use strict';
  const growthFields = {personality: 500, goal: 500, belief: 500, emotion: 500, cause: 1000};
  const kinds = ['event', 'action', 'relationship'];
  const own = (state, key, projectId) => (Array.isArray(state[key]) ? state[key] : [])
    .filter(row => row && row.projectId === projectId);
  const text = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
  const uniqueIds = values => [...new Set(Array.isArray(values) ? values.filter(x => typeof x === 'string') : [])];
  const byId = (rows, key) => rows.find(row => row.id === key);

  function growthAt(role, chapterId, chapters, rows) {
    const through = Narrative.chapterIndex(chapters, chapterId);
    const records = rows.filter(row => row.roleId === role.id && row.projectId === role.projectId)
      .map(row => ({row, position: Narrative.chapterIndex(chapters, row.chapterId)}))
      .filter(item => item.position >= 0 && item.position <= through)
      .sort((a, b) => a.position - b.position);
    return {...role, ...Object.fromEntries(Object.keys(growthFields).map(field => [
      field, records.length ? records[records.length - 1].row[field] : role[field] || '',
    ]))};
  }

  function growthRecord(raw, project, roles) {
    if (!byId(project.chapters, raw.chapterId) || !byId(roles, raw.roleId)) throw Error('请选择当前作品的章节和人物');
    const row = Object.fromEntries(Object.entries(growthFields).map(([field, limit]) => [field, text(raw[field], limit)]));
    if (!row.cause) throw Error('请记录促成这一变化的原因');
    return {...row, id: raw.id, projectId: project.id, roleId: raw.roleId, chapterId: raw.chapterId};
  }

  function relationshipsAt(project, chapterId, relations, history) {
    const scoped = history.filter(row => row.projectId === project.id);
    return relations.map(relation => ({...relation, ...Narrative.relationStateAt(relation, chapterId, project.chapters, scoped)}));
  }

  function cleanScene(scene, roles, events) {
    const allowed = new Set(roles.map(role => role.id));
    const eventIds = new Set(events.filter(event => !event.chapterId || event.chapterId === scene.chapterId).map(event => event.id));
    return {...scene, location: text(scene.location, 160), storyTime: text(scene.storyTime, 120),
      participants: uniqueIds(scene.participants).filter(key => allowed.has(key)).slice(0, 50),
      eventIds: uniqueIds(scene.eventIds).filter(key => eventIds.has(key)).slice(0, 50)};
  }

  function archiveBatches(chapter, roles, relations, limit) {
    const body = chapter.text;
    const cast = roles.slice(0, 20).map(role => ({id: role.id, name: text(role.name, 45)}));
    const ids = new Set(cast.map(role => role.id));
    const links = relations.filter(r => !r.private && ids.has(r.a) && ids.has(r.b)).slice(0, 20)
      .map(r => ({id: r.id, a: r.a, b: r.b}));
    const payload = {chapter: text(chapter.title, 80), cast, relations: links, text: ''};
    while (JSON.stringify(payload).length > limit / 2 && links.length) links.pop();
    while (JSON.stringify(payload).length > limit / 2 && cast.length) {
      const removed = cast.pop();
      payload.relations = payload.relations.filter(r => r.a !== removed.id && r.b !== removed.id);
    }
    const batches = [];
    for (let start = 0; start < body.length;) {
      let low = start, high = Math.min(body.length, start + limit);
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (JSON.stringify({...payload, text: body.slice(start, middle)}).length <= limit) low = middle;
        else high = middle - 1;
      }
      let end = low;
      if (end < body.length && /[\uD800-\uDBFF]/.test(body[end - 1] || '')) end--;
      if (end <= start) throw Error('模型上下文不足，无法整理正文');
      const paragraph = body.lastIndexOf('\n', end - 1);
      if (end < body.length && paragraph > start + (end - start) * 0.8) end = paragraph + 1;
      const passage = body.slice(start, end);
      if (passage.trim()) batches.push({start, end, payload: {...payload, text: passage}});
      start = end;
    }
    return batches;
  }

  function archiveFields(raw) {
    if (!kinds.includes(raw.kind) || typeof raw.quote !== 'string' || raw.quote.trim().length < 8 || raw.quote.length > 120) return null;
    const title = text(raw.title, 100), detail = text(raw.detail, 600);
    if (title.length < 2 || detail.length < 4) return null;
    if (raw.kind === 'action' && typeof raw.roleId !== 'string') return null;
    if (raw.kind === 'relationship' && (typeof raw.relationId !== 'string' || text(raw.afterType, 70).length < 2)) return null;
    return {kind: raw.kind, title, detail, quote: raw.quote,
      participants: raw.kind === 'event' ? uniqueIds(raw.participants).slice(0, 20) : [],
      roleId: raw.kind === 'action' ? raw.roleId : '',
      relationId: raw.kind === 'relationship' ? raw.relationId : '',
      afterType: raw.kind === 'relationship' ? text(raw.afterType, 70) : '',
      location: raw.kind === 'event' ? text(raw.location, 100) : '',
      storyDate: raw.kind === 'event' ? text(raw.storyDate, 20) : ''};
  }

  function parseArchive(reply, batch) {
    const result = JSON.parse(String(reply).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    if (!Array.isArray(result?.items)) throw Error('AI 结果缺少 items 列表');
    const roleIds = new Set(batch.payload.cast.map(role => role.id));
    const relationIds = new Set(batch.payload.relations.map(relation => relation.id));
    return result.items.slice(0, 12).flatMap(raw => {
      const item = raw && archiveFields(raw);
      if (!item) return [];
      const index = batch.payload.text.indexOf(item.quote);
      if (index < 0 || (item.roleId && !roleIds.has(item.roleId)) || (item.relationId && !relationIds.has(item.relationId)) ||
          item.participants.some(key => !roleIds.has(key))) return [];
      if (!batch.payload.text.includes(item.location)) item.location = '';
      if (!/^\d{1,6}(?:-\d{2}(?:-\d{2})?)?$/.test(item.storyDate) || !batch.payload.text.includes(item.storyDate)) item.storyDate = '';
      return [{...item, offset: batch.start + index}];
    });
  }

  function normalize(state) {
    const projects = new Map(state.projects.map(project => [project.id, project]));
    const roles = new Map(), relations = new Map(), events = new Map();
    for (const projectId of projects.keys()) {
      roles.set(projectId, own(state, 'characters', projectId));
      relations.set(projectId, own(state, 'relations', projectId));
      events.set(projectId, own(state, 'timelineEvents', projectId));
    }
    const valid = row => row && typeof row.id === 'string' && byId(projects.get(row.projectId)?.chapters || [], row.chapterId);
    const growth = new Map();
    for (const row of Array.isArray(state.characterGrowth) ? state.characterGrowth : []) {
      if (!valid(row)) continue;
      try {
        const record = growthRecord(row, projects.get(row.projectId), roles.get(row.projectId));
        growth.set(JSON.stringify([record.projectId, record.roleId, record.chapterId]), record);
      } catch (_) { /* Skip invalid imported references. */ }
    }
    const seen = new Set();
    const archive = (Array.isArray(state.archiveRecords) ? state.archiveRecords : []).flatMap(row => {
      if (!valid(row) || !['pending', 'approved', 'dismissed'].includes(row.status) || seen.has(row.id)) return [];
      const fields = archiveFields(row);
      if (!fields || (fields.roleId && !byId(roles.get(row.projectId), fields.roleId)) ||
          (fields.relationId && !byId(relations.get(row.projectId), fields.relationId))) return [];
      fields.participants = fields.participants.filter(key => byId(roles.get(row.projectId), key));
      seen.add(row.id);
      return [{...fields, id: row.id, projectId: row.projectId, chapterId: row.chapterId, status: row.status,
        offset: Number.isSafeInteger(row.offset) && row.offset >= 0 ? row.offset : -1, created: text(row.created, 40),
        targetId: text(row.targetId, 100), relationVersion: text(row.relationVersion, 120)}];
    });
    return {characterGrowth: [...growth.values()], archiveRecords: archive,
      sceneCards: (state.sceneCards || []).filter(valid).map(scene => cleanScene(scene, roles.get(scene.projectId), events.get(scene.projectId)))};
  }

  function scan(state, project) {
    const rows = key => own(state, key, project.id);
    const roleIds = new Set(rows('characters').map(role => role.id));
    const chapterIds = new Set(project.chapters.map(chapter => chapter.id));
    const events = rows('timelineEvents');
    const issues = Narrative.auditContinuity({project, characters: rows('characters'), plots: rows('plots'),
      plotLinks: rows('plotChapterLinks'), relations: rows('relations'), relationshipHistory: rows('relationshipHistory'),
      timelineEvents: events}).issues;
    const add = (title, detail, chapterId) => issues.push({severity: 'warning', title, detail, chapterId});
    for (const fact of rows('canonFacts')) {
      for (const [roleId, view] of Object.entries(fact.views || {})) {
        if (!roleIds.has(roleId) || !view || !['unknown', 'known', 'suspected', 'mistaken'].includes(view.status) ||
            (view.sinceChapterId && !chapterIds.has(view.sinceChapterId))) {
          add('认知记录引用失效', fact.title, view?.sinceChapterId);
        }
        if (['suspected', 'mistaken'].includes(view?.status) && !text(view.belief, 1200)) {
          add('怀疑或误解缺少具体内容', fact.title, view.sinceChapterId);
        }
      }
    }
    for (const link of rows('plotChapterLinks')) {
      if (!chapterIds.has(link.chapterId)) add('伏笔关联的章节已失效', byId(rows('plots'), link.plotId)?.title || '未找到伏笔');
    }
    for (const event of events) {
      if (uniqueIds(event.participants).some(key => !roleIds.has(key))) add('世界事件含失效人物', event.title, event.chapterId);
    }
    for (const scene of rows('sceneCards')) {
      if (!chapterIds.has(scene.chapterId) || uniqueIds(scene.participants).some(key => !roleIds.has(key))) {
        add('场景含失效章节或人物', scene.title, scene.chapterId);
      }
      for (const key of uniqueIds(scene.eventIds)) {
        const event = byId(events, key);
        if (!event || (event.chapterId && event.chapterId !== scene.chapterId)) {
          add('场景与世界事件的章节不一致', scene.title + ' · ' + (event?.title || '事件已删除'), scene.chapterId);
        }
        if (event?.participants?.length && scene.participants?.length && !event.participants.some(key => scene.participants.includes(key))) {
          add('场景与所关联事件没有共同人物', scene.title + ' · ' + event.title, scene.chapterId);
        }
      }
    }
    for (const row of rows('characterGrowth')) {
      if (!roleIds.has(row.roleId) || !chapterIds.has(row.chapterId) || !text(row.cause, 1000)) {
        add('人物成长记录缺少有效人物、章节或变化原因', '请检查人物成长轨迹。', row.chapterId);
      }
    }
    for (const item of rows('archiveRecords')) {
      if (item.status === 'pending' && !evidenceMatches(byId(project.chapters, item.chapterId), item)) {
        add('待审核的剧情归档证据已变化', item.title, item.chapterId);
      }
    }
    return issues;
  }

  function evidenceMatches(chapter, item) {
    return !!chapter && item.offset >= 0 && chapter.text.slice(item.offset, item.offset + item.quote.length) === item.quote;
  }

  return {growthFields, growthAt, growthRecord, relationshipsAt, cleanScene, archiveBatches, parseArchive, normalize, scan, evidenceMatches};
});
