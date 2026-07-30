const repo = require('../../services/repository');
const {
  getPeriodTotal,
  getMonthComparison,
  getTopCategories,
  getMaxExpense,
  getDailyAverage
} = require('../../utils/jizhang-stats');

Page({
  data: {
    todayTotal: '0.00',
    monthTotal: '0.00',
    yearTotal: '0.00',
    monthCompare: {
      diffText: '与上月持平',
      percentText: '—',
      direction: 'same'
    },
    dailyAverage: '0.00',
    topCategories: [],
    maxExpense: null,
    recentExpenses: []
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    const allExpenses = repo.getExpenses();
    const sorted = allExpenses.slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    const now = new Date();

    const todayTotal = getPeriodTotal(sorted, 'day', now);
    const monthTotal = getPeriodTotal(sorted, 'month', now);
    const yearTotal = getPeriodTotal(sorted, 'year', now);
    const compare = getMonthComparison(sorted, now);
    const dailyAverage = getDailyAverage(sorted, now);
    const topCategories = getTopCategories(sorted, now, 3).map(item => ({
      ...item,
      totalText: item.total.toFixed(2)
    }));

    const maxRaw = getMaxExpense(sorted, now);
    const maxExpense = maxRaw
      ? {
          amount: Number(maxRaw.amount).toFixed(2),
          category: maxRaw.category || '其他',
          date: maxRaw.date || ''
        }
      : null;

    const absDiff = Math.abs(compare.diff).toFixed(2);
    let diffText = '与上月持平';
    if (compare.direction === 'up') {
      diffText = `比上月多 ¥${absDiff}`;
    } else if (compare.direction === 'down') {
      diffText = `比上月少 ¥${absDiff}`;
    }

    const recentExpenses = sorted.slice(0, 5).map(item => ({
      ...item,
      amountText: Number(item.amount).toFixed(2),
      categoryInitial: item.category ? item.category.slice(0, 1) : '其'
    }));

    this.setData({
      todayTotal: todayTotal.toFixed(2),
      monthTotal: monthTotal.toFixed(2),
      yearTotal: yearTotal.toFixed(2),
      monthCompare: {
        diffText,
        percentText: compare.percentText,
        direction: compare.direction
      },
      dailyAverage: dailyAverage.toFixed(2),
      topCategories,
      maxExpense,
      recentExpenses
    });
  },

  deleteItem(e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.recentExpenses[index];
    if (!item) return;

    repo.deleteExpense(
      (exp) => exp.timestamp === item.timestamp && Number(exp.amount) === Number(item.amount)
    );
    this.loadData();
    wx.showToast({ title: '已删除', icon: 'success' });
  },

  clearAll() {
    wx.showModal({
      title: '确认清空',
      content: '确定要删除所有记录吗？',
      success: res => {
        if (res.confirm) {
          repo.clearExpenses();
          this.loadData();
          wx.showToast({ title: '已清空', icon: 'success' });
        }
      }
    });
  },

  onGoAdd() {
    wx.navigateTo({ url: '/pages/jizhang-add/jizhang-add' });
  },

  onGoStats() {
    wx.navigateTo({ url: '/pages/jizhang-stats/jizhang-stats' });
  }
});
