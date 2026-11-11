const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const src = fs.readFileSync(__dirname+'/web/app.js','utf8');
const line = src.split('\n').find(x=>x.startsWith('function openRelationEdit('));
assert(line,'Relation history renderer exists');
const attack = '<img src=x onerror="window.__storyweave_xss=1">';
let html = '';
const context = {
  relations:()=>[{id:'r1',a:'a',b:'b',type:'熟人',detail:'安全',history:[{at:'2026-01-01',type:attack,detail:attack}]}],
  characters:()=>[{id:'a',name:'甲'},{id:'b',name:'乙'}],
  modal:(_title, markup)=>{html=markup},
  esc:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  dated:x=>x
};
vm.runInNewContext(line+';openRelationEdit("r1")',context);
assert(html.includes('&lt;img src=x onerror='),'History is escaped before HTML');
assert(!html.includes(attack),'History HTML must not contain active image tag');
assert(fs.readFileSync(__dirname+'/web/app.js').equals(fs.readFileSync(__dirname+'/android/app/src/main/assets/app.js')));
console.log('PASS malicious relationship history escaped and Web/Android assets synchronized');
