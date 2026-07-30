const repo = require('../../services/repository');
const { FOOD_TAGS } = require('../../domain/notes/categories');
const { previewText, normalizeNote } = require('../../domain/notes/fields');
const { MEAL_TYPE_LABEL } = require('../../services/repository');

function eatenLabel(eatenAt) {
  if (!Array.isArray(eatenAt) || !eatenAt.length) return '';
  const order = { breakfast: 0, lunch: 1, dinner: 2 };
  const sorted = eatenAt.slice().sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (order[a.type] || 0) - (order[b.type] || 0);
  });
  const top = sorted[0];
  const mm = top.date.slice(5, 7);
  const dd = top.date.slice(8, 10);
  const type = MEAL_TYPE_LABEL[top.type] || top.type;
  const more = sorted.length > 1 ? ` · 等 ${sorted.length} 次` : '';
  return `${mm}-${dd} ${type}${more}`;
}

Page({
  data: {
    keyword: '',
    activeTag: 'all',
    tags: FOOD_TAGS,
    notes: [],
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const tag = this.data.activeTag === 'all' ? '' : this.data.activeTag;
    const list = repo.searchNotes('美食', this.data.keyword || '', tag).map((n) => {
      const note = normalizeNote(n);
      return {
        id: note.id,
        title: note.title,
        preview: previewText(note),
        imagePath: note.imagePath || '',
        firstChar: (note.title || '美').trim()[0] || '美',
        eatenLabel: eatenLabel(note.eatenAt),
      };
    });
    this.setData({ notes: list });
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value || '' }, () => this.refresh());
  },

  onSearch() {
    this.refresh();
  },

  onClear() {
    this.setData({ keyword: '' }, () => this.refresh());
  },

  onTapTag(e) {
    const tag = e.currentTarget.dataset.tag || 'all';
    this.setData({ activeTag: tag }, () => this.refresh());
  },

  onOpen(e) {
    const id = e.currentTarget.dataset.noteId;
    if (!id) {
      wx.showToast({ title: '打不开这条内容', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/note-detail/note-detail?id=' + id,
    });
  },

  onCreate() {
    wx.navigateTo({
      url: '/pages/note-edit/note-edit?category=' + encodeURIComponent('美食'),
    });
  },

  onOpenCalendar() {
    wx.navigateTo({ url: '/pages/meal-calendar/meal-calendar' });
  },
});
