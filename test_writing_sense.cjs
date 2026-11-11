const assert = require('node:assert/strict');
const {createSession, visibleLength, difference} = require('./web/writing-sense-core');

assert.equal(visibleLength('中 文 A😀\n'),4);
assert.deepEqual(difference('中断', '中间断'), {added:'间',removed:''});

const t = createSession('开头',0);
t.setFocused(true,0);
assert.equal(t.apply('开头你好',{kind:'type',now:500}).typed,2);
assert.equal(t.apply('开头你好。',{kind:'type',now:1000}).typed,1);
assert.equal(t.metrics(2000).charsPerSecond,0.6);
assert.equal(t.metrics(2000).charsPerMinute,120);
assert.equal(t.metrics(7000).status,'thinking');
assert.equal(t.metrics(9000).currentThought,3000);
assert(t.metrics(9000).total.thinking >= 1900);
assert.equal(t.metrics(9200).charsPerSecond,0);
const beforePaste = t.metrics(9300).charsPerSecond;
assert.equal(t.apply('开头你好。以下是长篇粘贴',{kind:'paste',now:9300}).typed,0);
assert.equal(t.metrics(9350).charsPerSecond,beforePaste);
assert.equal(t.apply('开头你好。以下是长篇',{kind:'edit',now:9500}).typed,0);
assert.equal(t.apply('开头你好。以下是长篇! ',{kind:'program',now:10000}).typed,0);

t.startComposition();
assert.equal(t.apply('开头你好。以下是长篇! 汉',{kind:'type',now:11000}).typed,0);
assert.equal(t.apply('开头你好。以下是长篇! 汉字',{kind:'type',now:11100}).typed,0);
assert.equal(t.endComposition('开头你好。以下是长篇! 汉字',11200).typed,2);
assert.equal(t.apply('开头你好。以下是长篇! 汉字',{kind:'type',now:11250}).typed,0);
assert(t.metrics(11300).graph.some(value=>value>0));

t.setFocused(false,11400);
const oldTotal=t.metrics(11400).total.thinking;
assert.equal(t.metrics(50000,false).total.thinking,oldTotal);
t.setFocused(true,50000);
assert.equal(t.metrics(51000).status,'idle');
assert.equal(t.metrics(80000).status,'idle');

const giant = createSession('x'.repeat(100000),0);
giant.setFocused(true,0);
assert.equal(giant.apply('x'.repeat(100000)+'世界',{kind:'type',now:1000}).typed,2);
assert.equal(giant.apply('替换整个章节', {kind:'program',now:1200}).typed,0);
console.log('PASS writing sense: typing windows, Unicode, paste, edits, synthetic changes, IME, focus, timeout, large chapter');
