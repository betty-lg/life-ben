const repo = require('./services/repository');
const { syncCategories, getAllCategoryBudgets } = require('./utils/jizhang-categories');

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
    let categories = [];
    try {
      categories = syncCategories();
    } catch (e) {
      console.warn('sync categories failed', e);
    }
    // Initialize default budgets per category if not yet set
    try {
      if (!repo.getBudgets().length) {
        const defaults = getAllCategoryBudgets(categories);
        if (defaults.length) repo.setBudgets(defaults);
      }
    } catch (e) {
      console.warn('init budgets failed', e);
    }
  },
});
