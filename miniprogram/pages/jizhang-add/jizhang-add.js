const repo = require('../../services/repository');
const { syncCategories, getCategoryColor, buildCategoryTree } = require('../../utils/jizhang-categories');

Page({
  data: {
    amount: '',
    categoryTree: [],
    selectedCategory: '',
    selectedSub: '',
    selectedColor: '#4CAF50',
    date: '',
    note: ''
  },

  onLoad() {
    const today = new Date().toISOString().split('T')[0];
    const stored = repo.getCategories ? repo.getCategories() : syncCategories();
    const tree = buildCategoryTree(stored).map(c => ({ ...c, expanded: false }));
    this.setData({
      date: today,
      categoryTree: tree
    });
  },

  onAmountInput(e) {
    this.setData({ amount: e.detail.value });
  },

  /**
   * Click on the 1-level row:
   *  - Always collapses other 1-level groups (accordion behaviour)
   *  - Toggles `expanded` for the clicked one
   *  - Selects the 1-level (no sub selected yet)
   */
  onToggleExpand(e) {
    const name = e.currentTarget.dataset.name;
    if (!name) return;
    const tree = this.data.categoryTree;
    const cat = tree.find(c => c.name === name);
    if (!cat) return;

    const nextExpanded = !cat.expanded;
    const next = tree.map(c =>
      c.name === name ? { ...c, expanded: nextExpanded } : { ...c, expanded: false }
    );
    this.setData({ categoryTree: next });

    // Auto-select the 1-level (only if not already selected, or selected with a sub)
    if (this.data.selectedCategory !== name || this.data.selectedSub) {
      this.selectCategory(name, '');
    }
  },

  onPickSub(e) {
    const category = e.currentTarget.dataset.category || '';
    const sub = e.currentTarget.dataset.sub || '';
    this.selectCategory(category, sub);
  },

  selectCategory(category, sub) {
    const color = getCategoryColor(sub || category);
    this.setData({
      selectedCategory: category,
      selectedSub: sub,
      selectedColor: color
    });
  },

  onDateChange(e) {
    this.setData({ date: e.detail.value });
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value });
  },

  saveExpense() {
    const { amount, selectedCategory, selectedSub, selectedColor, date, note } = this.data;

    const numAmount = parseFloat(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' });
      return;
    }
    if (!selectedCategory) {
      wx.showToast({ title: '请选择分类', icon: 'none' });
      return;
    }

    const r = repo.addExpense({
      amount: numAmount,
      category: selectedCategory,
      subcategory: selectedSub,
      date: date,
      note: note || '',
      timestamp: Date.now(),
      color: selectedColor
    });
    if (!r.ok) {
      wx.showToast({ title: '保存失败', icon: 'none' });
      return;
    }

    wx.showToast({ title: '保存成功', icon: 'success' });
    this.setData({ amount: '', note: '', selectedCategory: '', selectedSub: '' });

    setTimeout(() => {
      wx.navigateBack();
    }, 500);
  }
});
