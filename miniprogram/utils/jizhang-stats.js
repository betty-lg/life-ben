/**
 * 支出统计纯函数模块
 * 输入 expenses 数组（字段：amount, category, date, timestamp, ...）
 */

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateKey(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.split('-').map(Number);
  if (parts.length < 3 || parts.some(n => Number.isNaN(n))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function sumAmount(items) {
  if (!items || !items.length) return 0;
  return items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}

/**
 * @param {Array} expenses
 * @param {'day'|'month'|'year'} period
 * @param {Date} [referenceDate]
 */
function filterByPeriod(expenses, period, referenceDate) {
  const ref = referenceDate || new Date();
  const list = expenses || [];

  if (period === 'day') {
    const key = toDateKey(ref);
    return list.filter(item => item.date === key);
  }

  if (period === 'month') {
    const prefix = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`;
    return list.filter(item => item.date && item.date.startsWith(prefix));
  }

  if (period === 'year') {
    const prefix = String(ref.getFullYear());
    return list.filter(item => item.date && item.date.startsWith(prefix));
  }

  return [];
}

function getPeriodTotal(expenses, period, referenceDate) {
  return sumAmount(filterByPeriod(expenses, period, referenceDate));
}

/**
 * 本月 vs 上月对比
 * @returns {{ current, previous, diff, diffPercent, direction, percentText }}
 */
function getMonthComparison(expenses, referenceDate) {
  const ref = referenceDate || new Date();
  const current = getPeriodTotal(expenses, 'month', ref);

  const prevRef = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
  const previous = getPeriodTotal(expenses, 'month', prevRef);

  const diff = current - previous;
  let direction = 'same';
  if (diff > 0) direction = 'up';
  else if (diff < 0) direction = 'down';

  let percentText = '—';
  let diffPercent = null;
  if (previous > 0) {
    diffPercent = (diff / previous) * 100;
    const sign = diffPercent > 0 ? '+' : '';
    percentText = `${sign}${diffPercent.toFixed(0)}%`;
  } else if (current > 0) {
    percentText = '新增';
  }

  return {
    current,
    previous,
    diff,
    diffPercent,
    direction,
    percentText
  };
}

/**
 * 本月 Top N 分类
 */
function getTopCategories(expenses, referenceDate, limit) {
  const topN = limit == null ? 3 : limit;
  const monthItems = filterByPeriod(expenses, 'month', referenceDate);
  const grandTotal = sumAmount(monthItems);
  if (grandTotal <= 0) return [];

  const map = {};
  monthItems.forEach(item => {
    const key = item.category || '其他';
    if (!map[key]) map[key] = 0;
    map[key] += Number(item.amount) || 0;
  });

  return Object.keys(map)
    .map(category => ({
      category,
      total: map[category],
      percent: Number(((map[category] / grandTotal) * 100).toFixed(1))
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, topN);
}

/**
 * 本月最大单笔；同金额取 timestamp 最新
 */
function getMaxExpense(expenses, referenceDate) {
  const monthItems = filterByPeriod(expenses, 'month', referenceDate);
  if (!monthItems.length) return null;

  return monthItems.reduce((max, item) => {
    if (!max) return item;
    const amountA = Number(item.amount) || 0;
    const amountB = Number(max.amount) || 0;
    if (amountA > amountB) return item;
    if (amountA === amountB && (item.timestamp || 0) > (max.timestamp || 0)) return item;
    return max;
  }, null);
}

/**
 * 本月日均 = 本月总额 / 已过天数（至少为 1）
 */
function getDailyAverage(expenses, referenceDate) {
  const ref = referenceDate || new Date();
  const total = getPeriodTotal(expenses, 'month', ref);
  const dayOfMonth = Math.max(1, ref.getDate());
  return total / dayOfMonth;
}

module.exports = {
  toDateKey,
  parseDateKey,
  sumAmount,
  filterByPeriod,
  getPeriodTotal,
  getMonthComparison,
  getTopCategories,
  getMaxExpense,
  getDailyAverage
};
