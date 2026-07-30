/** 默认支出分类（记一笔页共用） */
const DEFAULT_CATEGORIES = ['餐饮', '交通', '服饰', '人情', '娱乐', '住房', '医疗', '教育', '其他'];

const CATEGORY_COLORS = {
  '餐饮': '#FF6B6B',
  '交通': '#4ECDC4',
  '服饰': '#FF9F43',
  '人情': '#E84393',
  '娱乐': '#A29BFE',
  '住房': '#FDCB6E',
  '医疗': '#E17055',
  '教育': '#74B9FF',
  '其他': '#636E72'
};

function getCategoryColor(category) {
  return CATEGORY_COLORS[category] || '#4CAF50';
}

/**
 * 将本地旧分类迁移为新列表：去掉「购物」，补上「服饰」「人情」
 */
function syncCategories() {
  const stored = wx.getStorageSync('categories');
  let list = Array.isArray(stored) && stored.length ? stored.slice() : DEFAULT_CATEGORIES.slice();

  list = list.filter(c => c !== '购物');
  if (!list.includes('服饰')) {
    const foodIdx = list.indexOf('餐饮');
    const insertAt = foodIdx >= 0 ? foodIdx + 2 : 2; // 尽量放在交通后
    list.splice(Math.min(insertAt, list.length), 0, '服饰');
  }
  if (!list.includes('人情')) {
    const dressIdx = list.indexOf('服饰');
    const insertAt = dressIdx >= 0 ? dressIdx + 1 : list.length;
    list.splice(insertAt, 0, '人情');
  }

  // 按默认顺序整理已知分类，未知分类保留在末尾（「其他」前）
  const known = DEFAULT_CATEGORIES.filter(c => list.includes(c));
  const extras = list.filter(c => !DEFAULT_CATEGORIES.includes(c) && c !== '其他');
  const ordered = [...known.filter(c => c !== '其他'), ...extras];
  if (list.includes('其他') || DEFAULT_CATEGORIES.includes('其他')) {
    ordered.push('其他');
  }

  wx.setStorageSync('categories', ordered);
  return ordered;
}

/**
 * 备注归一化：去首尾空格；空备注归为「未备注」
 */
function normalizeNote(note) {
  const text = (note || '').trim();
  return text || '未备注';
}

/**
 * 按「分类 → 备注」汇总：备注相同合并金额，不同则分开展示
 * @returns {Array<{category, total, count, percent, totalText, notes: Array}>}
 * notes 仅在该分类存在有效备注差异时返回（全是未备注则 notes 为空）
 */
function buildCategoryStatsWithNotes(expenses) {
  const list = expenses || [];
  if (!list.length) return { grandTotal: 0, stats: [] };

  const map = {};
  list.forEach(item => {
    const category = item.category || '其他';
    const noteKey = normalizeNote(item.note);
    const amount = Number(item.amount) || 0;

    if (!map[category]) {
      map[category] = { total: 0, count: 0, notes: {} };
    }
    map[category].total += amount;
    map[category].count += 1;

    if (!map[category].notes[noteKey]) {
      map[category].notes[noteKey] = { total: 0, count: 0 };
    }
    map[category].notes[noteKey].total += amount;
    map[category].notes[noteKey].count += 1;
  });

  const grandTotal = Object.keys(map).reduce((s, k) => s + map[k].total, 0);

  const stats = Object.keys(map)
    .map(category => {
      const entry = map[category];
      const noteKeys = Object.keys(entry.notes);
      const hasNamedNote = noteKeys.some(k => k !== '未备注');
      // 有真实备注、或存在多种备注分组时，展开备注明细
      const showNotes = hasNamedNote || noteKeys.length > 1;

      const notes = showNotes
        ? noteKeys
            .map(name => ({
              name,
              total: entry.notes[name].total,
              count: entry.notes[name].count,
              totalText: entry.notes[name].total.toFixed(2)
            }))
            .sort((a, b) => b.total - a.total)
        : [];

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
  CATEGORY_COLORS,
  getCategoryColor,
  syncCategories,
  normalizeNote,
  buildCategoryStatsWithNotes
};
