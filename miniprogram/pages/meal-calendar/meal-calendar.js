const repo = require('../../services/repository');
const { dayKey, parseDayKey } = require('../../utils/date');
const { MEAL_TYPES, MEAL_TYPE_LABEL } = require('../../services/repository');
const { previewText, normalizeNote } = require('../../domain/notes/fields');

const TYPE_EMOJI = { breakfast: '☀', lunch: '🍚', dinner: '🌙' };

function buildSection(type, date, notes) {
  return {
    type,
    label: MEAL_TYPE_LABEL[type],
    emoji: TYPE_EMOJI[type] || '·',
    items: notes.map((n) => {
      const note = normalizeNote(n);
      return {
        id: note.id,
        title: note.title,
        preview: previewText(note),
        imagePath: note.imagePath || '',
        firstChar: (note.title || '美').trim()[0] || '美',
      };
    }),
  };
}

function dateLabel(date) {
  try {
    const d = parseDayKey(date);
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${weekdays[d.getDay()]}`;
  } catch (e) {
    return date;
  }
}

Page({
  data: {
    year: 0,
    month: 0,
    title: '',
    cells: [],
    today: '',
    selectedDate: '',
    selectedLabel: '',
    mealSections: [],
    hasAnyMeal: false,
  },

  onShow() {
    const today = dayKey();
    if (!this.data.selectedDate) {
      this.setData({ selectedDate: today });
    }
    this.refresh();
  },

  onPullDownRefresh() {
    this.refresh();
    wx.stopPullDownRefresh();
  },

  refresh() {
    const year = this.data.year || dayKey().slice(0, 4) * 1;
    const month = this.data.month || dayKey().slice(5, 7) * 1;
    this.renderMonth(year, month);
    this.loadMealSections(this.data.selectedDate);
  },

  renderMonth(year, month) {
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const datesWithMeals = new Set(repo.datesWithMealsInMonth(monthKey));
    const today = dayKey();
    const selectedDate = this.data.selectedDate || today;

    const first = new Date(year, month - 1, 1);
    const firstWeekday = first.getDay();
    const daysInMonth = new Date(year, month, 0).getDate();

    const cells = [];
    for (let i = 0; i < firstWeekday; i++) {
      cells.push({ empty: true });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${monthKey}-${String(d).padStart(2, '0')}`;
      cells.push({
        empty: false,
        day: d,
        date: dateStr,
        isToday: dateStr === today,
        isSelected: dateStr === selectedDate,
        hasMeal: datesWithMeals.has(dateStr),
      });
    }
    while (cells.length % 7 !== 0) cells.push({ empty: true });

    this.setData({
      year,
      month,
      title: `${year} 年 ${month} 月`,
      cells,
      today,
    });
  },

  loadMealSections(date) {
    const grouped = repo.findMealsForDate(date);
    const sections = MEAL_TYPES.map((t) => buildSection(t, date, grouped[t]));
    const hasAnyMeal = sections.some((s) => s.items.length > 0);
    this.setData({
      selectedDate: date,
      selectedLabel: dateLabel(date),
      mealSections: sections,
      hasAnyMeal,
    });
  },

  onPrev() {
    let { year, month } = this.data;
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    this.renderMonth(year, month);
  },

  onNext() {
    let { year, month } = this.data;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    this.renderMonth(year, month);
  },

  onToday() {
    const t = dayKey();
    this.loadMealSections(t);
    this.renderMonth(t.slice(0, 4) * 1, t.slice(5, 7) * 1);
  },

  onTapDay(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;
    this.loadMealSections(date);
    // Re-render month so isSelected marker moves
    this.renderMonth(this.data.year, this.data.month);
  },

  onAddMeal(e) {
    const type = e.currentTarget.dataset.type;
    if (!type || !this.data.selectedDate) return;
    wx.navigateTo({
      url: '/pages/meal-pick/meal-pick?date=' + this.data.selectedDate + '&type=' + type,
    });
  },

  onOpenNote(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: '/pages/note-detail/note-detail?id=' + id,
    });
  },

  onLongPressItem(e) {
    const id = e.currentTarget.dataset.id;
    const type = e.currentTarget.dataset.type;
    if (!id || !type) return;
    wx.showActionSheet({
      itemList: ['从这一餐移除', '查看详情'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.removeMeal({ id, type });
        } else if (res.tapIndex === 1) {
          this.onOpenNote({ currentTarget: { dataset: { id } } });
        }
      },
    });
  },

  removeMeal({ id, type }) {
    const note = repo.getNote(id);
    if (!note) return;
    const date = this.data.selectedDate;
    const eatenAt = (note.eatenAt || []).filter(
      (x) => !(x && x.date === date && x.type === type)
    );
    const r = repo.saveNote({ ...note, eatenAt });
    if (!r.ok) {
      wx.showToast({ title: '移除失败', icon: 'none' });
      return;
    }
    wx.showToast({ title: '已从这一餐移除', icon: 'success' });
    this.loadMealSections(date);
    this.renderMonth(this.data.year, this.data.month);
  },
});
