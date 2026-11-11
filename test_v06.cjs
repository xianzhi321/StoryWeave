'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const root=__dirname;
const ctx={window:{},console,Date,JSON,Math,Intl,URL,AbortController,TextDecoder,Uint8Array,ArrayBuffer,navigator:{},document:{addEventListener(){},getElementById:()=>({addEventListener(){}})},sessionStorage:{getItem:()=>null},clearTimeout:()=>{},setTimeout:()=>0};
vm.createContext(ctx);
for(const fn of ['app.js','v05.js','v06.js']){
 const text=fs.readFileSync(`${root}/web/${fn}`,'utf8');
 vm.runInContext(text,ctx,{filename:fn});
}
const run=x=>vm.runInContext(x,ctx);
const imp=ctx.window.StoryWeaveManuscript;
assert(imp,'Manuscript import is not registered');
let t='前情提要\n这是一段说明。\n\n第一章 初见\n主角说了几句话。\n第二章·迷途\n朋友后来离开了。';
let parts=imp.chapterize(t,'长篇.txt');
assert.equal(parts.length,3);
assert(parts[0].text.includes('前情提要'));
assert.equal(parts[1].title,'第一章 初见');
assert.equal(parts[2].title,'第二章·迷途');
assert.equal(imp.chapterize('第一章里的故事还很长。\n他继续走路。','x').length,1);
assert.equal(imp.chapterize('随机文本没有章节标题。\n下一段仍然是正文。','x').length,1);
const grouped=imp.chapterize('前言\n　　开篇文字。\n第一卷 · 南岸\n第一章 初见\n　　保留段首。\n第二章 空白\n第二卷：北岸\n第三章 返乡\n他回来了。','分卷.txt');
assert.deepEqual(Array.from(grouped,part=>part.volume),[0,1,1,2]);
assert.equal(grouped[1].text,'　　保留段首。');
assert.equal(grouped[2].text,'');
const markdown=imp.chapterize('# 书名\n## 海上列车\n### 第1章 起航\n正文。\n```text\n第2章 示例\n```\n## 未分卷\n### 第3章 后记\n后记正文。','分卷.md');
assert.deepEqual(Array.from(markdown,part=>part.volume),[0,1,null]);
assert(markdown[1].text.includes('第2章 示例'));
assert.equal(imp.chapterize('第一卷里有一封来信。\n接下来是正文。','x').length,1);
assert.equal(imp.decodeManuscript(new TextEncoder().encode('中文写作内容')), '中文写作内容');
assert.equal(imp.decodeManuscript(Uint8Array.from([0xff,0xfe,0x2d,0x4e,0x87,0x65])), '中文');
assert.equal(imp.decodeManuscript(Uint8Array.from([0xd6,0xd0,0xce,0xc4])), '中文');
assert.throws(()=>imp.chapterize('', '空.txt'), /没有文字/);
let binary=new Uint8Array(100);binary[0]=0;binary[1]=1;
assert.throws(()=>imp.decodeManuscript(binary),/二进制/);
const web=fs.readFileSync(`${root}/web/index.html`,'utf8');
const android=fs.readFileSync(`${root}/android/app/src/main/assets/index.html`,'utf8');
assert(web.includes('id="manuscriptImport"')&&web.includes('v06.js'));
assert(android.includes('id="manuscriptImport"')&&android.includes('v06.js'));
for(const fn of ['app.js','v05.js','v06.js','styles.css','sw.js','index.html']){
 assert(fs.readFileSync(`${root}/web/${fn}`).equals(fs.readFileSync(`${root}/android/app/src/main/assets/${fn}`)),`${fn}: web/android assets mismatch`);
}
console.log('PASS v0.6: manuscript segmentation, GB18030/UTF-16/UTF-8 decoding, binary rejection, Android/web asset parity');
