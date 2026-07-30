const repo = require('../../services/repository');
const { syncCategories, getCategoryColor } = require('../../utils/jizhang-categories');

Page({
  data: {
    amount: '',
    categories: [],
    selectedCategory: '餐饮',
    date: '',
    note: ''
  },

  onLoad() {
    const today = new Date().toISOString().split('T')[0];
    const categories = syncCategories();
    this.setData({
      date: today,
      categories,
      selectedCategory: categories.includes('餐饮') ? '餐饮' : categories[0]
    });
  },

  onAmountInput(e) {
    this.setData({ amount: e.detail.value });
  },

  selectCategory(e) {
    this.setData({ selectedCategory: e.currentTarget.dataset.category });
  },

  onDateChange(e) {
    this.setData({ date: e.detail.value });
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value });
  },

  saveExpense() {
    const { amount, selectedCategory, date, note } = this.data;

    const numAmount = parseFloat(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' });
      return;
    }

    const r = repo.addExpense({
      amount: numAmount,
      category: selectedCategory,
      date: date,
      note: note || '',
      timestamp: Date.now(),
      color: getCategoryColor(selectedCategory)
    });
    if (!r.ok) {
      wx.showToast({ title: '保存失败', icon: 'none' });
      return;
    }

    wx.showToast({ title: '保存成功', icon: 'success' });
    this.setData({ amount: '', note: '' });

    setTimeout(() => {
      wx.navigateBack();
    }, 500);
  }
});
