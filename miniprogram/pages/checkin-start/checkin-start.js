const repo = require('../../services/repository');
const engine = require('../../domain/checkin/engine');
const { dayKey } = require('../../utils/date');

Page({
  data: {
    noteId: '',
    note: null,
    goalType: 'continuous',
    target: 14,
    targetText: '14',
    longTerm: false,
  },

  onLoad(query) {
    const noteId = query.noteId || '';
    const note = repo.getNote(noteId);
    if (!note) {
      wx.showToast({ title: '笔记不存在', icon: 'none' });
      return;
    }
    this.setData({ noteId, note });
  },

  onGoal(e) {
    const goalType = e.currentTarget.dataset.type;
    const target = goalType === 'weekly' ? 2 : 14;
    this.setData({
      goalType,
      target,
      targetText: String(target),
    });
  },

  onTargetInput(e) {
    // Allow empty while editing; do not force min=1 on each keystroke.
    this.setData({ targetText: e.detail.value });
  },

  onTargetBlur() {
    const raw = String(this.data.targetText || '').trim();
    if (raw === '') return;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) {
      this.setData({ targetText: '1', target: 1 });
      return;
    }
    this.setData({ target: n, targetText: String(n) });
  },

  onLongTerm(e) {
    this.setData({ longTerm: !!e.detail.value });
  },

  onSave() {
    const { note, goalType, longTerm } = this.data;
    const raw = String(this.data.targetText || '').trim();
    const target = parseInt(raw, 10);
    if (!Number.isFinite(target) || target < 1) {
      wx.showToast({ title: '请填写有效的次数（至少 1）', icon: 'none' });
      return;
    }
    this.setData({ target, targetText: String(target) });

    const list = repo.listCheckins();
    if (engine.hasActiveForNote(list, note.id)) {
      wx.showToast({ title: '该笔记已有进行中的打卡', icon: 'none' });
      return;
    }
    const checkin = engine.createCheckin({
      noteId: note.id,
      label: `${note.category}·${note.title}`,
      goalType,
      target,
      longTerm,
      todayKey: dayKey(),
    });
    const result = repo.upsertCheckin(checkin);
    if (!result.ok) {
      wx.showToast({ title: '保存失败', icon: 'none' });
      return;
    }
    wx.showToast({ title: '已开启打卡', icon: 'success' });
    setTimeout(() => {
      wx.switchTab({ url: '/pages/checkin/checkin' });
    }, 400);
  },
});
