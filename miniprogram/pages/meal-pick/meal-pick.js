const repo = require('../../services/repository');
const { MEAL_TYPE_LABEL } = require('../../services/repository');
const { previewText, normalizeNote } = require('../../domain/notes/fields');

Page({
  data: {
    date: '',
    type: '',
    headerLabel: '',
    keyword: '',
    items: [],
    hasFilter: false,
  },

  onLoad(query) {
    this.setData({
      date: (query.date || '').trim(),
      type: (query.type || '').trim(),
      headerLabel: `${(query.date || '').trim()} · ${MEAL_TYPE_LABEL[(query.type || '').trim()] || ''}`,
    });
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const all = repo.listNotes('美食');
    const { date, type, keyword } = this.data;
    const q = String(keyword || '').trim().toLowerCase();
    const items = all
      .map((n) => {
        const note = normalizeNote(n);
        const eatenAt = Array.isArray(note.eatenAt) ? note.eatenAt : [];
        const alreadyOnThisSlot = eatenAt.some((e) => e && e.date === date && e.type === type);
        const allEaten = eatenAt.slice().sort((a, b) =>
          a.date !== b.date ? (a.date < b.date ? 1 : -1) : 0
        );
        return {
          id: note.id,
          title: note.title,
          preview: previewText(note),
          imagePath: note.imagePath || '',
          firstChar: (note.title || '美').trim()[0] || '美',
          alreadyOnThisSlot,
          totalEaten: eatenAt.length,
          lastEaten: allEaten[0] ? `${allEaten[0].date.slice(5)} ${MEAL_TYPE_LABEL[allEaten[0].type] || ''}` : '',
        };
      })
      .filter((it) => {
        if (!q) return true;
        const blob = (it.title + ' ' + (it.preview || '')).toLowerCase();
        return blob.includes(q);
      });

    this.setData({ items, hasFilter: !!q });
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value }, () => this.refresh());
  },

  onClear() {
    this.setData({ keyword: '' }, () => this.refresh());
  },

  onPick(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const { date, type } = this.data;
    if (!date || !type) {
      wx.showToast({ title: '日期或餐次丢失', icon: 'none' });
      return;
    }
    const note = repo.getNote(id);
    if (!note) {
      wx.showToast({ title: '内容不存在', icon: 'none' });
      return;
    }
    const eatenAt = Array.isArray(note.eatenAt) ? note.eatenAt.slice() : [];
    const exists = eatenAt.some((e) => e && e.date === date && e.type === type);
    if (exists) {
      wx.showToast({ title: '这道菜已经在这一餐了', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }
    eatenAt.push({ date, type });
    const r = repo.saveNote({ ...note, eatenAt });
    if (!r.ok) {
      wx.showToast({ title: '保存失败', icon: 'none' });
      return;
    }
    wx.showToast({ title: '已加入' + (MEAL_TYPE_LABEL[type] || ''), icon: 'success' });
    setTimeout(() => wx.navigateBack(), 400);
  },
});
