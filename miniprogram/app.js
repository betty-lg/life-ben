const repo = require('./services/repository');

App({
  onLaunch() {
    try {
      repo.seedIfEmpty();
    } catch (e) {
      console.warn('seed failed', e);
    }
  },
});
