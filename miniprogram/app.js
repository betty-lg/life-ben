const repo = require('./services/repository');
const { syncCategories } = require('./utils/jizhang-categories');

App({
  onLaunch() {
    try {
      repo.migrateLegacyStorage();
    } catch (e) {
      console.warn('migrate failed', e);
    }
    try {
      repo.seedIfEmpty();
    } catch (e) {
      console.warn('seed failed', e);
    }
    try {
      syncCategories();
    } catch (e) {
      console.warn('sync categories failed', e);
    }
  },
});
