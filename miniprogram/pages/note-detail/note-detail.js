const repo = require('../../services/repository');
const engine = require('../../domain/checkin/engine');
const { dayKey } = require('../../utils/date');
const { normalizeNote, parseMaterialGroups } = require('../../domain/notes/fields');
const { LEARN_TAG_ICON } = require('../../domain/notes/categories');

const CATEGORY_LABEL = { 美食: '美食', 美容: '美容', 学习: '学习' };

/** 从 note 里抽出一句话简介（用于分享描述） */
function buildShareDesc(note) {
  if (!note) return '生活本';
  if (note.intro && note.intro.trim()) return note.intro.trim();
  if (note.summary && note.summary.trim()) return note.summary.trim();
  if (note.materials) return '材料：' + note.materials.split('\n').slice(0, 2).join(' / ');
  if (note.steps) return note.steps.split('\n')[0].trim();
  if (note.body) return note.body.split('\n')[0].trim().slice(0, 60);
  return CATEGORY_LABEL[note.category] || '生活本';
}

Page({
  data: {
    id: '',
    note: null,
    firstChar: '美',
    isFood: false,
    isBeauty: false,
    isLearn: false,
    statusLine: '',
    hasActive: false,
    hasEnded: false,
    endedId: '',
    learnTags: [],
    stepItems: [],
    hasStepItems: false,
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
      wx.showToast({ title: '内容不存在', icon: 'none' });
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

    const titles = { 美食: '美食详情', 美容: '美容详情', 学习: '学习详情' };
    wx.setNavigationBarTitle({ title: titles[note.category] || '详情' });

    const matGroups = parseMaterialGroups(note.materials);

    const fallback = note.category === '学习' ? '学' : note.category === '美容' ? '美' : '美';
    const firstChar =
      (note.category === '学习'
        ? (note.summary || note.title || '')
        : (note.title || '')
      ).trim()[0] || fallback;

    const learnTags = (Array.isArray(note.tags) ? note.tags : []).map((name) => ({
      name,
      icon: LEARN_TAG_ICON[name] || '',
    }));

    const stepItems = Array.isArray(note.stepItems)
      ? note.stepItems.filter((it) => it && ((it.text || '').trim() || it.imagePath))
      : [];
    const hasStepItems = stepItems.length > 0;

    this.setData({
      note,
      firstChar,
      matGroups,
      isFood: note.category === '美食',
      isBeauty: note.category === '美容',
      isLearn: note.category === '学习',
      statusLine,
      hasActive: !!active,
      hasEnded: !active && !!ended,
      endedId: ended ? ended.id : '',
      learnTags,
      stepItems,
      hasStepItems,
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
      title: '确认删除？',
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

  onPreviewStepImage(e) {
    const idx = e.currentTarget.dataset.idx;
    const urls = (this.data.stepItems || []).map((it) => it.imagePath).filter(Boolean);
    const current = (this.data.stepItems[idx] || {}).imagePath;
    if (!current) return;
    wx.previewImage({ urls, current });
  },

  /**
   * 分享给微信好友：右上角"···" 菜单 / 页面内"分享"按钮都会触发
   * 分享内容 = 当前 note 详情页，对方点开后跳到 note-detail?id=...
   */
  onShareAppMessage() {
    const note = this.data.note;
    if (!note) {
      return {
        title: '生活本',
        path: '/pages/food/food',
      };
    }
    const cat = CATEGORY_LABEL[note.category] || '生活本';
    const titleText = note.title || (cat + '记录');
    const desc = buildShareDesc(note);
    return {
      title: `《${titleText}》· ${desc}`,
      path: `/pages/note-detail/note-detail?id=${note.id}`,
    };
  },

  /**
   * 分享到朋友圈：当前 note 摘要 + 链接（query 形式，朋友点开跳详情）
   * 朋友圈分享 imageUrl 必须是可以公网访问的 HTTPS 图（本地路径无效），
   * 如果没有公网图片，不传 imageUrl，会用页面默认截图，体验略差但可用。
   */
  onShareTimeline() {
    const note = this.data.note;
    if (!note) {
      return { title: '生活本', query: '' };
    }
    const cat = CATEGORY_LABEL[note.category] || '生活本';
    const titleText = note.title || (cat + '记录');
    const desc = buildShareDesc(note);
    return {
      title: `《${titleText}》· ${desc}`,
      query: `id=${note.id}`,
    };
  },
});
