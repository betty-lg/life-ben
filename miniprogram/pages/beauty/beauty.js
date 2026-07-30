const repo = require('../../services/repository');
const { previewText, normalizeNote } = require('../../domain/notes/fields');

Page({
  data: {
    keyword: '',
    notes: [],
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const notes = repo.searchNotes('美容', this.data.keyword).map((n) => {
      const note = normalizeNote(n);
      return {
        ...note,
        preview: previewText(note) || '暂无摘要',
        imagePath: note.imagePath || '',
        firstChar: (note.title || '美').trim()[0] || '美',
      };
    });
    this.setData({ notes });
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value }, () => this.refresh());
  },

  onClear() {
    this.setData({ keyword: '' }, () => this.refresh());
  },

  onOpen(e) {
    wx.navigateTo({
      url: `/pages/note-detail/note-detail?id=${e.currentTarget.dataset.noteId}`,
    });
  },

  onCreate() {
    wx.navigateTo({
      url: '/pages/note-edit/note-edit?category=' + encodeURIComponent('美容'),
    });
  },
});
