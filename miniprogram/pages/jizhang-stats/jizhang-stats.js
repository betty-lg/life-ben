const repo = require('../../services/repository');
const {
  buildCategoryStatsWithNotes
} = require('../../utils/jizhang-categories');

const {
  toDateKey,
  filterByPeriod,
  sumAmount
} = require('../../utils/jizhang-stats');

Page({
  data: {
    total: '0.00',
    stats: [],
    trendData: [],
    trendAvg: '0.00',
    trendMaxLabel: '',
    monthCompare: {
      currentLabel: '',
      previousLabel: '',
      currentText: '0.00',
      previousText: '0.00',
      diffText: '持平',
      percentText: '—',
      direction: 'same',
      dayHint: ''
    },
    monthlyData: [],
    budgets: [],
    grandBudget: 0,
    grandBudgetText: '0',
    grandSpent: 0,
    grandSpentText: '0.00'
  },

  onShow() {
    this.loadStats();
    this.loadTrend();
    this.loadMonthly();
    this.loadBudgets();
  },

  loadStats() {
    const expenses = repo.getExpenses();
    if (expenses.length === 0) {
      this.setData({ total: '0.00', stats: [] });
      return;
    }

    const { grandTotal, stats } = buildCategoryStatsWithNotes(expenses);
    this.setData({
      total: grandTotal.toFixed(2),
      stats
    });
  },

  loadTrend() {
    const expenses = repo.getExpenses();
    const today = new Date();
    const days = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const key = toDateKey(d);
      const weekNames = ['日', '一', '二', '三', '四', '五', '六'];
      const label = i === 0 ? '今天' : `${d.getMonth() + 1}/${d.getDate()}`;
      const week = `周${weekNames[d.getDay()]}`;
      days.push({ key, label, week, isToday: i === 0 });
    }

    let maxVal = 0;
    let maxLabel = '';
    const trendData = days.map(day => {
      const total = expenses
        .filter(item => item.date === day.key)
        .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
      if (total > maxVal) {
        maxVal = total;
        maxLabel = day.label;
      }
      return {
        ...day,
        value: total,
        valueText: total.toFixed(0),
        height: 8,
        isZero: total <= 0,
        isMax: false
      };
    });

    const chartMax = Math.max(maxVal, 0.01);
    trendData.forEach(d => {
      if (d.value <= 0) {
        d.height = 8;
        d.isMax = false;
      } else {
        d.height = Math.round(20 + (d.value / chartMax) * 80);
        d.isMax = d.value === maxVal && maxVal > 0;
      }
    });

    const sum7 = trendData.reduce((s, d) => s + d.value, 0);

    this.setData({
      trendData,
      trendAvg: (sum7 / 7).toFixed(2),
      trendMaxLabel: maxVal > 0 ? maxLabel : ''
    });
  },

  loadMonthly() {
    const expenses = repo.getExpenses();
    const now = new Date();
    const dayOfMonth = now.getDate();
    const dayHint = `按每月 1～${dayOfMonth} 日对齐对比`;

    const current = this.sumAlignedMonth(expenses, now.getFullYear(), now.getMonth(), dayOfMonth);
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previous = this.sumAlignedMonth(expenses, prevDate.getFullYear(), prevDate.getMonth(), dayOfMonth);

    const diff = current - previous;
    let direction = 'same';
    let diffText = '与上月同期持平';
    let percentText = '—';

    if (diff > 0) {
      direction = 'up';
      diffText = `比上月同期多 ¥${diff.toFixed(2)}`;
    } else if (diff < 0) {
      direction = 'down';
      diffText = `比上月同期少 ¥${Math.abs(diff).toFixed(2)}`;
    }

    if (previous > 0) {
      const pct = (diff / previous) * 100;
      percentText = `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`;
    } else if (current > 0) {
      percentText = '';
    }

    const monthCompare = {
      currentLabel: `${now.getMonth() + 1}月1～${dayOfMonth}日`,
      previousLabel: `${prevDate.getMonth() + 1}月1～${Math.min(dayOfMonth, this.daysInMonth(prevDate.getFullYear(), prevDate.getMonth()))}日`,
      currentText: current.toFixed(2),
      previousText: previous.toFixed(2),
      diffText,
      percentText,
      direction,
      dayHint
    };

    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const alignedDay = Math.min(dayOfMonth, this.daysInMonth(y, m));
      const total = this.sumAlignedMonth(expenses, y, m, dayOfMonth);
      const isCurrent = i === 0;
      months.push({
        key: `${y}-${String(m + 1).padStart(2, '0')}`,
        label: isCurrent ? '本月' : `${m + 1}月`,
        value: total,
        valueText: total.toFixed(0),
        isCurrent
      });
    }

    const maxVal = Math.max(...months.map(m => m.value), 0.01);
    const monthlyData = months.map(m => ({
      ...m,
      height: m.value <= 0 ? 8 : Math.round(20 + (m.value / maxVal) * 80)
    }));

    this.setData({ monthCompare, monthlyData });
  },

  daysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
  },

  sumAlignedMonth(expenses, year, monthIndex, dayOfMonth) {
    const lastDay = Math.min(dayOfMonth, this.daysInMonth(year, monthIndex));
    const prefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    return (expenses || [])
      .filter(item => {
        if (!item.date || !item.date.startsWith(prefix)) return false;
        const day = parseInt(item.date.slice(8, 10), 10);
        return day >= 1 && day <= lastDay;
      })
      .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  },

  showCategoryDetail(e) {
    const category = e.currentTarget.dataset.category;
    const expenses = repo.getExpenses();
    const list = expenses
      .filter(item => item.category === category)
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    let msg = `【${category}】共 ${list.length} 笔，合计 ¥${list.reduce((s, i) => s + i.amount, 0).toFixed(2)}\n\n`;
    list.forEach((item, idx) => {
      msg += `${idx + 1}. ¥${item.amount}  ${item.date}${item.note ? ' (' + item.note + ')' : ''}\n`;
    });

    wx.showModal({
      title: '分类明细',
      content: msg,
      showCancel: false,
      confirmText: '知道了'
    });
  },

  /**
   * Monthly budget vs spent for each category. Pulls budgets from storage
   * (defaulted in app.js onLaunch) and current-month spend from expenses.
   */
  loadBudgets() {
    const budgets = repo.getBudgets();
    if (!budgets.length) {
      this.setData({ budgets: [] });
      return;
    }

    const expenses = repo.getExpenses();
    const now = new Date();
    const monthItems = filterByPeriod(expenses, 'month', now);
    const monthTotal = sumAmount(monthItems);

    // Build a quick lookup of spent per category this month
    const spentMap = {};
    monthItems.forEach(item => {
      const key = item.category || '其他';
      spentMap[key] = (spentMap[key] || 0) + (Number(item.amount) || 0);
    });

    const grandBudget = budgets.reduce((s, b) => s + (Number(b.budget) || 0), 0);

    const items = budgets.map(b => {
      const budget = Number(b.budget) || 0;
      const spent = spentMap[b.category] || 0;
      const over = budget > 0 && spent > budget;
      const left = budget - spent;
      const percentRaw = budget > 0 ? (spent / budget) * 100 : 0;
      const percent = Math.min(percentRaw, 100);
      const percentText = percentRaw.toFixed(0);
      return {
        category: b.category,
        budget,
        budgetText: budget.toFixed(0),
        spent,
        spentText: spent.toFixed(2),
        over,
        leftText: Math.abs(left).toFixed(2),
        percent: percent.toFixed(0),
        percentText,
      };
    });

    this.setData({
      budgets: items,
      grandBudget,
      grandBudgetText: grandBudget.toFixed(0),
      grandSpent: monthTotal,
      grandSpentText: monthTotal.toFixed(2),
    });
  }
});
