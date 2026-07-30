const repo = require('../../services/repository');
const { normalizeNote } = require('../../domain/notes/fields');
const { LEARN_TAG_ICON } = require('../../domain/notes/categories');

Page({
  data: {
    keyword: '',
    notes: [],
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const notes = repo.searchNotes('学习', this.data.keyword).map((n) => {
      const note = normalizeNote(n);
      const tags = Array.isArray(note.tags) ? note.tags.filter(Boolean) : [];
      const tag = tags[0] || '';
      return {
        ...note,
        line: note.summary || '（空）',
        firstChar: (note.title || '学').trim()[0] || '学',
        tag,
        tagIcon: tag ? LEARN_TAG_ICON[tag] || '' : '',
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
      url: '/pages/note-edit/note-edit?category=' + encodeURIComponent('学习'),
    });
  },
});
