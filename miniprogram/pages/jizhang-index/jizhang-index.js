const repo = require('../../services/repository');
const backup = require('../../services/backup');
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
    exporting: false,
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
  },

  async onExport() {
    if (this.data.exporting) return;
    const stats = repo.load();
    const noteCount = (stats.notes || []).length;
    const expCount = (stats.expenses || []).length;
    if (noteCount === 0 && expCount === 0) {
      wx.showModal({
        title: '没有数据可导出',
        content: '目前还没有笔记或记账记录。先添加一些内容再导出。',
        showCancel: false,
        confirmText: '好',
      });
      return;
    }
    this.setData({ exporting: true });
    wx.showLoading({ title: '打包中…', mask: true });
    try {
      const result = await backup.exportToFile();
      wx.hideLoading();
      this.setData({ exporting: false });
      const sizeText = backup.humanSize(result.sizeBytes);
      const imgCount = result.stats.imageCount;
      const imgFail = result.stats.imageFailures;
      const imgHint = imgFail > 0 ? `（${imgFail} 张图读取失败，可能已被微信清理）` : '';
      wx.showModal({
        title: '导出成功',
        content:
          `文件：${result.fileName}\n` +
          `大小：${sizeText}\n` +
          `笔记 ${result.stats.notes} 条 · 记账 ${result.stats.expenses} 条 · 打卡 ${result.stats.checkins} 条\n` +
          `图片 ${imgCount} 张${imgHint}\n\n` +
          `点击「分享到微信」保存到文件传输助手（建议每周/每月导出一次）`,
        confirmText: '分享到微信',
        cancelText: '稍后',
        success: (res) => {
          if (res.confirm) {
            wx.shareFileMessage({
              filePath: result.filePath,
              success: () => {
                wx.showToast({ title: '已分享', icon: 'success' });
              },
              fail: () => {
                wx.showToast({ title: '分享取消', icon: 'none' });
              },
            });
          }
        },
      });
    } catch (e) {
      wx.hideLoading();
      this.setData({ exporting: false });
      wx.showModal({
        title: '导出失败',
        content: '打包数据时出错：' + (e && e.errMsg ? e.errMsg : JSON.stringify(e)),
        showCancel: false,
      });
    }
  }
});
