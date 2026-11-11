/* StoryWeave Writing Sense v1: ephemeral, text-free typing telemetry. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StoryWeaveWritingSenseCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const THINK_AFTER = 5000;
  const THINK_LIMIT = 120000;
  const FLOW_AFTER = 1500;
  const WINDOW = 60000;
  const GRAPH_BUCKET = 30000;
  const GRAPH_BUCKETS = 12;
  const visibleLength = value => Array.from(String(value || '').replace(/\s/gu, '')).length;

  function difference(previous, next) {
    if (previous === next) return {added: '', removed: ''};
    let start = 0;
    while (start < previous.length && start < next.length && previous[start] === next[start]) start++;
    let oldEnd = previous.length, newEnd = next.length;
    while (oldEnd > start && newEnd > start && previous[oldEnd - 1] === next[newEnd - 1]) {
      oldEnd--; newEnd--;
    }
    return {added: next.slice(start, newEnd), removed: previous.slice(start, oldEnd)};
  }

  function createSession(original = '', start = 0) {
    let value = String(original);
    let composing = false;
    let lastAction = null;
    let lastKind = null;
    let lastTick = start;
    let focused = false;
    let firstTyped = null;
    const events = [];
    const total = {typing: 0, thinking: 0, editing: 0};

    const prune = now => {
      while (events.length && events[0].time < now - GRAPH_BUCKET * GRAPH_BUCKETS - 1000) events.shift();
    };
    const stateAt = (at, enabled) => {
      if (!enabled || lastAction === null) return 'idle';
      const since = at - lastAction;
      if (since < 0) return 'idle';
      if (since < FLOW_AFTER) return lastKind === 'typing' ? 'typing' : 'editing';
      if (since >= THINK_AFTER && since < THINK_LIMIT) return 'thinking';
      return 'idle';
    };
    const step = (now, enabled = focused) => {
      now = Number(now);
      if (!Number.isFinite(now)) return;
      if (now <= lastTick) { lastTick = now; return; }
      // A suspended browser timer must not count background time as thinking.
      if (now - lastTick > THINK_LIMIT) { lastTick = now; return; }
      for (let from = lastTick; from < now;) {
        const end = Math.min(now, from + 500);
        const status = stateAt((from + end) / 2, enabled);
        if (status !== 'idle') total[status] += end - from;
        from = end;
      }
      lastTick = now;
      prune(now);
    };
    const setFocused = (enabled, now) => {
      step(now, focused);
      if (enabled && !focused) lastAction = null; // No thinking time survives a focus break.
      focused = !!enabled;
      lastTick = now;
    };
    const apply = (nextText, opts = {}) => {
      const now = Number.isFinite(opts.now) ? opts.now : 0;
      if (composing && !opts.commit) return {typed: 0, changed: value !== String(nextText)};
      step(now);
      const next = String(nextText);
      const change = difference(value, next);
      value = next;
      const changed = !!change.added || !!change.removed;
      if (!changed) return {typed: 0, changed: false};
      const typed = opts.kind === 'type' ? visibleLength(change.added) : 0;
      if (typed) {
        events.push({time: now, count: typed});
        if (firstTyped === null) firstTyped = now;
        lastKind = 'typing';
      } else if (opts.kind !== 'program') {
        lastKind = 'editing';
      }
      if (opts.kind !== 'program') lastAction = now;
      prune(now);
      return {typed, changed: true};
    };
    const startComposition = () => { composing = true; };
    const endComposition = (nextText, now) => {
      composing = false;
      return apply(nextText, {kind: 'type', now, commit: true});
    };
    const metrics = (now, enabled = focused) => {
      step(now, enabled);
      const pastFive = events.reduce((sum, event) => sum + (event.time > now - 5000 ? event.count : 0), 0);
      const pastMinute = events.reduce((sum, event) => sum + (event.time > now - WINDOW ? event.count : 0), 0);
      const observed = firstTyped === null ? WINDOW : Math.min(WINDOW, Math.max(1000, now - firstTyped));
      const status = stateAt(now, enabled);
      const currentThought = status === 'thinking' ? Math.min(THINK_LIMIT - THINK_AFTER, Math.max(0, now - lastAction - THINK_AFTER)) : 0;
      const anchor = Math.floor(now / GRAPH_BUCKET) * GRAPH_BUCKET;
      const graph = Array.from({length: GRAPH_BUCKETS}, (_, index) => {
        const beginning = anchor - GRAPH_BUCKET * (GRAPH_BUCKETS - 1 - index);
        return events.reduce((sum, event) => sum + (event.time >= beginning && event.time < beginning + GRAPH_BUCKET ? event.count : 0), 0) * 2;
      });
      return {
        charsPerSecond: Math.round(pastFive / 5 * 10) / 10,
        charsPerMinute: Math.round(pastMinute / (observed / WINDOW)),
        status,
        currentThought,
        total: {...total},
        graph
      };
    };
    return {apply, metrics, startComposition, endComposition, setFocused, step};
  }
  return {createSession, visibleLength, difference};
});
