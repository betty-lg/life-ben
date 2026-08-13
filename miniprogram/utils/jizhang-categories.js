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
 * 按「分类 → 子分类 → 备注」三层汇总：
 *   - 每个 1 级分类下：列出所有 2 级子分类（按金额降序），每项有自己的金额汇总 + 占比
 *   - 每个 2 级子分类下：列出该 2 级下每条备注的金额汇总
 *   - 1 级下没填 2 级的，归到「未细分」虚拟子分类下，同样列出备注
 *
 * @returns {{
 *   grandTotal: number,
 *   stats: Array<{
 *     category: string,
 *     total: number, totalText: string, count: number, percent: string,
 *     subcategories: Array<{
 *       name: string, isSubcategory: boolean,
 *       total: number, totalText: string, count: number, percent: string,
 *       notes: Array<{ name, total, totalText, count, isUnclassified }>
 *     }>
 *   }>
 * }}
 */
function buildCategoryStatsWithNotes(expenses) {
  const list = expenses || [];
  if (!list.length) return { grandTotal: 0, stats: [] };

  // 三层聚合: map[category].subMap[sub].noteMap[noteKey] = { total, count }
  // 1 级下未填 2 级的 -> map[category].ungroupedNotes[noteKey] = { total, count }
  const map = {};
  list.forEach(item => {
    const category = item.category || '其他';
    const sub = (item.subcategory || '').trim();
    const noteKey = normalizeNote(item.note);
    const amount = Number(item.amount) || 0;

    if (!map[category]) {
      map[category] = { total: 0, count: 0, subMap: {}, ungroupedNotes: null };
    }
    map[category].total += amount;
    map[category].count += 1;

    if (sub) {
      if (!map[category].subMap[sub]) {
        map[category].subMap[sub] = { total: 0, count: 0, noteMap: {} };
      }
      const s = map[category].subMap[sub];
      s.total += amount;
      s.count += 1;
      if (!s.noteMap[noteKey]) s.noteMap[noteKey] = { total: 0, count: 0 };
      s.noteMap[noteKey].total += amount;
      s.noteMap[noteKey].count += 1;
    } else {
      if (!map[category].ungroupedNotes) map[category].ungroupedNotes = {};
      const u = map[category].ungroupedNotes;
      if (!u[noteKey]) u[noteKey] = { total: 0, count: 0 };
      u[noteKey].total += amount;
      u[noteKey].count += 1;
    }
  });

  const grandTotal = Object.keys(map).reduce((s, k) => s + map[k].total, 0);

  const stats = Object.keys(map)
    .map((category) => {
      const entry = map[category];
      const subList = [];

      // 2 级子分类
      Object.keys(entry.subMap).forEach((subName) => {
        const subEntry = entry.subMap[subName];
        const noteKeys = Object.keys(subEntry.noteMap);
        const notes = noteKeys
          .map((name) => ({
            name: name === '未备注' ? '（未备注）' : name,
            total: subEntry.noteMap[name].total,
            totalText: subEntry.noteMap[name].total.toFixed(2),
            count: subEntry.noteMap[name].count,
            isUnclassified: name === '未备注',
          }))
          .sort((a, b) => b.total - a.total);
        subList.push({
          name: subName,
          isSubcategory: true,
          total: subEntry.total,
          totalText: subEntry.total.toFixed(2),
          count: subEntry.count,
          percent: entry.total > 0 ? ((subEntry.total / entry.total) * 100).toFixed(1) : '0.0',
          notes,
        });
      });

      // 1 级下未填 2 级的 → 「未细分」
      if (entry.ungroupedNotes) {
        const u = entry.ungroupedNotes;
        const uKeys = Object.keys(u);
        const uTotal = uKeys.reduce((s, k) => s + u[k].total, 0);
        const uCount = uKeys.reduce((s, k) => s + u[k].count, 0);
        const notes = uKeys
          .map((name) => ({
            name: name === '未备注' ? '（未备注）' : name,
            total: u[name].total,
            totalText: u[name].total.toFixed(2),
            count: u[name].count,
            isUnclassified: name === '未备注',
          }))
          .sort((a, b) => b.total - a.total);
        subList.push({
          name: '未细分',
          isSubcategory: false,
          total: uTotal,
          totalText: uTotal.toFixed(2),
          count: uCount,
          percent: entry.total > 0 ? ((uTotal / entry.total) * 100).toFixed(1) : '0.0',
          notes,
        });
      }

      // 统一按金额降序（包括「未细分」）
      subList.sort((a, b) => b.total - a.total);

      return {
        category,
        total: entry.total,
        totalText: entry.total.toFixed(2),
        count: entry.count,
        percent: grandTotal > 0 ? ((entry.total / grandTotal) * 100).toFixed(1) : '0.0',
        subcategories: subList,
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
