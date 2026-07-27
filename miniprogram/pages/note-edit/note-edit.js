const repo = require('../../services/repository');
const { CATEGORIES } = require('../../domain/notes/categories');
const { normalizeNote, composeBody } = require('../../domain/notes/fields');

Page({
  data: {
    id: '',
    title: '',
    imagePath: '',
    materials: '',
    steps: '',
    tips: '',
    category: '美食',
    categories: CATEGORIES,
    catIndex: 0,
    isNew: true,
  },

  onLoad(query) {
    if (query.id) {
      const note = normalizeNote(repo.getNote(query.id));
      if (note) {
        const catIndex = Math.max(0, CATEGORIES.indexOf(note.category));
        this.setData({
          id: note.id,
          title: note.title,
          imagePath: note.imagePath || '',
          materials: note.materials || '',
          steps: note.steps || '',
          tips: note.tips || '',
          category: note.category,
          catIndex,
          isNew: false,
        });
        wx.setNavigationBarTitle({ title: '编辑笔记' });
        return;
      }
    }
    const category = query.category ? decodeURIComponent(query.category) : '美食';
    const catIndex = Math.max(0, CATEGORIES.indexOf(category));
    this.setData({ category, catIndex, isNew: true });
    wx.setNavigationBarTitle({ title: '新建笔记' });
  },

  onTitle(e) {
    this.setData({ title: e.detail.value });
  },

  onMaterials(e) {
    this.setData({ materials: e.detail.value });
  },

  onSteps(e) {
    this.setData({ steps: e.detail.value });
  },

  onTips(e) {
    this.setData({ tips: e.detail.value });
  },

  onCategory(e) {
    const catIndex = Number(e.detail.value);
    this.setData({
      catIndex,
      category: this.data.categories[catIndex],
    });
  },

  onChooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempPath = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath;
        if (!tempPath) {
          wx.showToast({ title: '未选择图片', icon: 'none' });
          return;
        }
        wx.showLoading({ title: '保存中', mask: true });
        wx.getFileSystemManager().saveFile({
          tempFilePath: tempPath,
          success: (r) => {
            wx.hideLoading();
            this.setData({ imagePath: r.savedFilePath });
          },
          fail: () => {
            // Fallback: keep temp path for current session
            wx.hideLoading();
            this.setData({ imagePath: tempPath });
            wx.showToast({ title: '已选用图片（临时路径）', icon: 'none' });
          },
        });
      },
      fail: () => {
        wx.showToast({ title: '取消选择或无权访问相册', icon: 'none' });
      },
    });
  },

  onRemoveImage() {
    this.setData({ imagePath: '' });
  },

  onSave() {
    const { title, imagePath, materials, steps, tips, category, id } = this.data;
    const result = repo.saveNote({
      id: id || undefined,
      title,
      imagePath,
      materials,
      steps,
      tips,
      body: composeBody({ materials, steps, tips }),
      category,
    });
    if (!result.ok) {
      wx.showToast({ title: result.error || '保存失败', icon: 'none' });
      return;
    }
    wx.showToast({ title: '已保存', icon: 'success' });
    setTimeout(() => {
      if (this.data.isNew) {
        wx.redirectTo({
          url: `/pages/note-detail/note-detail?id=${result.note.id}`,
        });
      } else {
        wx.navigateBack();
      }
    }, 400);
  },
});
