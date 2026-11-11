/* Sync the native Android system-bar palette with the active manuscript theme.
   The native bridge only accepts the two fixed palette names; this JS never
   communicates manuscript content or opens network connections. */
(() => {
  'use strict';
  const body = document.body;
  if (!body || !window.MutationObserver) return;
  let last = '';
  const update = () => {
    const scheme = body.dataset.sw16Paper === 'ink' ? 'ink' : 'paper';
    if (scheme === last) return;
    last = scheme;
    const theme = document.querySelector('meta[name="theme-color"]');
    if (theme) theme.setAttribute('content', scheme === 'ink' ? '#202925' : '#f6f5f0');
    window.StoryBridge?.setSystemBarStyle?.(scheme);
  };
  new MutationObserver(update).observe(body, {
    attributes: true, attributeFilter: ['data-sw16-view', 'data-sw16-paper']
  });
  update();
})();
