(() => {
  'use strict';

  let writes = Promise.resolve();

  function enqueue(operation) {
    const pending = writes.then(operation);
    writes = pending.catch(() => {});
    return pending;
  }

  function flush() {
    return enqueue(() => storeAppState(state));
  }

  // Mutations replace affected records. Unchanged manuscripts are shared until commit.
  function transact(change) {
    return enqueue(async () => {
      const next = {
        ...state,
        skills: state.skills.slice(),
        skillPresets: (state.skillPresets || []).slice(),
        distillationJobs: (state.distillationJobs || []).slice()
      };
      change(next);
      await storeAppState(next);
      state = next;
      return next;
    });
  }

  window.StoryWeaveWorkspace = { flush, transact };
})();
