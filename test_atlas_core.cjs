const assert = require('node:assert/strict');
const A = require('./web/atlas-core');
const Archive = require('./web/archive-core');
const map = A.validMap({id:'m',mode:'fiction',title:'大陆',width:1000,height:700},'p');
const earth = A.validMap({id:'earth',mode:'earth',title:'地球',width:1000,height:500},'p');
const place = A.validPlace({id:'city',mapId:'m',name:'白石城',aliases:['白城'],position:{x:0,y:700}},map,'p');
assert.deepEqual(place.position,{x:0,y:700});
assert.throws(()=>A.validPlace({...place,position:{x:1001,y:0}},map,'p'));
assert.throws(()=>A.validPlace({...place,position:{x:'',y:0}},map,'p'));
assert.throws(()=>A.validPlace(place,map,'other'));
assert.throws(()=>A.validPlace({...place,mapId:'earth',position:{x:181,y:0}},earth,'p'));
assert.equal(A.matchPlace([place],'白城').id,'city');
assert.equal(A.matchPlace([place,{...place,id:'duplicate'}],'白城'),null);
assert.equal(A.matchPlace([place],'白石'),null);
assert.equal(A.dateEnd('203'),2031231);
assert.equal(A.dateEnd('203-02'),2030228);
assert.equal(A.dateEnd('200-02-29'),null);
assert.equal(A.dateEnd('400-02-29'),4000229);
const events = [
 {id:'early',projectId:'p',locationId:'city',location:'白石城',storyDate:'203-03-05',chapterId:'c1',participants:['hero']},
 {id:'late',projectId:'p',locationId:'city',storyDate:'203-03-10',chapterId:'c2',participants:['hero']},
 {id:'year',projectId:'p',locationId:'city',storyDate:'203'},
 {id:'undated',projectId:'p',locationId:'city',storyDate:''},
];
assert.deepEqual(A.visibleEvents(events,{cutoff:'203-03-05'}).map(e=>e.id),['early']);
assert.deepEqual(A.visibleEvents(events,{cutoff:'203-03-05',includeUndated:true}).map(e=>e.id),['early','undated']);
assert.deepEqual(A.visibleEvents(events,{roleId:'hero',chapterId:'c2'}).map(e=>e.id),['late']);
const port={...place,id:'port',position:{x:100,y:120}};
const tower={...place,id:'tower',position:{x:200,y:250}};
const elsewhere={...place,id:'overseas',mapId:'earth'};
const noPosition={...place,id:'unknown',position:null};
const travelPlaces=[place,port,tower,elsewhere,noPosition];
const arrival={...events[1],locationId:port.id};
const departure={...events[0]};
const later={...arrival,id:'return',storyDate:'203-04-10',locationId:tower.id};
const trail = (list,filter={})=>A.roleTrail(list,travelPlaces,'m',{roleId:'hero',...filter});
const ordered=trail([later,arrival,departure]);
assert.deepEqual(ordered.stops.map(row=>row.event.id),['early','late','return']);
assert.deepEqual(ordered.segments.map(row=>[row.from.id,row.to.id]),[['city','port'],['port','tower']]);
assert.equal(trail([later,arrival,departure],{cutoff:'203-03-05'}).segments.length,0);
assert.equal(trail([departure,{...arrival,storyDate:'203-03'},later]).segments.length,0);
assert.equal(trail([departure,{...arrival,storyDate:departure.storyDate},later]).segments.length,0);
for(const locationId of ['missing','unknown','overseas']){
  assert.equal(trail([departure,{...arrival,locationId},later]).segments.length,0);
}
assert.equal(trail([departure,{...arrival,chapterId:'other'},{...later,chapterId:'c1'}],{chapterId:'c1'}).segments.length,0);
assert.equal(trail([{...departure,storyDate:''},arrival]).segments.length,0);
const state={projects:[{id:'p'}],worldMaps:[map,earth],worldPlaces:[place],timelineEvents:events};
const backup=A.normalize(JSON.parse(JSON.stringify(state)));
assert.deepEqual(backup.worldMaps,[map,earth]);
assert.equal(backup.timelineEvents[0].locationId,'city');
assert.equal(A.normalize({...state,worldMaps:[]}).timelineEvents[0].locationId,'');
const removed=A.removePlace(state,'p','city');
assert.equal(removed.worldPlaces.length,0);
assert.equal(removed.timelineEvents[0].location,'白石城');
assert.equal(removed.timelineEvents[0].locationId,'');
assert.equal(events[0].locationId,'city');
assert.throws(()=>A.bindEvent(state,'other','early','city'));
const reviewCity={...place,aliases:['白城','同名城','ALPHA','白城']};
const reviewPort={...place,id:'port-review',name:'东港',aliases:['同名城'],mapId:'earth',position:null};
const pending=(id,location,projectId='p')=>({id,projectId,location,locationId:'',title:id});
const reviewState={...state,worldPlaces:[reviewCity,reviewPort,{...reviewCity,id:'elsewhere',projectId:'other'}],
  timelineEvents:[events[0],pending('unique',' ＡＬＰＨＡ '),pending('ambiguous','同名城'),pending('missing','未知港'),pending('private','白城','other')]};
const review=A.reviewBindings(reviewState,'p');
assert.deepEqual(review.map(row=>[row.event.id,row.candidates.map(place=>place.id)]),
  [['unique',['city']],['ambiguous',['city','port-review']],['missing',[]]]);
const choices=review.slice(0,2).map((row,index)=>({eventId:row.event.id,reviewKey:row.reviewKey,placeId:row.candidates[index].id}));
assert.deepEqual(A.bindReviewedEvents(reviewState,'p',choices).map(event=>event.locationId),['city','city','port-review','','']);
assert.equal(reviewState.timelineEvents[1].locationId,'');
assert.throws(()=>A.bindReviewedEvents({...reviewState,worldPlaces:[...reviewState.worldPlaces,{...reviewCity,id:'new-match'}]},'p',choices),/已变化/);
assert.throws(()=>A.bindReviewedEvents({...reviewState,timelineEvents:reviewState.timelineEvents.map(event=>
  event.id==='unique'?{...event,locationId:'city'}:event)},'p',choices),/已变化/);
assert.throws(()=>A.bindReviewedEvents(reviewState,'p',[choices[0],{...choices[1],placeId:'elsewhere'}]),/已变化/);
const body='203-03-08，林澈抵达了白石城，在城门口发现了来信。';
const batch={start:0,payload:{text:body,cast:[{id:'hero'}],relations:[]}};
const item={kind:'event',title:'城门来信',detail:'林澈在城门发现来信',quote:body,participants:['hero'],location:'白石城',storyDate:'203-03-08'};
assert.equal(Archive.parseArchive(JSON.stringify({items:[item]}),batch)[0].location,'白石城');
const forged=Archive.parseArchive(JSON.stringify({items:[{...item,location:'皇城',storyDate:'999-01-01'}]}),batch)[0];
assert.equal(forged.location,'');
assert.equal(forged.storyDate,'');
assert.throws(()=>A.validMap({...map,image:'data:image/svg+xml;base64,PHN2Zz4='},'p'));
console.log('PASS Atlas: coordinates, date precision, filters, matching, backup isolation, deletion, grounded AI location');
