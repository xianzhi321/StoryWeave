(function () {
  'use strict';
  const Core = window.StoryWeaveAtlasCore;
  const own = key => Core.own(state, key, state.selected);
  const maps = () => own('worldMaps'), places = () => own('worldPlaces'), events = () => own('timelineEvents');
  const find = (rows, key) => rows.find(row => row.id === key);
  const opts = (rows, selected, label) => rows.map(row => `<option value="${esc(row.id)}" ${row.id === selected ? 'selected' : ''}>${esc(row[label])}</option>`).join('');
  const field = (name, label, value = '', type = 'text') => `<div class="field"><label for="atlas-${name}">${label}</label><input id="atlas-${name}" name="${name}" type="${type}" value="${esc(value)}" ${type === 'number' ? 'step="any"' : ''}></div>`;
  const empty = message => `<p class="empty-mini">${message}</p>`;
  let view = {projectId: null, mapId: '', cutoff: '', chapterId: '', roleId: '', includeUndated: false, browse:'places'};
  let preferredPlace = '';
  let atlasReturn = null;
  const layers = {places: true, events: true, history: true, trail: false};
  function eventsByPlace(rows) {
    const grouped = new Map();
    for (const event of rows) {
      if (!grouped.has(event.locationId)) grouped.set(event.locationId, []);
      grouped.get(event.locationId).push(event);
    }
    return grouped;
  }

  async function commit(root, button, change, done, onError) {
    if (button.disabled) return;
    const projectId = state.selected;
    button.disabled = true;
    try {
      await window.StoryWeaveWorkspace.transact(next => {
        if (next.selected !== projectId || !next.projects.some(project => project.id === projectId)) throw Error('作品已切换或删除');
        change(next, projectId);
        next.version = 12;
      });
      if (root.isConnected) done();
    } catch (error) {
      if (onError) onError(error);
      else toast('保存失败：' + error.message);
    } finally {
      if (root.isConnected) button.disabled = false;
    }
  }

  function upsert(next, key, item) {
    const rows = (next[key] || []).slice(), index = rows.findIndex(row => row.projectId === item.projectId && row.id === item.id);
    if (index < 0) rows.push(item); else rows[index] = item;
    next[key] = rows;
  }

  function canReturn() {
    return atlasReturn && tab === 'write' && atlasReturn.view.projectId === state.selected &&
      atlasReturn.chapterId === chapter()?.id && Boolean(find(maps(),atlasReturn.view.mapId));
  }
  function returnToMap() {
    if (!canReturn()) return toast('原来的地图或章节已不可用');
    openAtlas(atlasReturn.view.mapId,atlasReturn.placeId,atlasReturn);
  }

  function toLatLng(map, position) {
    return map.mode === 'fiction' ? [map.height - position.y, position.x] : [position.y, position.x];
  }

  function boundsOf(map) {
    return map.mode === 'fiction' ? [[0, 0], [map.height, map.width]]
      : [[map.bounds.south, map.bounds.west], [map.bounds.north, map.bounds.east]];
  }

  function openAtlas(mapId, placeId, snapshot) {
    if (!project()) return toast('先创建作品');
    if (snapshot) {
      view = {...snapshot.view};
      Object.assign(layers,snapshot.layers);
    }
    if (view.projectId !== state.selected) view = {projectId: state.selected, mapId: '', cutoff: '', chapterId: '', roleId: '', includeUndated: false, browse:'places'};
    const mapRows = maps(), placeRows = places();
    const selectedMap = find(mapRows, mapId || view.mapId) || mapRows[0];
    if (!selectedMap) return editMap();
    if (view.mapId !== selectedMap.id) view.browse = 'places';
    view.mapId = selectedMap.id;
    const locations = placeRows.filter(place => place.mapId === selectedMap.id);
    const locationsById = new Map(locations.map(place => [place.id,place]));
    const validMapIds = new Set(mapRows.map(map => map.id));
    const allPlaceIds = new Set(placeRows.filter(place => validMapIds.has(place.mapId)).map(place => place.id));
    const allEvents = events();
    const localEvents = allEvents.filter(event => locationsById.has(event.locationId));
    const unboundEvents = allEvents.filter(event => !allPlaceIds.has(event.locationId));
    const totals = eventsByPlace(localEvents);
    const dates = [...new Set(localEvents.map(event => event.storyDate).filter(date => Core.dateEnd(date) !== null))]
      .sort((a, b) => Core.dateEnd(a) - Core.dateEnd(b));
    if (!dates.includes(view.cutoff)) view.cutoff = '';
    if (!chapters().some(ch => ch.id === view.chapterId)) view.chapterId = '';
    if (!characters().some(role => role.id === view.roleId)) view.roleId = '';
    modal('世界地图与事件', `<div class="atlas-top">
      <div class="field"><label for="atlasMap">当前地图</label><select id="atlasMap">${opts(mapRows, selectedMap.id, 'title')}</select></div>
      <details class="atlas-disclosure" id="atlasManage"><summary>管理地图</summary>
      <div class="atlas-actions"><button id="atlasGenerate" class="button primary">一键生成</button><button id="atlasNewMap" class="button outline">新增地图</button><button id="atlasEditMap" class="button outline">地图设置</button></div></details></div>
      <div class="atlas-workspace"><div><div id="atlasMapCanvas" tabindex="-1" role="region" aria-label="可交互世界地图"></div>
      <div ${dates.length?'':'hidden'}><label class="atlas-time-label" for="atlasTime">故事时间 <strong id="atlasTimeLabel"></strong></label>
      <input id="atlasTime" type="range" min="0" max="${dates.length}" value="${view.cutoff ? dates.indexOf(view.cutoff) : dates.length}" ${dates.length ? '' : 'disabled'}></div>
      <details class="atlas-disclosure" id="atlasFilters" ${snapshot?.filtersOpen?'open':''}><summary>筛选与图层 <small id="atlasFilterSummary"></small></summary>
      <div class="atlas-filters"><div class="field"><label for="atlasChapter">章节</label><select id="atlasChapter"><option value="">全书</option>${opts(chapters(), view.chapterId, 'title')}</select></div>
      <div class="field"><label for="atlasRole">参与人物</label><select id="atlasRole"><option value="">全部人物</option>${opts(characters(), view.roleId, 'name')}</select></div>
      <div class="field"><label for="atlasDate">截至故事日期</label><select id="atlasDate"><option value="">所有日期</option>${dates.map(date => `<option ${date === view.cutoff ? 'selected' : ''}>${esc(date)}</option>`).join('')}</select></div></div>
      <div class="atlas-toggles"><label><input id="atlasUndated" type="checkbox" ${view.includeUndated ? 'checked' : ''}> 包含未定日期事件</label>
      ${Object.entries({places: '地点', events: '事件', history: '历史遗迹'}).map(([key, label]) => `<label><input type="checkbox" data-atlas-layer="${key}" ${layers[key] ? 'checked' : ''}> ${label}</label>`).join('')}
      <label><input id="atlasTrailToggle" type="checkbox" ${layers.trail&&view.roleId?'checked':''}> 人物足迹</label></div>
      <p class="small-note">拖动平移，双指或按钮缩放。${selectedMap.mode === 'fiction' ? '架空坐标从图片左上角起算。' : '地点使用真实经纬度，底图采用等经纬度投影。'}
      年、月精度的事件到该年、月结束时计入。</p></details></div><aside>
      <div class="atlas-browse" role="group" aria-label="地图浏览方式">
        <button type="button" data-atlas-browse="places" aria-pressed="${view.browse==='places'}">地点</button>
        <button type="button" data-atlas-browse="events" aria-pressed="${view.browse==='events'}">事件</button>
      </div>
      <div class="atlas-actions" id="atlasPlaceActions"><button class="button primary" id="atlasAddPlace">添加地点</button>
      <button class="button outline" id="atlasPickPlace">在图上选点</button></div>
      <div class="field"><label for="atlasSearch" id="atlasSearchLabel">查找地点或别名</label><input id="atlasSearch" type="search" maxlength="100"></div>
      <div id="atlasSummary" role="status"></div><div id="atlasPlaces" class="atlas-list"></div>
      </aside></div>
      <details id="atlasTrail" class="panel" hidden ${(snapshot?.trailOpen ?? layers.trail)?'open':''}><summary id="atlasTrailSummary">人物足迹</summary>
      <p class="small-note">虚线连接先后明确、位置已知的相邻事件。记录缺失或日期重叠时会留空。</p>
      <div id="atlasTrailList"></div></details>
      <section id="atlasDetails" class="atlas-detail" tabindex="-1" aria-label="地点详情"></section>
      <details class="panel" id="atlasUnboundPanel" ${snapshot?.unboundOpen?'open':''}><summary>待关联事件（${unboundEvents.length}）</summary>
      ${unboundEvents.length?'<button type="button" class="button outline" id="atlasReviewBindings">批量关联地点</button>':''}
      <div id="atlasUnbound"></div></details>`, root => {
      root.classList.add('atlas-modal');
      const canvas = root.querySelector('#atlasMapCanvas');
      const map = L.map(canvas, {crs: selectedMap.mode === 'fiction' ? L.CRS.Simple : L.CRS.EPSG4326,
        minZoom: -5, maxZoom: 12, attributionControl: false});
      const bounds = boundsOf(selectedMap);
      if (selectedMap.image) L.imageOverlay(selectedMap.image, bounds, {interactive: false}).addTo(map);
      else {
        L.rectangle(bounds, {weight: 1, color: '#b5a98e', fillColor: '#e7e2d5', fillOpacity: 1, interactive: false}).addTo(map);
        for (let i = 1; i < 10; i++) {
          const lat = bounds[0][0] + (bounds[1][0] - bounds[0][0]) * i / 10;
          const lng = bounds[0][1] + (bounds[1][1] - bounds[0][1]) * i / 10;
          L.polyline([[lat, bounds[0][1]], [lat, bounds[1][1]]], {color: '#c3bba8', weight: 1, interactive: false}).addTo(map);
          L.polyline([[bounds[0][0], lng], [bounds[1][0], lng]], {color: '#c3bba8', weight: 1, interactive: false}).addTo(map);
        }
      }
      const trailLayer = L.layerGroup().addTo(map);
      const placeLayer = L.layerGroup().addTo(map), eventLayer = L.layerGroup().addTo(map);
      const selectionLayer = L.layerGroup().addTo(map);
      const previousEvent = find(localEvents,snapshot?.eventId);
      let picking = false, selectedPlace = previousEvent?.locationId || (locationsById.has(placeId) ? placeId : '');
      let selectedEvent = previousEvent?.id || '';
      let visibleByPlace = new Map();
      const detail = root.querySelector('#atlasDetails'), list = root.querySelector('#atlasPlaces');
      const searchField = root.querySelector('#atlasSearch'), searchLabel = root.querySelector('#atlasSearchLabel');
      const placeActions = root.querySelector('#atlasPlaceActions'), pickButton = root.querySelector('#atlasPickPlace');
      const queries = {places:'',events:'',...snapshot?.queries};
      searchField.value = queries[view.browse];
      const normalized = value => value.normalize('NFKC').toLocaleLowerCase();
      const trail = root.querySelector('#atlasTrail'), trailToggle = root.querySelector('#atlasTrailToggle');
      const trailList = root.querySelector('#atlasTrailList'), roleSelect = root.querySelector('#atlasRole');
      const filters = root.querySelector('#atlasFilters'), unbound = root.querySelector('#atlasUnboundPanel');
      function captureAtlas(event) {
        return {
          view:{...view}, placeId:event?.locationId || selectedPlace, eventId:event?.id || selectedEvent,
          queries:{...queries,[view.browse]:searchField.value}, layers:{...layers},
          center:map.getCenter(), zoom:map.getZoom(), mode:selectedMap.mode,
          filtersOpen:filters.open, trailOpen:trail.open, unboundOpen:unbound.open,
          scrollTop:root.scrollTop, listTop:list.scrollTop
        };
      }
      function jumpToChapter(button) {
        const key = button.dataset.atlasChapter;
        if (state.selected !== view.projectId || !find(chapters(),key)) return toast('关联章节已删除或不可用');
        const event = find(localEvents,button.dataset.atlasChapterEvent);
        atlasReturn = {...captureAtlas(event),chapterId:key};
        chapterId = key;
        closeModal();
        go('write');
      }
      const observer = new MutationObserver(() => {
        if (!canvas.isConnected) { observer.disconnect(); map.remove(); }
      });
      observer.observe(document.getElementById('modalRoot'), {childList: true, subtree: true});
      function positionMap() {
        if (snapshot?.mode === selectedMap.mode) map.setView(snapshot.center,snapshot.zoom,{animate:false});
        else {
          map.fitBounds(bounds,{animate:false});
          panToPlace(selectedPlace);
        }
      }
      positionMap();
      requestAnimationFrame(() => {
        if (!canvas.isConnected) return;
        const previousSize = map.getSize();
        map.invalidateSize();
        if (!previousSize.equals(map.getSize())) positionMap();
        if (snapshot) {
          root.scrollTop = snapshot.scrollTop;
          list.scrollTop = snapshot.listTop;
        }
      });
      map.on('click', event => {
        if (!picking) return;
        const position = selectedMap.mode === 'fiction'
          ? {x: event.latlng.lng, y: selectedMap.height - event.latlng.lat} : {x: event.latlng.lng, y: event.latlng.lat};
        try { Core.validPlace({id: 'preview', mapId: selectedMap.id, name: '新地点', position}, selectedMap, state.selected); }
        catch (error) { return toast(error.message); }
        editPlace(selectedMap.id, null, position);
      });
      const dateSelect = root.querySelector('#atlasDate'), range = root.querySelector('#atlasTime');
      function paintTrail() {
        trailLayer.clearLayers();
        const role = find(characters(),view.roleId);
        trailToggle.checked = Boolean(layers.trail && role);
        trail.hidden = !trailToggle.checked;
        if(trail.hidden)return;
        const {stops,segments} = Core.roleTrail(allEvents,locations,selectedMap.id,view);
        for(const {from,to} of segments) {
          L.polyline([toLatLng(selectedMap,from.position),toLatLng(selectedMap,to.position)],
            {className:'atlas-trail-path',color:'#476953',weight:3,dashArray:'7 5',interactive:false}).addTo(trailLayer);
        }
        root.querySelector('#atlasTrailSummary').textContent = `${role.name}的足迹 · ${stops.length} 条记录`;
        trailList.innerHTML = stops.map(({event,place})=>`<article class="context-card"><strong>${esc(event.title)}</strong>
          <small>${esc(event.storyDate || '日期未定')} · ${esc(place.name)}${place.position?'':' · 待定位'}</small>
          <div class="atlas-actions"><button data-atlas-trail-place="${esc(place.id)}">查看地点</button>
          ${find(chapters(),event.chapterId)?`<button data-atlas-chapter="${esc(event.chapterId)}" data-atlas-chapter-event="${esc(event.id)}">打开正文</button>`:''}</div></article>`).join('') ||
          empty('当前地图和筛选范围内暂无记录。');
        for(const button of trailList.querySelectorAll('[data-atlas-trail-place]'))button.onclick = () => selectPlace(button.dataset.atlasTrailPlace);
        wireEvents(trailList,jumpToChapter);
      }
      function refresh() {
        const shown = Core.visibleEvents(localEvents, view);
        visibleByPlace = eventsByPlace(shown);
        const query = normalized(searchField.value.trim());
        const browseEvents = view.browse === 'events';
        placeActions.hidden = browseEvents;
        if (!shown.some(event => event.id === selectedEvent)) selectedEvent = '';
        searchLabel.textContent = browseEvents ? '查找事件或地点' : '查找地点或别名';
        placeLayer.clearLayers(); eventLayer.clearLayers();
        root.querySelector('#atlasTimeLabel').textContent = view.cutoff || '全部时间';
        const filterCount = [view.chapterId,view.roleId,view.cutoff].filter(Boolean).length;
        root.querySelector('#atlasFilterSummary').textContent = filterCount ? `· ${filterCount} 项筛选` : '';
        const filtered = browseEvents ? locations : locations.filter(place => [place.name, ...place.aliases].some(name => normalized(name).includes(query)));
        if (browseEvents) {
          const results = shown.filter(event => {
            const place = locationsById.get(event.locationId);
            return [event.title,place.name,...place.aliases].some(name => normalized(name || '').includes(query));
          });
          const chapterTitles = new Map(chapters().map(ch => [ch.id,ch.title || '未命名章节']));
          root.querySelector('#atlasSummary').textContent = `${results.length} 条事件 · 按故事日期`;
          list.innerHTML = results.map(event => {
            const place = locationsById.get(event.locationId);
            const chapterTitle = chapterTitles.get(event.chapterId);
            return `<div class="atlas-event-row"><button type="button" data-atlas-locate-event="${esc(event.id)}" aria-pressed="${event.id===selectedEvent}">
              <strong>${esc(event.title || '未命名事件')}</strong><small>${esc(event.storyDate || '日期未定')} · ${esc(place.name)}${place.position?'':' · 待定位'}</small></button>
              ${chapterTitle?`<button type="button" data-atlas-chapter="${esc(event.chapterId)}" data-atlas-chapter-event="${esc(event.id)}" aria-label="打开正文：${esc(chapterTitle)}">正文</button>`:''}</div>`;
          }).join('') || empty('没有匹配的地图事件');
        } else {
          root.querySelector('#atlasSummary').textContent = `${filtered.length} 个地点 · ${filtered.filter(place => !place.position).length} 个待定位`;
          list.innerHTML = filtered.map(place =>
            `<button data-atlas-place="${esc(place.id)}" aria-pressed="${place.id===selectedPlace}"><strong>${esc(place.name)}</strong><small>${esc(place.type)} · ${visibleByPlace.get(place.id)?.length || 0} 条事件${place.position ? '' : ' · 待定位'}</small></button>`).join('') || empty('没有匹配地点');
        }
        for (const place of filtered) {
          if (!place.position) continue;
          const related = visibleByPlace.get(place.id) || [];
          const point = toLatLng(selectedMap, place.position);
          const showPlace = place.type === '遗迹' ? layers.history : layers.places;
          if (showPlace) L.circleMarker(point, {radius: 7, color: '#4e5a66', fillColor: '#fff8e9', fillOpacity: 1})
            .bindTooltip(esc(place.name), {direction: 'top'}).on('click', () => selectPlace(place.id)).addTo(placeLayer);
          if (layers.events && related.length) L.marker(point, {
            icon: L.divIcon({className: 'atlas-event-marker', html: String(related.length), iconSize: [24, 24], iconAnchor: [-5, 25]})
          }).bindTooltip(esc(place.name) + ' · ' + related.length + ' 条事件').on('click', () => selectPlace(place.id)).addTo(eventLayer);
        }
        if (selectedPlace) showDetails(selectedPlace);
        highlightPlace();
        paintTrail();
      }
      function panToPlace(key) {
        const place = locationsById.get(key);
        if (place?.position) map.panTo(toLatLng(selectedMap, place.position),{animate:false});
      }
      function highlightPlace() {
        selectionLayer.clearLayers();
        const place = locationsById.get(selectedPlace);
        if (place?.position) L.circleMarker(toLatLng(selectedMap,place.position),{
          className:'atlas-selected-pin',radius:11,weight:3,color:'#2d5845',fill:false,interactive:false
        }).addTo(selectionLayer);
      }
      function selectPlace(key,eventKey = '') {
        selectedPlace = key;
        selectedEvent = eventKey;
        panToPlace(key);
        highlightPlace();
        for(const button of list.querySelectorAll('[data-atlas-place]'))button.setAttribute('aria-pressed',String(button.dataset.atlasPlace===key));
        showDetails(key);
        for(const button of list.querySelectorAll('[data-atlas-locate-event]'))button.setAttribute('aria-pressed',String(button.dataset.atlasLocateEvent===eventKey));
        const target = detail.querySelector('.atlas-event-active') || detail;
        target.focus({preventScroll:true});
        target.scrollIntoView({block:'nearest'});
      }
      list.onclick = event => {
        const button = event.target.closest('[data-atlas-place]');
        if(button)selectPlace(button.dataset.atlasPlace);
        const eventButton = event.target.closest('[data-atlas-locate-event]');
        const selected = eventButton && find(localEvents,eventButton.dataset.atlasLocateEvent);
        if (selected) selectPlace(selected.locationId,selected.id);
        const chapterButton = event.target.closest('[data-atlas-chapter]');
        if (chapterButton) jumpToChapter(chapterButton);
      };
      function showDetails(key) {
        const place = locationsById.get(key);
        if (!place) return;
        const related = visibleByPlace.get(key) || [], all = totals.get(key) || [];
        const chapterIds = new Set(related.map(event=>event.chapterId));
        const linkedChapters = chapters().filter(ch=>chapterIds.has(ch.id));
        const people = [...new Set(related.flatMap(event => event.participants || []))];
        detail.innerHTML = `<div class="flex-between"><h3>${esc(place.name)}</h3><button id="atlasEditPlace" class="button outline">编辑地点</button></div>
          <p>${esc(place.description || '还没有地点说明。')}</p><small>${place.position ? (selectedMap.mode === 'fiction' ? 'X / Y ' : '经度 / 纬度 ') + place.position.x.toFixed(3) + ' / ' + place.position.y.toFixed(3) : '坐标待定位'}</small>
          <p>相关人物 · ${esc(people.map(key => find(characters(), key)?.name || '已删除人物').join('、') || '当前筛选范围内暂无记录')}</p>
          <div class="atlas-actions"><button class="button primary" id="atlasNewEvent">在这里记录事件</button>
          <button class="button outline" id="atlasLinkEvent">关联已有事件</button>
          ${place.position?'<button class="button outline" id="atlasShowOnMap">查看地图位置</button>':''}</div>
          ${linkedChapters.length?`<details class="atlas-chapter-links"><summary>关联章节 · ${linkedChapters.length} 章</summary>
          <div class="atlas-actions">${linkedChapters.map(ch=>`<button data-atlas-chapter="${esc(ch.id)}">${esc(ch.title || '未命名章节')}</button>`).join('')}</div></details>`:''}
          ${all.length>related.length?`<p class="small-note">当前筛选显示 ${related.length} / ${all.length} 条事件。</p>
          <button class="button outline" id="atlasClearEventFilters">查看该地点的全部事件</button>`:''}
          <div class="atlas-event-list">${related.map(event=>eventCard(event,event.id===selectedEvent)).join('') || empty('当前时间和章节筛选内没有事件。')}</div>`;
        detail.querySelector('#atlasEditPlace').onclick = () => editPlace(selectedMap.id, key);
        detail.querySelector('#atlasNewEvent').onclick = () => { preferredPlace = key; window.StoryWeaveContinuity.editEvent(); };
        detail.querySelector('#atlasLinkEvent').onclick = () => bindExisting(key);
        const showMap = detail.querySelector('#atlasShowOnMap');
        if (showMap) showMap.onclick = () => {
          panToPlace(key);
          canvas.focus({preventScroll:true});
          canvas.scrollIntoView({block:'nearest'});
        };
        const clear = detail.querySelector('#atlasClearEventFilters');
        if(clear)clear.onclick = () => {
          view.cutoff = view.chapterId = view.roleId = '';
          dateSelect.value = root.querySelector('#atlasChapter').value = root.querySelector('#atlasRole').value = '';
          range.value = dates.length;
          refresh();
          detail.focus({preventScroll:true});
        };
        wireEvents(detail,jumpToChapter);
      }
      root.querySelector('#atlasMap').onchange = event => openAtlas(event.target.value);
      root.querySelector('#atlasGenerate').onclick = () => StoryWeaveGenerator.open();
      root.querySelector('#atlasNewMap').onclick = () => editMap();
      root.querySelector('#atlasEditMap').onclick = () => editMap(selectedMap.id);
      root.querySelector('#atlasAddPlace').onclick = () => editPlace(selectedMap.id);
      function setPicking(value) {
        picking = value;
        pickButton.textContent = picking ? '点选地图位置（取消）' : '在图上选点';
        canvas.style.cursor = picking ? 'crosshair' : '';
      }
      pickButton.onclick = () => setPicking(!picking);
      searchField.oninput = refresh;
      const browseButtons = [...root.querySelectorAll('[data-atlas-browse]')];
      for (const button of browseButtons) button.onclick = () => {
        const next = button.dataset.atlasBrowse;
        if (next === view.browse) return;
        queries[view.browse] = searchField.value;
        view.browse = next;
        if (next === 'events') setPicking(false);
        searchField.value = queries[next];
        for (const item of browseButtons) item.setAttribute('aria-pressed',String(item===button));
        refresh();
      };
      root.querySelector('#atlasChapter').onchange = event => { view.chapterId = event.target.value; refresh(); };
      roleSelect.onchange = event => { view.roleId = event.target.value; refresh(); };
      trailToggle.onchange = () => {
        if(!view.roleId){
          trailToggle.checked = false;
          roleSelect.focus();
          return toast('先选择要查看的人物');
        }
        layers.trail = trailToggle.checked;
        trail.open = layers.trail;
        paintTrail();
      };
      dateSelect.onchange = () => { view.cutoff = dateSelect.value; range.value = view.cutoff ? dates.indexOf(view.cutoff) : dates.length; refresh(); };
      range.oninput = () => { view.cutoff = dates[Number(range.value)] || ''; dateSelect.value = view.cutoff; refresh(); };
      root.querySelector('#atlasUndated').onchange = event => { view.includeUndated = event.target.checked; refresh(); };
      root.querySelectorAll('[data-atlas-layer]').forEach(box => box.onchange = () => { layers[box.dataset.atlasLayer] = box.checked; refresh(); });
      const review = root.querySelector('#atlasReviewBindings');
      if (review) review.onclick = () => {
        const saved = captureAtlas();
        openBindingReview(() => openAtlas(selectedMap.id,saved.placeId,saved));
      };
      root.querySelector('#atlasUnbound').innerHTML = unboundEvents.map(event=>eventCard(event)).join('') || empty('所有事件已有地点关联。');
      wireEvents(root.querySelector('#atlasUnbound'),jumpToChapter);
      refresh();
    });
  }

  function eventCard(event, active = false) {
    return `<article class="sw10-event${active?' atlas-event-active':''}" ${active?'tabindex="-1"':''}><strong>${esc(event.title)}</strong>
      <small>${esc(event.storyDate || '日期未定')} · ${esc(find(chapters(), event.chapterId)?.title || '未关联章节')} · ${esc(event.location || '地点未定')}</small>
      <p>${esc(event.description || '')}</p>${event.consequence ? `<p>当地影响 · ${esc(event.consequence)}</p>` : ''}
      <div class="atlas-actions"><button data-atlas-event="${esc(event.id)}">编辑与定位</button>
      ${find(chapters(), event.chapterId) ? `<button data-atlas-chapter="${esc(event.chapterId)}" data-atlas-chapter-event="${esc(event.id)}">打开正文</button>` : ''}</div></article>`;
  }

  function wireEvents(root, jumpToChapter) {
    root.querySelectorAll('[data-atlas-event]').forEach(button => button.onclick = () => window.StoryWeaveContinuity.editEvent(button.dataset.atlasEvent));
    root.querySelectorAll('[data-atlas-chapter]').forEach(button => button.onclick = () => jumpToChapter(button));
  }

  function openBindingReview(back) {
    const projectId = state.selected, rows = Core.reviewBindings(state,projectId);
    const available = rows.filter(row => row.candidates.length);
    const unique = available.filter(row => row.candidates.length === 1).length;
    const mapTitles = new Map(maps().map(map => [map.id,map.title]));
    const placeLabel = place => [place.name,mapTitles.get(place.mapId),place.position?'':'待定位'].filter(Boolean).join(' · ');
    modal('批量关联地点', `<p class="small-note">${unique} 条唯一匹配 · ${available.length-unique} 条有多个候选 · ${rows.length-available.length} 条待手动整理</p>
      <p class="small-note">按原记录中的地点名称或别名匹配。选好后再确认保存。</p>
      <fieldset class="atlas-bind-controls">
      ${unique?'<button type="button" class="button outline" id="atlasSelectUnique">全选唯一匹配</button>':''}
      <div class="atlas-bind-list">${available.map(({event,candidates},index) => `
        <label class="atlas-bind-row">
          <span><strong>${esc(event.title || '未命名事件')}</strong><small>原地点：${esc(event.location || '未填写')} · ${esc(event.storyDate || '日期未定')}</small></span>
          ${candidates.length===1?`<span class="atlas-bind-unique"><input type="checkbox" data-atlas-review="${index}" value="${esc(candidates[0].id)}">
            ${esc(placeLabel(candidates[0]))}</span>`:`<select data-atlas-review="${index}"><option value="">选一个候选地点</option>
            ${candidates.map(place=>`<option value="${esc(place.id)}">${esc(placeLabel(place))}</option>`).join('')}</select>`}
        </label>`).join('') || empty('还没有可以关联的地点。可在地图上编辑待关联事件。')}</div>
      </fieldset>
      <p class="small-note" id="atlasBindingStatus" role="status"></p><div class="atlas-actions">
      <button type="button" class="button primary" id="atlasApplyBindings" disabled>关联所选事件</button>
      <button type="button" class="button outline" id="atlasBindingBack">返回地图</button></div>`, root => {
      const fields = [...root.querySelectorAll('[data-atlas-review]')];
      const controls = root.querySelector('.atlas-bind-controls'), save = root.querySelector('#atlasApplyBindings');
      const status = root.querySelector('#atlasBindingStatus'), close = root.querySelector('#modalClose');
      const cancel = root.querySelector('#atlasBindingBack'), selectAll = root.querySelector('#atlasSelectUnique');
      const exactFields = fields.filter(field => field.type === 'checkbox');
      const allUniqueSelected = () => exactFields.every(field => field.checked);
      const chosen = () => fields.filter(field => field.type === 'checkbox' ? field.checked : field.value).map(field => {
        const {event,reviewKey} = available[Number(field.dataset.atlasReview)];
        return {eventId:event.id,placeId:field.value,reviewKey};
      });
      function update() {
        const count = chosen().length;
        save.disabled = !count;
        if (selectAll) selectAll.textContent = allUniqueSelected() ? '取消全选唯一匹配' : '全选唯一匹配';
        status.textContent = `已选 ${count} 条事件`;
      }
      controls.onchange = update;
      if (selectAll) selectAll.onclick = () => {
        const checked = !allUniqueSelected();
        for (const field of exactFields) field.checked = checked;
        update();
      };
      cancel.onclick = back;
      root.closest('.modal-backdrop').addEventListener('click',event=>{
        if (close.disabled && event.target.classList.contains('modal-backdrop')) event.stopImmediatePropagation();
      },true);
      save.onclick = async () => {
        if (save.disabled || close.disabled) return;
        const selected = chosen();
        let failure = '';
        controls.disabled = close.disabled = cancel.disabled = true;
        status.textContent = '正在保存…';
        await commit(root,save,(next,key)=>{
          if (key !== projectId) throw Error('作品已切换');
          next.timelineEvents = Core.bindReviewedEvents(next,key,selected);
        },()=>{
          render();
          back();
          toast(`已关联 ${selected.length} 条事件`);
        },error=>{failure = '保存失败：'+error.message;});
        if (root.isConnected) {
          controls.disabled = close.disabled = cancel.disabled = false;
          update();
          if (failure) status.textContent = failure;
        }
      };
      update();
    });
  }

  async function readImage(file) {
    if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
      throw Error('请选择不超过 8MB 的 PNG、JPEG 或 WebP 图片');
    }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(Error('图片无法解码，请重新导出为 PNG 或 JPEG'));
        image.src = url;
      });
      const ratio = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      const context = canvas.getContext('2d');
      context.fillStyle = '#f3efdf'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/jpeg', 0.9);
      if (data.length > 6000000) throw Error('压缩后图片仍然过大，请选用较小图片');
      return {image: data, width: canvas.width, height: canvas.height};
    } finally { URL.revokeObjectURL(url); }
  }

  function editMap(key) {
    if (!project()) return;
    const old = find(maps(), key);
    let asset = {generation: old?.generation, image: old?.image || '', width: old?.width || 1000, height: old?.height || 700}, loading = false;
    modal(old ? '地图设置' : '新建世界地图', `${!old ? '<button id="atlasGenerateEmpty" class="button primary">一键生成架空地图</button><p class="small-note">或在下方导入自己的地图</p>' : ''}${old?.generation ? '<p class="small-note">生成种子：'+esc(old.generation.seed)+' · '+esc(old.generation.engine)+' · '+esc(StoryWeaveGeneratorCore.templates[old.generation.template])+' · '+(old.generation.style === 'physical' ? '自然地形' : '国家分区')+'</p><button id="atlasRecreate" class="button outline">按原始设置生成新地图</button>' : ''}${field('title', '地图名称', old?.title)}
      <div class="field"><label for="atlas-mode">坐标体系</label><select id="atlas-mode" name="mode" ${old ? 'disabled' : ''}><option value="fiction">架空世界 · 图片坐标</option><option value="earth">真实地理 · 经度纬度</option></select></div>
      <div class="field"><label for="atlasImage">导入地图图片</label><input id="atlasImage" type="file" accept="image/png,image/jpeg,image/webp"></div>
      <p class="small-note">支持手绘地图和 Azgaar 导出的 PNG 图片，最长边自动缩至 2048 像素。图片随作品备份保存。每部作品最多 4 张地图。</p>
      <p id="atlasImageStatus" role="status">${asset.image ? '已有地图图片' : '也可先创建空白坐标网格，再添加地点。'}</p>
      <div id="atlasEarthBounds"><p>真实地理底图须采用等经纬度投影。请填写图片四边对应的经纬度，跨越 180° 的地图需拆分。</p>
        <div class="two-col">${field('west', '西边经度', old?.bounds.west ?? -180, 'number')}${field('east', '东边经度', old?.bounds.east ?? 180, 'number')}
        ${field('south', '南边纬度', old?.bounds.south ?? -90, 'number')}${field('north', '北边纬度', old?.bounds.north ?? 90, 'number')}</div></div>
      <div class="form-actions"><button class="button primary" id="atlasSaveMap">保存地图</button>
      ${old ? '<button class="button outline" id="atlasDeleteMap">删除地图</button>' : ''}</div>`, root => {
      root.querySelector('#atlasRecreate')?.addEventListener('click', () => StoryWeaveGenerator.open(old.generation));
      root.querySelector('#atlasGenerateEmpty')?.addEventListener('click', () => StoryWeaveGenerator.open());
      const mode = root.querySelector('[name="mode"]'), save = root.querySelector('#atlasSaveMap');
      mode.value = old?.mode || 'fiction';
      mode.onchange = () => { root.querySelector('#atlasEarthBounds').hidden = mode.value !== 'earth'; };
      mode.onchange();
      root.querySelector('#atlasImage').onchange = async event => {
        if (!event.target.files[0]) return;
        loading = true; save.disabled = true;
        root.querySelector('#atlasImageStatus').textContent = '正在处理地图图片…';
        try {
          asset = await readImage(event.target.files[0]);
          if (root.isConnected) root.querySelector('#atlasImageStatus').textContent = `图片已载入 · ${asset.width} × ${asset.height}`;
        } catch (error) { if (root.isConnected) root.querySelector('#atlasImageStatus').textContent = error.message; }
        finally { loading = false; if (root.isConnected) save.disabled = false; }
      };
      save.onclick = () => {
        if (loading) return;
        let saved;
        return commit(root, save, (next, projectId) => {
          const current = Core.own(next, 'worldMaps', projectId);
          if (old && !find(current, old.id)) throw Error('地图已删除');
          if (!old && current.length >= 4) throw Error('每部作品最多保存 4 张地图');
          const bounds = Object.fromEntries(['west', 'south', 'east', 'north'].map(name => [name, Number(formVal(root, name))]));
          saved = Core.validMap({...asset, id: old?.id || id(), title: formVal(root, 'title'), mode: mode.value, bounds}, projectId);
          const related = Core.own(next, 'worldPlaces', projectId).filter(place => place.mapId === saved.id);
          // Preserve relative positions when replacing a resized fictional image.
          const updated = related.map(place => Core.validPlace({...place, position: place.position && saved.mode === 'fiction'
            ? {x: place.position.x * saved.width / old.width, y: place.position.y * saved.height / old.height} : place.position}, saved, projectId));
          next.worldPlaces = (next.worldPlaces || []).map(place => find(updated, place.id) && place.projectId === projectId ? find(updated, place.id) : place);
          upsert(next, 'worldMaps', saved);
        }, () => { render(); openAtlas(saved.id); });
      };
      const remove = root.querySelector('#atlasDeleteMap');
      if (remove) remove.onclick = () => {
        if (!confirm('删除这张地图及其地点？已记录事件会保留，地点关联将解除。')) return;
        return commit(root, remove, (next, projectId) => {
          const ids = new Set(Core.own(next, 'worldPlaces', projectId).filter(place => place.mapId === old.id).map(place => place.id));
          next.worldMaps = next.worldMaps.filter(map => map.projectId !== projectId || map.id !== old.id);
          next.worldPlaces = (next.worldPlaces || []).filter(place => place.projectId !== projectId || !ids.has(place.id));
          next.timelineEvents = (next.timelineEvents || []).map(event => event.projectId === projectId && ids.has(event.locationId) ? {...event, locationId: ''} : event);
        }, () => { closeModal(); render(); });
      };
    });
  }

  function editPlace(mapId, key, position) {
    const map = find(maps(), mapId), old = find(places(), key);
    if (!map) return toast('地图已删除');
    const point = position || old?.position;
    modal(old ? '编辑地点' : '新建地点', `${field('name', '地点名称', old?.name)}
      ${field('aliases', '别名（用逗号分隔）', old?.aliases.join('，'))}
      <div class="field"><label for="atlas-type">地点类别</label><select id="atlas-type" name="type">${Core.placeTypes.map(type => `<option ${old?.type === type ? 'selected' : ''}>${type}</option>`).join('')}</select></div>
      <div class="two-col">${field('x', map.mode === 'fiction' ? '横坐标 X' : '经度', point?.x ?? '', 'number')}
      ${field('y', map.mode === 'fiction' ? '纵坐标 Y' : '纬度', point?.y ?? '', 'number')}</div>
      <p class="small-note">两个坐标都留空可存为待定位地点。</p>
      <div class="field"><label for="atlas-description">地点说明</label><textarea id="atlas-description" name="description" maxlength="3000">${esc(old?.description || '')}</textarea></div>
      <div class="form-actions"><button id="atlasSavePlace" class="button primary">保存地点</button>
      ${old ? '<button id="atlasDeletePlace" class="button outline">删除地点</button>' : ''}</div>`, root => {
      const button = root.querySelector('#atlasSavePlace');
      let saved;
      button.onclick = () => commit(root, button, (next, projectId) => {
        const currentMap = find(Core.own(next, 'worldMaps', projectId), mapId);
        if (old && !find(Core.own(next, 'worldPlaces', projectId), old.id)) throw Error('地点已删除');
        const x = formVal(root, 'x'), y = formVal(root, 'y');
        if ((!x) !== (!y)) throw Error('请同时填写两个坐标，或同时留空');
        saved = Core.validPlace({id: old?.id || id(), mapId, name: formVal(root, 'name'), aliases: formVal(root, 'aliases').split(/[,，]/),
          type: formVal(root, 'type'), description: formVal(root, 'description'), position: x && y ? {x: Number(x), y: Number(y)} : null}, currentMap, projectId);
        upsert(next, 'worldPlaces', saved);
        next.timelineEvents = (next.timelineEvents || []).map(event => event.projectId === projectId && event.locationId === saved.id ? {...event, location: saved.name} : event);
      }, () => { render(); openAtlas(mapId, saved.id); });
      const remove = root.querySelector('#atlasDeletePlace');
      if (remove) remove.onclick = () => {
        if (!confirm('删除此地点并解除事件关联？')) return;
        return commit(root, remove, (next, projectId) => Object.assign(next, Core.removePlace(next, projectId, old.id)),
          () => { render(); openAtlas(mapId); });
      };
    });
  }

  function bindExisting(placeId) {
    const place = find(places(), placeId);
    const candidates = events().filter(event => event.locationId !== placeId);
    modal('关联已有世界事件', `<p>将事件关联到 ${esc(place.name)}。已有地理绑定会被替换。</p>
      <div class="field"><label for="atlasEventChoice">世界事件</label><select id="atlasEventChoice">${opts(candidates, '', 'title')}</select></div>
      <button class="button primary" id="atlasBindEvent" ${candidates.length ? '' : 'disabled'}>确认关联</button>`, root => {
      const button = root.querySelector('#atlasBindEvent');
      button.onclick = () => commit(root, button, (next, projectId) => {
        next.timelineEvents = Core.bindEvent(next, projectId, root.querySelector('#atlasEventChoice').value, placeId);
      }, () => { render(); openAtlas(place.mapId, placeId); });
    });
  }

  function attachEventEditor(root, event) {
    const rows = places();
    const chosen = find(rows, event?.locationId || preferredPlace);
    preferredPlace = '';
    const field = document.createElement('div');
    field.className = 'field';
    field.innerHTML = `<label for="atlasEventPlace">关联地图地点</label><select id="atlasEventPlace">
      <option value="">待关联 · 保留文字地点</option>${rows.map(place => `<option value="${esc(place.id)}" ${place.id === chosen?.id ? 'selected' : ''}>${esc(place.name)} · ${esc(find(maps(), place.mapId)?.title || '')}</option>`).join('')}</select>`;
    const location = root.querySelector('[name="location"]');
    location.closest('.field').after(field);
    const picker = field.querySelector('select');
    const show = document.createElement('button');
    show.className = 'button outline mt12';
    show.textContent = '在地图查看';
    field.append(show);
    show.onclick = () => {
      const place = find(places(), picker.value);
      if (place) openAtlas(place.mapId, place.id);
    };
    picker.onchange = () => {
      const place = find(rows, picker.value);
      location.readOnly = !!place;
      show.disabled = !place;
      if (place) location.value = place.name;
    };
    picker.onchange();
  }

  function eventFromForm(event, root) {
    const key = root.querySelector('#atlasEventPlace')?.value || '';
    if (key && !find(places(), key)) throw Error('地图地点已删除，请重新选择');
    return {...event, locationId: key};
  }

  function chapterPlaceRows(ch) {
    const locations = places();
    if(!locations.length)return [];
    const linked = eventsByPlace(Core.visibleEvents(events().filter(event=>event.chapterId===ch.id)));
    const normalize = value => value.normalize('NFKC').toLocaleLowerCase();
    const text = normalize(ch.text || '');
    return locations.flatMap(place => {
      const items = linked.get(place.id) || [];
      const mentioned = [place.name,...place.aliases].some(name=>text.includes(normalize(name)));
      return items.length||mentioned ? [{place,items}] : [];
    }).sort((a,b)=>Number(b.items.length>0)-Number(a.items.length>0));
  }
  function openChapterPlaces(back) {
    const work = project(), ch = chapter();
    if(!work || !ch)return;
    const rows = chapterPlaceRows(ch);
    modal('本章地点', `<p class="small-note">${esc(ch.title || '未命名章节')} · ${rows.length} 个地点</p>
      ${rows.map(({place,items})=>`<article class="context-card"><strong>${esc(place.name)}</strong>
      <small>${esc(find(maps(),place.mapId)?.title || '地图未定')} · ${items.length?`已关联 ${items.length} 条本章事件`:'正文提及 · 待核对'}${place.position?'':' · 待定位'}</small>
      ${items.length?`<ul>${items.map(event=>`<li>${esc(event.storyDate || '日期未定')} · ${esc(event.title)}</li>`).join('')}</ul>`:''}
      <button class="button outline" data-atlas-chapter-place="${esc(place.id)}">在地图上查看</button></article>`).join('') || empty('本章还没有匹配的地图地点。')}
      <div class="atlas-actions"><button class="button outline" id="atlasChapterOpenMap">打开世界地图</button>
      ${typeof back==='function'?'<button class="button outline" id="atlasChapterBack">返回本章资料</button>':''}</div>`,root=>{
      root.querySelector('#atlasChapterOpenMap').onclick = () => openAtlas();
      const returnButton = root.querySelector('#atlasChapterBack');
      if(returnButton)returnButton.onclick = back;
      for(const button of root.querySelectorAll('[data-atlas-chapter-place]'))button.onclick = () => {
        if(state.selected===work.id)act('v12-place',button.dataset.atlasChapterPlace);
      };
    });
  }

  const previousWrite = writePage;
  writePage = function () {
    const page = previousWrite(), current = chapter();
    if (!current) return page;
    const related = chapterPlaceRows(current);
    return page + `<section class="sw10-chapter"><h3>本章地点</h3><div class="sw10-quick">${related.map(({place}) =>
      `<button data-action="v12-place" data-id="${esc(place.id)}">${esc(place.name)}</button>`).join('') ||
      '<button data-action="v12-atlas">建立地图与地点关联</button>'}</div></section>`;
  };
  const previousAct = act;
  act = function (action, key) {
    if (action === 'v12-atlas') return openAtlas();
    if (action === 'v12-atlas-return') return returnToMap();
    if (action === 'v12-chapter-places') return openChapterPlaces(key);
    if (action === 'v12-place') {
      const place = find(places(), key);
      if (!place) return toast('地点已删除');
      view.cutoff = ''; view.chapterId = ''; view.roleId = '';
      return openAtlas(place.mapId, key);
    }
    return previousAct(action, key);
  };
  const previousNormalize = normalizeBackup;
  normalizeBackup = function (data) {
    for (const key of ['worldMaps', 'worldPlaces']) if (data[key] !== undefined && !Array.isArray(data[key])) throw Error(key + ' 格式无效');
    const cleaned = previousNormalize(data);
    return {...cleaned, ...Core.normalize({...cleaned, worldMaps: data.worldMaps, worldPlaces: data.worldPlaces}), version: 12};
  };
  window.StoryWeaveAtlas = {open: openAtlas, canReturn, attachEventEditor, eventFromForm};
})();
