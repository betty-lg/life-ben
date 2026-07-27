const repo = require('../../services/repository');
const { CATEGORIES } = require('../../domain/notes/categories');
const { previewText } = require('../../domain/notes/fields');

Page({
  data: {
    categories: CATEGORIES,
    category: '美食',
    notes: [],
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const notes = repo.listNotes(this.data.category).map((n) => ({
      ...n,
      preview: previewText(n),
      thumb: n.imagePath || '',
    }));
    this.setData({ notes });
  },

  onSelectCategory(e) {
    const category = e.currentTarget.dataset.cat;
    this.setData({ category }, () => this.refresh());
  },

  onOpenNote(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/note-detail/note-detail?id=${id}` });
  },

  onCreate() {
    const category = this.data.category;
    wx.navigateTo({
      url: `/pages/note-edit/note-edit?category=${encodeURIComponent(category)}`,
    });
  },
});
