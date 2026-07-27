const repo = require('../../services/repository');
const engine = require('../../domain/checkin/engine');
const { dayKey } = require('../../utils/date');
const { normalizeNote } = require('../../domain/notes/fields');

Page({
  data: {
    id: '',
    note: null,
    statusLine: '',
    hasActive: false,
    hasEnded: false,
    endedId: '',
  },

  onLoad(query) {
    this.setData({ id: query.id || '' });
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const note = normalizeNote(repo.getNote(this.data.id));
    if (!note) {
      wx.showToast({ title: '笔记不存在', icon: 'none' });
      return;
    }
    const list = repo.listCheckins();
    const active = list.find((c) => c.noteId === note.id && c.status === 'active');
    const ended = list.find((c) => c.noteId === note.id && c.status === 'ended');
    let statusLine = '';
    if (active) {
      statusLine = `打卡进行中 · ${engine.progressText(active, dayKey())}${active.longTerm ? ' · 长期' : ''}`;
    } else if (ended) {
      statusLine = `打卡已结束 · 上次 ${engine.progressText(ended, dayKey())}`;
    }
    this.setData({
      note,
      statusLine,
      hasActive: !!active,
      hasEnded: !active && !!ended,
      endedId: ended ? ended.id : '',
    });
  },

  onCheckinIcon() {
    wx.switchTab({ url: '/pages/checkin/checkin' });
  },

  onStart() {
    wx.navigateTo({
      url: `/pages/checkin-start/checkin-start?noteId=${this.data.id}`,
    });
  },

  onResume() {
    const list = repo.listCheckins();
    const ended = list.find((x) => x.id === this.data.endedId);
    if (!ended) return;
    if (engine.hasActiveForNote(list, ended.noteId)) {
      wx.showToast({ title: '该笔记已有进行中的打卡', icon: 'none' });
      return;
    }
    const next = engine.resumeCheckin(ended, dayKey());
    const result = repo.upsertCheckin(next);
    if (!result.ok) {
      wx.showToast({ title: '保存失败', icon: 'none' });
      return;
    }
    wx.showToast({ title: '已继续打卡', icon: 'success' });
    wx.switchTab({ url: '/pages/checkin/checkin' });
  },

  onEdit() {
    wx.navigateTo({
      url: `/pages/note-edit/note-edit?id=${this.data.id}`,
    });
  },

  onDelete() {
    wx.showModal({
      title: '删除笔记？',
      content: '关联的进行中打卡会一并结束。',
      confirmColor: '#a33b2c',
      success: (res) => {
        if (!res.confirm) return;
        const r = repo.deleteNote(this.data.id);
        if (!r.ok) {
          wx.showToast({ title: '删除失败', icon: 'none' });
          return;
        }
        wx.navigateBack();
      },
    });
  },

  onPreviewImage() {
    const path = this.data.note && this.data.note.imagePath;
    if (!path) return;
    wx.previewImage({ urls: [path], current: path });
  },
});
