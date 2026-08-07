/** 默认支出分类（记一笔页共用） */
const DEFAULT_CATEGORIES = ['餐饮', '日常用品', '服饰', '娱乐', '交通', '教育', '住房', '医疗', '人情', '其他'];

/**
 * Sub-categories grouped by their 1-level parent.
 * 1-level categories NOT listed here have no sub-categories.
 */
const CATEGORY_SUBCATEGORIES = {
  '餐饮': ['做饭材料', '零食', '聚餐'],
  '服饰': ['衣服', '鞋子', '首饰'],
  '娱乐': ['看电影', '游玩'],
  '交通': ['地铁', '高铁', '油费', '保养', '维修', '过路费', '打车'],
  '教育': ['培训费', '书籍'],
  '住房': ['家具', '物业费'],
  '人情': ['红包', '奖励']
};

const CATEGORY_COLORS = {
  '餐饮': '#FF6B6B',
  '交通': '#4ECDC4',
  '服饰': '#FF9F43',
  '人情': '#E84393',
  '娱乐': '#A29BFE',
  '住房': '#FDCB6E',
  '医疗': '#E17055',
  '教育': '#74B9FF',
  '其他': '#636E72',
  '日常用品': '#26A69A',
  // 2-level defaults fall back to parent's color
  '做饭材料': '#FF8A80',
  '零食': '#FFAB91',
  '聚餐': '#FF6B6B'
};

const DEFAULT_CATEGORY_BUDGET = 500;

const CATEGORY_BUDGETS = {
  '餐饮': 800,
  '交通': 1500
};

function getCategoryBudget(category) {
  if (CATEGORY_BUDGETS[category] != null) return CATEGORY_BUDGETS[category];
  return DEFAULT_CATEGORY_BUDGET;
}

function getAllCategoryBudgets(categories) {
  const list = Array.isArray(categories) && categories.length ? extractTopLevelNames(categories) : DEFAULT_CATEGORIES;
  return list.map((name) => ({
    category: name,
    budget: getCategoryBudget(name),
  }));
}

/** True if `name` is a registered 2-level category (has a parent) */
function isSubcategory(name) {
  if (!name) return false;
  for (const k of Object.keys(CATEGORY_SUBCATEGORIES)) {
    if (CATEGORY_SUBCATEGORIES[k].indexOf(name) >= 0) return true;
  }
  return false;
}

/**
 * Build a tree of { name, parent, subcategories[] } from the raw stored
 * categories list. The stored format can be:
 *   - old: ['餐饮', '交通', ...]            (string array)
 *   - new: [{name, parent?}, ...]            (object array)
 * The returned tree is always in the new format.
 */
function buildCategoryTree(rawCategories) {
  // 1) normalize to [{name, parent}] records
  const records = [];
  const seen = new Set();
  function pushRecord(name, parent) {
    if (!name || seen.has(name)) return;
    seen.add(name);
    records.push(parent ? { name, parent } : { name });
  }
  if (Array.isArray(rawCategories)) {
    rawCategories.forEach(item => {
      if (typeof item === 'string') {
        pushRecord(item);
      } else if (item && typeof item === 'object' && item.name) {
        pushRecord(item.name, item.parent);
      }
    });
  }
  // 2) ensure default 1-level categories are present
  DEFAULT_CATEGORIES.forEach((name) => pushRecord(name));
  // 3) ensure default sub-categories are present (under their parent)
  Object.keys(CATEGORY_SUBCATEGORIES).forEach(parent => {
    CATEGORY_SUBCATEGORIES[parent].forEach(sub => pushRecord(sub, parent));
  });
  // 4) build the tree: top-level first, then sub
  // Sort top-level by DEFAULT_CATEGORIES order so renames / order changes
  // take effect for both new and existing users.
  const topLevel = records.filter(r => !r.parent);
  const orderIndex = (name) => {
    const i = DEFAULT_CATEGORIES.indexOf(name);
    return i < 0 ? DEFAULT_CATEGORIES.length : i;
  };
  topLevel.sort((a, b) => orderIndex(a.name) - orderIndex(b.name));
  return topLevel.map(parent => ({
    name: parent.name,
    subcategories: records
      .filter(r => r.parent === parent.name)
      .map(r => r.name),
  }));
}

/** Helper: extract just the 1-level names from a normalized or raw list */
function extractTopLevelNames(rawCategories) {
  const out = [];
  if (Array.isArray(rawCategories)) {
    rawCategories.forEach(item => {
      if (typeof item === 'string') out.push(item);
      else if (item && typeof item === 'object' && item.name && !item.parent) out.push(item.name);
    });
  }
  if (!out.length) return DEFAULT_CATEGORIES;
  // ensure defaults
  DEFAULT_CATEGORIES.forEach(n => { if (out.indexOf(n) < 0) out.push(n); });
  return out;
}

function getCategoryColor(category) {
  if (!category) return '#4CAF50';
  if (CATEGORY_COLORS[category]) return CATEGORY_COLORS[category];
  // 2-level sub-category without its own color → fall back to its parent's
  // color so the whole family shares one visual.
  const parents = Object.keys(CATEGORY_SUBCATEGORIES);
  for (let i = 0; i < parents.length; i++) {
    const p = parents[i];
    if (CATEGORY_SUBCATEGORIES[p].indexOf(category) >= 0) {
      return CATEGORY_COLORS[p] || '#4CAF50';
    }
  }
  return '#4CAF50';
}

/**
 * Sync the on-device `categories` list with the latest defaults.
 * Reads from `life_ben_v1.categories` (via repo). If the repo returns empty,
 * also checks the legacy standalone `categories` key for back-compat and
 * folds the result in. Always normalizes to the new object-array format
 * (`{name, parent?}`) and writes it back via repo.
 *
 * @returns {Array<{name, parent?}>} the synced (flat) list of category records
 */
function syncCategories() {
  let stored = [];
  try {
    if (typeof require === 'function' && require.cache) {
      // Lazy require so the util stays independent of repo's load timing.
      const repo = require('../services/repository');
      stored = repo.getCategories();
    }
  } catch (e) {
    stored = [];
  }
  // Back-compat: if the repo doesn't have categories yet, fall back to the
  // legacy standalone 'categories' key and migrate.
  if (!stored.length) {
    try {
      const legacy = wx.getStorageSync('categories');
      if (Array.isArray(legacy) && legacy.length) stored = legacy;
    } catch (e) {
      // ignore
    }
  }

  const tree = buildCategoryTree(stored);
  const flat = [];
  tree.forEach(node => {
    flat.push({ name: node.name });
    node.subcategories.forEach(sub => flat.push({ name: sub, parent: node.name }));
  });

  try {
    if (typeof require === 'function' && require.cache) {
      const repo = require('../services/repository');
      repo.setCategories(flat);
    }
  } catch (e) {
    // ignore
  }
  return flat;
}

/**
 * 备注归一化：去首尾空格；空备注归为「未备注」
 */
function normalizeNote(note) {
  const text = (note || '').trim();
  return text || '未备注';
}

/**
 * 按「分类 → (子分类?) → 备注」汇总：备注相同合并金额，不同则分开展示
 * 子分类（subcategory）独立展示在该 1 级分类下
 * @returns {Array<{category, total, count, percent, totalText, notes: Array}>}
 * notes 在该分类有多个子分类 或 有备注差异时展开
 */
function buildCategoryStatsWithNotes(expenses) {
  const list = expenses || [];
  if (!list.length) return { grandTotal: 0, stats: [] };

  const map = {};
  list.forEach(item => {
    const category = item.category || '其他';
    const sub = item.subcategory || '';
    // key: category|sub
    const key = sub ? category + '|' + sub : category;
    const noteKey = normalizeNote(item.note);
    const amount = Number(item.amount) || 0;

    if (!map[category]) {
      map[category] = {
        total: 0,
        count: 0,
        subs: {}, // sub-name -> { total, count, notes: {} }
        ungroupedNotes: null // notes when no sub
      };
    }
    map[category].total += amount;
    map[category].count += 1;

    if (sub) {
      if (!map[category].subs[sub]) {
        map[category].subs[sub] = { total: 0, count: 0, notes: {} };
      }
      const sEntry = map[category].subs[sub];
      sEntry.total += amount;
      sEntry.count += 1;
      if (!sEntry.notes[noteKey]) sEntry.notes[noteKey] = { total: 0, count: 0 };
      sEntry.notes[noteKey].total += amount;
      sEntry.notes[noteKey].count += 1;
    } else {
      if (!map[category].ungroupedNotes) {
        map[category].ungroupedNotes = {};
      }
      const notes = map[category].ungroupedNotes;
      if (!notes[noteKey]) notes[noteKey] = { total: 0, count: 0 };
      notes[noteKey].total += amount;
      notes[noteKey].count += 1;
    }
  });

  const grandTotal = Object.keys(map).reduce((s, k) => s + map[k].total, 0);

  const stats = Object.keys(map)
    .map(category => {
      const entry = map[category];
      const subNames = Object.keys(entry.subs);
      const ungrouped = entry.ungroupedNotes || {};
      const ungroupedKeys = Object.keys(ungrouped);

      // Decide if we need to show detail rows:
      // - any sub-categories exist
      // - OR any sub-category has note variance
      // - OR ungrouped (no-sub) items have note variance
      const subHasNotes = subNames.some(s => {
        const nk = Object.keys(entry.subs[s].notes);
        return nk.some(k => k !== '未备注') || nk.length > 1;
      });
      const ungroupedHasNotes = ungroupedKeys.some(k => k !== '未备注') || ungroupedKeys.length > 1;
      const showDetail = subNames.length > 0 || subHasNotes || ungroupedHasNotes;

      const notes = [];
      if (showDetail) {
        // Sub-category rows first
        subNames.forEach(sub => {
          const subEntry = entry.subs[sub];
          notes.push({
            name: sub,
            isSubcategory: true,
            total: subEntry.total,
            totalText: subEntry.total.toFixed(2),
            count: subEntry.count
          });
        });
        // Then ungrouped (no sub) notes by note
        if (ungroupedKeys.length) {
          ungroupedKeys
            .map(name => ({
              name: name === '未备注' ? '（未细分 / 未备注）' : name,
              isSubcategory: false,
              total: ungrouped[name].total,
              totalText: ungrouped[name].total.toFixed(2),
              count: ungrouped[name].count,
            }))
            .sort((a, b) => b.total - a.total)
            .forEach(n => notes.push(n));
        }
      }

      return {
        category,
        total: entry.total,
        totalText: entry.total.toFixed(2),
        count: entry.count,
        percent: grandTotal > 0 ? ((entry.total / grandTotal) * 100).toFixed(1) : '0.0',
        notes
      };
    })
    .sort((a, b) => b.total - a.total);

  return { grandTotal, stats };
}

module.exports = {
  DEFAULT_CATEGORIES,
  CATEGORY_SUBCATEGORIES,
  CATEGORY_COLORS,
  CATEGORY_BUDGETS,
  DEFAULT_CATEGORY_BUDGET,
  getCategoryColor,
  getCategoryBudget,
  getAllCategoryBudgets,
  isSubcategory,
  buildCategoryTree,
  extractTopLevelNames,
  syncCategories,
  normalizeNote,
  buildCategoryStatsWithNotes
};
