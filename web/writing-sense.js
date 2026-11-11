/* Writing Sense: accessible, low-distraction editor UI. Session-only metrics; no AI. */
(() => {
  'use strict';
  const Core = window.StoryWeaveWritingSenseCore;
  if (!Core) return;
  const CLOCK_INTERVAL = 500;
  let active = null;
  let preserved = null;
  let preservedOpen = false;
  let timer = null;
  const clock = () => performance.now();
  const format = ms => {
    const seconds = Math.floor(Math.max(0, ms) / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  };
  const markup = () => `<details class="sw-sense" id="sw-sense" data-state="idle" data-empty="true" aria-label="写作感知">
    <summary class="sw-sense-line" aria-controls="sw-sense-detail" title="展开或收起写作节奏">
      <span class="sw-sense-pill"><span class="sw-sense-live-dot" aria-hidden="true"></span><span class="sw-sense-label">速度</span><strong class="sw-sense-value" id="sw-sense-speed">0.0</strong><span class="sw-sense-unit">字/秒</span></span>
      <span class="sw-sense-separator" aria-hidden="true"></span>
      <span class="sw-sense-pill"><span class="sw-sense-label">停顿</span><strong class="sw-sense-value" id="sw-sense-thinking">—</strong></span>
      <span class="sw-sense-quiet"><span class="sw-sense-state" id="sw-sense-state">等待输入</span><span class="sw-sense-expand" aria-hidden="true"></span></span>
    </summary>
    <div class="sw-sense-detail" id="sw-sense-detail">
      <div class="sw-sense-section-head"><strong>写作节奏</strong><small>本次章节 · 最近 6 分钟</small></div>
      <div class="sw-sense-summary"><strong id="sw-sense-minute">0<small>字/分</small></strong><span id="sw-sense-peak">最近尚无输入</span></div>
      <div class="sw-sense-chart-frame">
        <svg id="sw-sense-chart" viewBox="0 0 300 88" role="img" aria-label="最近六分钟的输入速度曲线" preserveAspectRatio="none">
          <line class="sw-sense-grid" x1="0" y1="18" x2="300" y2="18"/>
          <line class="sw-sense-grid" x1="0" y1="49" x2="300" y2="49"/>
          <line class="sw-sense-grid" x1="0" y1="80" x2="300" y2="80"/>
          <path id="sw-sense-area" d="M 0 80 L 300 80 Z"/>
          <polyline id="sw-sense-curve" points="0,80 300,80"/>
        </svg>
        <div class="sw-sense-empty">开始输入后显示曲线</div>
        <div class="sw-sense-chart-axis"><span>6 分钟前</span><span>现在</span></div>
      </div>
      <div class="sw-sense-divider"></div>
      <div class="sw-sense-totals-title">本次写作状态</div>
      <div class="sw-sense-stack" aria-label="输入、停顿与修改的时间占比"><span id="sw-sense-stack-typing"></span><span id="sw-sense-stack-thinking"></span><span id="sw-sense-stack-editing"></span></div>
      <div class="sw-sense-totals">
        <div class="sw-sense-total"><span class="sw-sense-total-label">持续输入</span><b id="sw-sense-typing">00:00</b></div>
        <div class="sw-sense-total"><span class="sw-sense-total-label">构思停顿</span><b id="sw-sense-thought-total">00:00</b></div>
        <div class="sw-sense-total"><span class="sw-sense-total-label">修改</span><b id="sw-sense-editing">00:00</b></div>
      </div>
      <p class="sw-sense-note">仅在当前章节编辑期间统计，不记录正文。停顿计时是写作节奏参考，并不代表实际思考时长。</p>
    </div>
  </details>`;
  const beforeWrite = writePage;
  writePage = function () {
    const page = beforeWrite();
    if (!chapter() || !page.includes('<div class="editor-footer">')) return page;
    return page.replace('<div class="editor-footer">', markup() + '<div class="editor-footer">');
  };
  function stop() {
    if (timer !== null) { clearInterval(timer); timer = null; }
    if (active) {
      active.session.setFocused(false, clock());
      if (active.visibilityHandler) document.removeEventListener('visibilitychange', active.visibilityHandler);
    }
    active = null;
  }
  const beforeRender = render;
  render = function () {
    // Keep timing and expanded state during focus-layout switches in the same chapter.
    const sameChapter = active && tab === 'write' && project()?.id === active.work && chapter()?.id === active.chapter;
    preserved = sameChapter ? active.session : null;
    preservedOpen = !!(sameChapter && active.root.open);
    stop();
    return beforeRender();
  };
  function draw(model) {
    if (!active || !active.root.isConnected) return;
    const {root} = active;
    const put = (selector, value) => {
      const element = root.querySelector(selector);
      if (element && element.textContent !== value) element.textContent = value;
    };
    root.dataset.state = model.status;
    put('#sw-sense-speed', model.charsPerSecond.toFixed(1));
    put('#sw-sense-thinking', model.status === 'thinking' ? format(model.currentThought) : '—');
    put('#sw-sense-state', ({typing:'输入中', thinking:'构思停顿', editing:'修改中', idle:'等待输入'})[model.status]);
    if (!root.open) return;
    const minute = root.querySelector('#sw-sense-minute');
    if (minute) {
      const counter = minute.firstChild;
      if (counter && counter.nodeType === 3) counter.nodeValue = String(model.charsPerMinute);
    }
    put('#sw-sense-typing', format(model.total.typing));
    put('#sw-sense-thought-total', format(model.total.thinking));
    put('#sw-sense-editing', format(model.total.editing));
    const series = model.graph;
    const peak = Math.max(...series);
    root.dataset.empty = String(peak === 0);
    put('#sw-sense-peak', peak > 0 ? `峰值 ${peak} 字/分` : '最近尚无输入');
    const maximum = Math.max(30, peak);
    const points = series.map((v, i) => [Math.round(i * 300 / (series.length - 1)), Math.round(80 - (v / maximum) * 68)]);
    const curve = root.querySelector('#sw-sense-curve');
    const area = root.querySelector('#sw-sense-area');
    if (curve) curve.setAttribute('points', points.map(point => point.join(',')).join(' '));
    if (area) area.setAttribute('d', `M ${points.map(point => point.join(' ')).join(' L ')} L 300 80 L 0 80 Z`);
    const chart = root.querySelector('#sw-sense-chart');
    if (chart) chart.setAttribute('aria-label', `最近六分钟每半分钟的输入速度，最高约 ${peak} 字每分钟`);
    const tracked = model.total.typing + model.total.thinking + model.total.editing;
    for (const kind of ['typing','thinking','editing']) {
      const segment = root.querySelector(`#sw-sense-stack-${kind}`);
      if (segment) segment.style.width = `${tracked ? (model.total[kind] / tracked * 100).toFixed(2) : 0}%`;
    }
    const stack = root.querySelector('.sw-sense-stack');
    if (stack) stack.setAttribute('aria-label', `持续输入 ${format(model.total.typing)}，构思停顿 ${format(model.total.thinking)}，修改 ${format(model.total.editing)}`);
  }
  const beforeWire = wireWriter;
  wireWriter = function () {
    beforeWire();
    const editor = document.getElementById('chapterText');
    const root = document.getElementById('sw-sense');
    const work = project(), ch = chapter();
    if (!editor || !root || !work || !ch) return;
    const session = preserved || Core.createSession(editor.value, clock());
    preserved = null;
    if (preservedOpen) root.open = true;
    preservedOpen = false;
    // History restoration or AI adoption may change a manuscript outside typed input.
    session.apply(editor.value, {kind:'program', now:clock()});
    const context = {editor, root, session, work: work.id, chapter: ch.id};
    active = context;
    let beforeType = '';
    let pastePending = false;
    let pastedAt = -Infinity;
    let composing = false;
    const refresh = () => {
      if (active !== context) return;
      draw(session.metrics(clock(), document.activeElement === editor && !document.hidden));
    };
    editor.addEventListener('beforeinput', event => { beforeType = event.inputType || ''; });
    editor.addEventListener('paste', () => { pastePending = true; pastedAt = clock(); });
    editor.addEventListener('compositionstart', () => { composing = true; session.startComposition(); });
    editor.addEventListener('compositionend', () => {
      composing = false;
      session.endComposition(editor.value, clock());
      beforeType = '';
      refresh();
    });
    editor.addEventListener('input', event => {
      const type = event.inputType || beforeType;
      beforeType = '';
      const paste = (pastePending && clock() - pastedAt < 1200) || /^insertFrom(Paste|Drop)/.test(type);
      pastePending = false;
      if (composing || event.isComposing) return;
      const typed = /^(insertText|insertReplacementText|insertFromComposition)$/.test(type) || (!type && event.isTrusted);
      const kind = !event.isTrusted ? 'program' : paste ? 'paste' : typed ? 'type' : 'edit';
      session.apply(editor.value, {kind, now:clock()});
      refresh();
    });
    editor.addEventListener('focus', () => {session.setFocused(true, clock()); refresh();});
    editor.addEventListener('blur', () => {session.setFocused(false, clock()); refresh();});
    context.visibilityHandler = () => {
      if (active !== context) return;
      session.setFocused(!document.hidden && document.activeElement === editor, clock());
      refresh();
    };
    document.addEventListener('visibilitychange', context.visibilityHandler);
    root.addEventListener('toggle', refresh);
    session.setFocused(document.activeElement === editor && !document.hidden, clock());
    timer = setInterval(refresh, CLOCK_INTERVAL);
    refresh();
  };
  window.StoryWeaveWritingSense = {version:'2', stop};
})();
