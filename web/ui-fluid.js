/* StoryWeave v1.9.11 · page transitions only when the actual app view changes.
 * No MutationObserver, scroll listener, animation frame loop or persisted state.
 */
(function () {
  'use strict';
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let cleanUp = null;
  function afterRender(previous, next, screen) {
    if (!screen) return;
    if (cleanUp) { cleanUp(); cleanUp = null; }
    screen.classList.remove('swm-view-enter');
    // Re-rendering the same editor/view must never restart an entrance animation.
    if (!previous || previous === next || reducedMotion?.matches || document.body.classList.contains('focus-mode')) return;
    screen.classList.add('swm-view-enter');
    const onEnd = event => {
      if (event.target === screen) finish();
    };
    function finish() {
      screen.removeEventListener('animationend', onEnd);
      screen.classList.remove('swm-view-enter');
      if (cleanUp === finish) cleanUp = null;
    }
    cleanUp = finish;
    screen.addEventListener('animationend', onEnd);
  }
  window.StoryWeaveFluidUI = Object.freeze({ afterRender });
})();
