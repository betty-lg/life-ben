const repo = require('../../services/repository');
const { CATEGORIES, FOOD_TAGS, LEARN_TAGS, LEARN_TAG_ICON } = require('../../domain/notes/categories');
const { normalizeNote, composeBody } = require('../../domain/notes/fields');

function buildTagOptions(selected) {
  const set = new Set(selected || []);
  return FOOD_TAGS.map((name) => ({ name, on: set.has(name) }));
}

function buildLearnTagOptions(selected) {
  const set = new Set(selected || []);
  return LEARN_TAGS.map((name) => ({ name, icon: LEARN_TAG_ICON[name] || '', on: set.has(name) }));
}

function buildTagOptionsFor(category, selected) {
  if (category === '学习') return buildLearnTagOptions(selected);
  return buildTagOptions(selected);
}

function getTagListFor(category) {
  return category === '学习' ? LEARN_TAGS : FOOD_TAGS;
}

function parseMaterials(raw) {
  const text = (raw || '').trim();
  if (!text) return [{ name: '', rows: [{ name: '', amount: '' }] }];
  const lines = text.split('\n');
  const groups = [];
  let cur = null;
  for (const line of lines) {
    const heading = line.match(/^【(.+?)】\s*$/);
    if (heading) {
      cur = { name: heading[1], rows: [] };
      groups.push(cur);
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!cur) {
      cur = { name: '', rows: [] };
      groups.push(cur);
    }
    const sep = trimmed.match(/^(.+?)\s{2,}(.+)$/) || trimmed.match(/^(.+?)\t+(.+)$/);
    if (sep) {
      cur.rows.push({ name: sep[1].trim(), amount: sep[2].trim() });
    } else {
      cur.rows.push({ name: trimmed, amount: '' });
    }
  }
  if (!groups.length) return [{ name: '', rows: [{ name: '', amount: '' }] }];
  for (const g of groups) {
    if (!g.rows.length) g.rows.push({ name: '', amount: '' });
  }
  return groups;
}

function serializeMaterials(groups) {
  const parts = [];
  for (const g of groups) {
    const rows = (g.rows || []).filter((r) => r.name.trim() || r.amount.trim());
    if (!rows.length && !(g.name || '').trim()) continue;
    const lines = rows.map((r) =>
      r.amount.trim() ? `${r.name.trim()}  ${r.amount.trim()}` : r.name.trim()
    );
    if ((g.name || '').trim()) {
      parts.push(`【${g.name.trim()}】\n${lines.join('\n')}`);
    } else {
      parts.push(lines.join('\n'));
    }
  }
  return parts.join('\n');
}

/**
 * 老 `steps` string → 步骤卡片数组（用于首次进入编辑页时回填 UI）
 * 兼容编号前缀：'1. xxx' / '1、xxx' / '1) xxx' / '① xxx' / '第一步：xxx'
 */
function parseSteps(raw) {
  const text = (raw || '').trim();
  if (!text) return [{ text: '', imagePath: '' }];
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [{ text: '', imagePath: '' }];
  return lines.map((line) => ({
    text: line.replace(/^\d+[、.)]\s*/, '').replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '').replace(/^第[一二三四五六七八九十百千]+步[：:]\s*/, ''),
    imagePath: '',
  }));
}

/**
 * 步骤卡片数组 → string（'1. xxx\n2. yyy'），用于 fields.js composeBody
 * 空文字的步骤会被跳过（空步骤不计入编号，保持显示连续）
 * 纯图片（无文字）也会被跳过——图片信息存于 stepItems，string 仅承载文字
 */
function serializeSteps(items) {
  let n = 0;
  const out = [];
  (items || []).forEach((it) => {
    const t = (it && it.text || '').trim();
    if (t) {
      n += 1;
      out.push(`${n}. ${t}`);
    }
  });
  return out.join('\n');
}

Page({
  data: {
    id: '',
    title: '',
    imagePath: '',
    intro: '',
    materials: '',
    matGroups: [{ name: '', rows: [{ name: '', amount: '' }] }],
    stepItems: [{ text: '', imagePath: '' }],
    steps: '',
    tips: '',
    body: '',
    category: '美食',
    isFood: true,
    isBeauty: false,
    isLearn: false,
    isNew: true,
    tags: [],
    tagOptions: buildTagOptions([]),
    mealDate: '',
    mealType: '',
    mealLabel: '',
  },

  onLoad(query) {
    const mealDate = (query.date || '').trim();
    const mealType = (query.type || '').trim();
    if (query.id) {
      const note = normalizeNote(repo.getNote(query.id));
      if (note) {
        this.applyCategory(note.category);
        const tags = note.tags || [];
        const stepItems = Array.isArray(note.stepItems) && note.stepItems.length
          ? note.stepItems.map((it) => ({ text: it.text || '', imagePath: it.imagePath || '' }))
          : parseSteps(note.steps);
        this.setData({
          id: note.id,
          title: note.title,
          imagePath: note.imagePath || '',
          intro: note.intro || '',
          materials: note.materials || '',
          matGroups: parseMaterials(note.materials),
          stepItems,
          steps: note.steps || '',
          tips: note.tips || '',
          body: note.body || '',
          category: note.category,
          tags,
          tagOptions: buildTagOptionsFor(note.category, tags),
          isNew: false,
          mealDate,
          mealType,
          mealLabel: this.mealLabel(mealDate, mealType),
        });
        wx.setNavigationBarTitle({ title: '编辑' });
        return;
      }
    }
    const category = query.category ? decodeURIComponent(query.category) : '美食';
    const safe = CATEGORIES.includes(category) ? category : '美食';
    this.applyCategory(safe);
    this.setData({
      category: safe,
      isNew: true,
      tags: [],
      tagOptions: buildTagOptionsFor(safe, []),
      mealDate,
      mealType,
      mealLabel: this.mealLabel(mealDate, mealType),
    });
    wx.setNavigationBarTitle({ title: `新建${safe}` });
  },

  mealLabel(date, type) {
    if (!date || !type) return '';
    const { MEAL_TYPE_LABEL } = require('../../services/repository');
    return `${date} · ${MEAL_TYPE_LABEL[type] || type}`;
  },

  applyCategory(category) {
    this.setData({
      isFood: category === '美食',
      isBeauty: category === '美容',
      isLearn: category === '学习',
    });
  },

  onTitle(e) { this.setData({ title: e.detail.value }); },
  onIntro(e) { this.setData({ intro: e.detail.value }); },
  onTips(e) { this.setData({ tips: e.detail.value }); },
  onBody(e) { this.setData({ body: e.detail.value }); },

  onToggleTag(e) {
    const name = e.currentTarget.dataset.name;
    const tagList = getTagListFor(this.data.category);
    const set = new Set(this.data.tags);
    if (set.has(name)) set.delete(name);
    else set.add(name);
    const tags = tagList.filter((t) => set.has(t));
    this.setData({ tags, tagOptions: buildTagOptionsFor(this.data.category, tags) });
  },

  _syncMat() {
    this.setData({ materials: serializeMaterials(this.data.matGroups) });
  },

  onMatGroupName(e) {
    const g = e.currentTarget.dataset.g;
    const key = `matGroups[${g}].name`;
    this.setData({ [key]: e.detail.value });
    this._syncMat();
  },

  onMatName(e) {
    const { g, r } = e.currentTarget.dataset;
    const key = `matGroups[${g}].rows[${r}].name`;
    this.setData({ [key]: e.detail.value });
    this._syncMat();
  },

  onMatAmount(e) {
    const { g, r } = e.currentTarget.dataset;
    const key = `matGroups[${g}].rows[${r}].amount`;
    this.setData({ [key]: e.detail.value });
    this._syncMat();
  },

  onAddMatRow(e) {
    const g = e.currentTarget.dataset.g;
    const rows = this.data.matGroups[g].rows.concat({ name: '', amount: '' });
    this.setData({ [`matGroups[${g}].rows`]: rows });
  },

  onDelMatRow(e) {
    const { g, r } = e.currentTarget.dataset;
    const rows = this.data.matGroups[g].rows.filter((_, i) => i !== r);
    const final = rows.length ? rows : [{ name: '', amount: '' }];
    this.setData({ [`matGroups[${g}].rows`]: final });
    this._syncMat();
  },

  onAddMatGroup() {
    const groups = this.data.matGroups.concat({ name: '', rows: [{ name: '', amount: '' }] });
    this.setData({ matGroups: groups });
  },

  onDelMatGroup(e) {
    const g = e.currentTarget.dataset.g;
    const groups = this.data.matGroups.filter((_, i) => i !== g);
    const final = groups.length ? groups : [{ name: '', rows: [{ name: '', amount: '' }] }];
    this.setData({ matGroups: final });
    this._syncMat();
  },

  onAddStep() {
    const items = this.data.stepItems.concat({ text: '', imagePath: '' });
    this.setData({ stepItems: items });
  },

  onDelStep(e) {
    const idx = e.currentTarget.dataset.idx;
    let items = this.data.stepItems.filter((_, i) => i !== idx);
    if (!items.length) items = [{ text: '', imagePath: '' }];
    this.setData({ stepItems: items });
  },

  onStepText(e) {
    const idx = e.currentTarget.dataset.idx;
    const key = `stepItems[${idx}].text`;
    this.setData({ [key]: e.detail.value });
  },

  onChooseStepImage(e) {
    const idx = e.currentTarget.dataset.idx;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempPath = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath;
        if (!tempPath) return;
        wx.showLoading({ title: '保存中', mask: true });
        wx.getFileSystemManager().saveFile({
          tempFilePath: tempPath,
          success: (r) => {
            wx.hideLoading();
            const key = `stepItems[${idx}].imagePath`;
            this.setData({ [key]: r.savedFilePath });
          },
          fail: () => {
            wx.hideLoading();
            const key = `stepItems[${idx}].imagePath`;
            this.setData({ [key]: tempPath });
          },
        });
      },
    });
  },

  onDelStepImage(e) {
    const idx = e.currentTarget.dataset.idx;
    const key = `stepItems[${idx}].imagePath`;
    this.setData({ [key]: '' });
  },

  onPreviewStepImage(e) {
    const idx = e.currentTarget.dataset.idx;
    const urls = (this.data.stepItems || []).map((it) => it.imagePath).filter(Boolean);
    const current = (this.data.stepItems[idx] || {}).imagePath;
    if (!current) return;
    wx.previewImage({ urls, current });
  },

  onChooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempPath = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath;
        if (!tempPath) return;
        wx.showLoading({ title: '保存中', mask: true });
        wx.getFileSystemManager().saveFile({
          tempFilePath: tempPath,
          success: (r) => {
            wx.hideLoading();
            this.setData({ imagePath: r.savedFilePath });
          },
          fail: () => {
            wx.hideLoading();
            this.setData({ imagePath: tempPath });
          },
        });
      },
    });
  },

  onRemoveImage() {
    this.setData({ imagePath: '' });
  },

  onSave() {
    const { id, title, imagePath, intro, stepItems, tips, body, category, isLearn, tags, mealDate, mealType } = this.data;
    const materials = serializeMaterials(this.data.matGroups);
    const steps = serializeSteps(stepItems);
    const cleanStepItems = (stepItems || [])
      .map((it) => ({ text: (it.text || '').trim(), imagePath: it.imagePath || '' }))
      .filter((it) => it.text || it.imagePath);

    let finalTitle = (title || '').trim();
    if (isLearn && !finalTitle) finalTitle = '句子';

    // Build eatenAt: keep prev, add the new entry if this is from meal-day
    let prevEatenAt = [];
    if (id) {
      const prev = normalizeNote(repo.getNote(id));
      prevEatenAt = prev && Array.isArray(prev.eatenAt) ? prev.eatenAt : [];
    }
    let eatenAt = prevEatenAt;
    if (mealDate && mealType && category === '美食') {
      const exists = prevEatenAt.some((e) => e && e.date === mealDate && e.type === mealType);
      if (!exists) {
        eatenAt = prevEatenAt.concat([{ date: mealDate, type: mealType }]);
      }
    }

    const payload = {
      id: id || undefined,
      title: finalTitle,
      category,
      imagePath: isLearn ? '' : imagePath,
      intro: isLearn ? '' : intro,
      materials: isLearn ? '' : materials,
      steps: isLearn ? '' : steps,
      stepItems: isLearn ? [] : cleanStepItems,
      tips: isLearn ? '' : tips,
      tags: tags,
      body: isLearn ? body : composeBody({ materials, steps, tips, intro }),
      eatenAt,
    };

    const result = repo.saveNote(payload);
    if (!result.ok) {
      wx.showToast({ title: result.error || '保存失败', icon: 'none' });
      return;
    }
    wx.showToast({ title: '已保存', icon: 'success' });
    setTimeout(() => {
      if (this.data.isNew) {
        wx.redirectTo({ url: `/pages/note-detail/note-detail?id=${result.note.id}` });
      } else {
        wx.navigateBack();
      }
    }, 400);
  },
});
