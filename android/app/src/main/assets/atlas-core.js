(function (root, factory) {
  const api = factory();
  if (root) root.StoryWeaveAtlasCore = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';
  const own = (state, key, projectId) => (Array.isArray(state[key]) ? state[key] : []).filter(row => row?.projectId === projectId);
  const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const find = (rows, id) => rows.find(row => row.id === id);
  const placeTypes = ['城市', '村庄', '地区', '山脉', '河流', '森林', '道路', '港口', '遗迹', '其他'];
  const placeKey = value => typeof value === 'string' ? value.trim().normalize('NFKC').toLocaleLowerCase() : '';
  const placeKeys = place => [place.name,...(place.aliases || [])].map(placeKey).filter(Boolean);

  function validMap(raw, projectId) {
    if (!raw || !raw.id || !projectId || !['fiction', 'earth'].includes(raw.mode)) throw Error('地图类型无效');
    const title = text(raw.title, 100);
    if (!title) throw Error('请填写地图名称');
    const width = Number(raw.width), height = Number(raw.height);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096) {
      throw Error('地图尺寸须在 1–4096 之间');
    }
    const image = raw.image || '';
    if (typeof image !== 'string' || image.length > 6000000 ||
        (image && !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image))) throw Error('地图图片格式无效或过大');
    const bounds = {west: Number(raw.bounds?.west ?? -180), south: Number(raw.bounds?.south ?? -90),
      east: Number(raw.bounds?.east ?? 180), north: Number(raw.bounds?.north ?? 90)};
    if (Object.values(bounds).some(value => !Number.isFinite(value)) || bounds.west < -180 || bounds.east > 180 ||
        bounds.south < -90 || bounds.north > 90 || bounds.west >= bounds.east || bounds.south >= bounds.north) {
      throw Error('经纬度范围无效，东西边界须递增，南北边界须递增');
    }
    const map = {id: raw.id, projectId, title, mode: raw.mode, width, height, image, bounds};
    const gen = raw.generation;
    if (raw.mode === 'fiction' && gen?.engine === 'Azgaar 1.109.1' && /^[A-Za-z0-9_-]{1,40}$/.test(gen.seed) &&
        ['continents','archipelago','highIsland','pangea','mediterranean','peninsula','volcano'].includes(gen.template) &&
        ['physical','political'].includes(gen.style)) {
      map.generation = {engine:gen.engine, seed:gen.seed, template:gen.template, style:gen.style};
    }
    return map;
  }

  function validPlace(raw, map, projectId) {
    if (!map || map.projectId !== projectId || raw.mapId !== map.id) throw Error('地点必须属于当前作品的地图');
    const name = text(raw.name, 100);
    if (!name) throw Error('请填写地点名称');
    let position = null;
    if (raw.position != null) {
      const {x, y} = raw.position;
      if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) throw Error('坐标必须是有效数字');
      const bounds = map.mode === 'earth' ? map.bounds : {west: 0, south: 0, east: map.width, north: map.height};
      if (x < bounds.west || x > bounds.east || y < bounds.south || y > bounds.north) throw Error('地点坐标超出当前地图范围');
      position = {x, y};
    }
    return {id: raw.id, projectId, mapId: map.id, name, type: placeTypes.includes(raw.type) ? raw.type : '其他',
      aliases: [...new Set((Array.isArray(raw.aliases) ? raw.aliases : []).map(value => text(value, 100)).filter(Boolean))].slice(0, 20),
      description: text(raw.description, 3000), position};
  }

  function matchPlace(places, name) {
    const query = placeKey(name);
    if (!query) return null;
    const matches = places.filter(place => placeKeys(place).includes(query));
    return matches.length === 1 ? matches[0] : null;
  }

  function reviewBindings(state, projectId) {
    const maps = new Map(own(state,'worldMaps',projectId).map(map => [map.id,map]));
    const places = own(state,'worldPlaces',projectId).filter(place => maps.has(place.mapId));
    const placed = new Set(places.map(place => place.id));
    const index = new Map();
    for (const place of places) {
      for (const key of new Set(placeKeys(place))) {
        if (!index.has(key)) index.set(key,[]);
        index.get(key).push(place);
      }
    }
    return visibleEvents(own(state,'timelineEvents',projectId).filter(event => !placed.has(event.locationId))).map(event => {
      const candidates = index.get(placeKey(event.location)) || [];
      const targets = candidates.map(place => [place.id,place.name,place.mapId,maps.get(place.mapId).title,Boolean(place.position)]).sort();
      const reviewKey = JSON.stringify([event.locationId,event.location,event.title,event.chapterId,event.storyDate,targets]);
      return {event,candidates,reviewKey};
    });
  }

  function dateEnd(value) {
    const match = String(value || '').match(/^(\d{1,6})(?:-(\d{2})(?:-(\d{2}))?)?$/);
    if (!match) return null;
    const year = Number(match[1]), month = match[2] ? Number(match[2]) : 12;
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const day = match[3] ? Number(match[3]) : days[month - 1];
    if (month < 1 || month > 12 || day < 1 || day > days[month - 1]) return null;
    return year * 10000 + month * 100 + day;
  }

  function visibleEvents(events, filter = {}) {
    const cutoff = dateEnd(filter.cutoff);
    return events.filter(event => {
      const date = dateEnd(event.storyDate);
      return (!filter.chapterId || event.chapterId === filter.chapterId) &&
        (!filter.roleId || (event.participants || []).includes(filter.roleId)) &&
        (cutoff === null || (date === null ? !!filter.includeUndated : date <= cutoff));
    }).slice().sort((a, b) => (dateEnd(a.storyDate) ?? Infinity) - (dateEnd(b.storyDate) ?? Infinity));
  }

  function roleTrail(events, places, mapId, filter) {
    if (!filter.roleId) return {stops:[],segments:[]};
    const ownPlaces = new Map(places.filter(place=>place.mapId===mapId).map(place=>[place.id,place]));
    const appearances = events.filter(event=>(event.participants || []).includes(filter.roleId));
    const stops = visibleEvents(appearances,filter).flatMap(event => {
      const place = ownPlaces.get(event.locationId);
      return place ? [{event,place}] : [];
    });
    const shown = new Set(stops.map(stop=>stop.event));
    const dated = appearances.flatMap(event => {
      const end = dateEnd(event.storyDate);
      if (end===null) return [];
      const parts = String(event.storyDate).split('-').length;
      const start = parts===1 ? Math.floor(end/10000)*10000+101 :
        parts===2 ? Math.floor(end/100)*100+1 : end;
      return [{event,start,end}];
    }).sort((a,b)=>a.start-b.start||a.end-b.end);
    // Dates with overlapping precision form one unordered group.
    const groups = [];
    for (const item of dated) {
      const last = groups[groups.length-1];
      if (last && item.start<=last.end) {
        last.end = Math.max(last.end,item.end);
        last.size++;
      } else groups.push({event:item.event,end:item.end,size:1});
    }
    const segments = [];
    for (let index=1;index<groups.length;index++) {
      const a = groups[index-1], b = groups[index];
      if (a.size!==1 || b.size!==1 || !shown.has(a.event) || !shown.has(b.event)) continue;
      const from = ownPlaces.get(a.event.locationId), to = ownPlaces.get(b.event.locationId);
      if (from.position && to.position && from.id!==to.id) segments.push({from,to});
    }
    return {stops,segments};
  }

  function normalize(state) {
    const projects = new Set(state.projects.map(project => project.id));
    const worldMaps = [], worldPlaces = [];
    for (const row of state.worldMaps || []) {
      if (!row || typeof row.id !== 'string' || !projects.has(row.projectId)) continue;
      if (worldMaps.some(map => map.id === row.id && map.projectId === row.projectId)) continue;
      try { worldMaps.push(validMap(row, row.projectId)); } catch (_) {}
    }
    for (const row of state.worldPlaces || []) {
      if (!row || typeof row.id !== 'string') continue;
      if (worldPlaces.some(place => place.id === row.id && place.projectId === row.projectId)) continue;
      const map = worldMaps.find(map => map.id === row.mapId && map.projectId === row.projectId);
      try { worldPlaces.push(validPlace(row, map, row.projectId)); } catch (_) {}
    }
    const timelineEvents = (state.timelineEvents || []).map(event => {
      const place = worldPlaces.find(place => place.id === event.locationId && place.projectId === event.projectId);
      return {...event, locationId: place?.id || ''};
    });
    return {worldMaps, worldPlaces, timelineEvents};
  }

  function removePlace(state, projectId, id) {
    return {
      worldPlaces: (state.worldPlaces || []).filter(place => place.projectId !== projectId || place.id !== id),
      timelineEvents: (state.timelineEvents || []).map(event => event.projectId === projectId && event.locationId === id
        ? {...event, locationId: ''} : event),
    };
  }

  function bindEvent(state, projectId, eventId, placeId) {
    const event = find(own(state, 'timelineEvents', projectId), eventId);
    const place = find(own(state, 'worldPlaces', projectId), placeId);
    if (!event || (placeId && !place)) throw Error('事件或地点已删除，请重新选择');
    return (state.timelineEvents || []).map(row => row === event
      ? {...row, locationId: placeId, location: place ? place.name : row.location, updated: new Date().toISOString()} : row);
  }

  function bindReviewedEvents(state, projectId, choices) {
    if (!choices.length) throw Error('请选择要关联的事件');
    const current = new Map(reviewBindings(state,projectId).map(row => [row.event.id,row]));
    const selected = new Map();
    for (const {eventId,placeId,reviewKey} of choices) {
      const row = current.get(eventId);
      const place = row?.candidates.find(candidate => candidate.id === placeId);
      if (!place || row.reviewKey !== reviewKey || selected.has(row.event)) throw Error('事件或地点匹配已变化，请返回地图重新核对');
      selected.set(row.event,place);
    }
    const updated = new Date().toISOString();
    return state.timelineEvents.map(event => {
      const place = selected.get(event);
      return place ? {...event,locationId:place.id,location:place.name,updated} : event;
    });
  }

  return {own, placeTypes, validMap, validPlace, matchPlace, reviewBindings, bindReviewedEvents, dateEnd, visibleEvents, roleTrail, normalize, removePlace, bindEvent};
});
