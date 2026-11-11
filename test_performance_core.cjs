const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/web/app.js','utf8');
const snippet=source.slice(source.indexOf('const count='),source.indexOf('const sessionGet='));
const funcs=vm.runInNewContext(snippet+';({count,chapterWordCount})');
const oldCount=s=>[...String(s||'').replace(/\s/g,'')].length;
const chars=['他','我','a','B','0','。','\n','\t',' ','🌿','🚄','\u00A0','\u2003','𠀋','́',''];
for (let i=0;i<3000;i++) {
 const original=Array.from({length:Math.floor(Math.random()*60)},()=>chars[Math.floor(Math.random()*chars.length)]).join('');
 const unitPositions = [...Array(original.length+1).keys()];
 const start=unitPositions[Math.floor(Math.random()*unitPositions.length)];
 const stop=start+Math.floor(Math.random()*(original.length-start+1));
 const inserted=Array.from({length:Math.floor(Math.random()*10)},()=>chars[Math.floor(Math.random()*chars.length)]).join('');
 const next=original.slice(0,start)+inserted+original.slice(stop);
 assert.equal(funcs.count(next),oldCount(next));
}
const chapter={text:'你好🌿\n'};
assert.equal(funcs.chapterWordCount(chapter),3);
chapter.text='你好🌿你好';
assert.equal(funcs.chapterWordCount(chapter),5);
const long='长篇文字，含有空格 🌿\n'.repeat(45000);
const bench=(fn)=>{const a=performance.now();let value;for(let i=0;i<8;i++)value=fn(long);return {ms:Math.round(performance.now()-a),value}};
const slow=bench(oldCount),fast=bench(funcs.count);
assert.equal(slow.value,fast.value);
console.log('PASS incremental Unicode counts, 3000 random edits; long text',JSON.stringify({slow,fast}));
