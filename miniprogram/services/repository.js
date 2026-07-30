const STORAGE_KEY = 'life_ben_v1';
const VERSION = 1;
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'];
const MEAL_TYPE_LABEL = { breakfast: '早餐', lunch: '中餐', dinner: '晚餐' };

function emptyDoc() {
  return { version: VERSION, notes: [], checkins: [] };
}

function load() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    if (!raw || typeof raw !== 'object') return emptyDoc();
    return {
      version: raw.version || VERSION,
      notes: Array.isArray(raw.notes) ? raw.notes : [],
      checkins: Array.isArray(raw.checkins) ? raw.checkins : [],
      expenses: Array.isArray(raw.expenses) ? raw.expenses : [],
      categories: Array.isArray(raw.categories) ? raw.categories : [],
    };
  } catch (e) {
    return emptyDoc();
  }
}

function save(doc) {
  const payload = {
    version: VERSION,
    notes: doc.notes || [],
    checkins: doc.checkins || [],
    expenses: doc.expenses || [],
    categories: doc.categories || [],
  };
  try {
    wx.setStorageSync(STORAGE_KEY, payload);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e };
  }
}

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

function listNotes(category) {
  const doc = load();
  const notes = doc.notes.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (!category) return notes;
  return notes.filter((n) => n.category === category);
}

function getNote(id) {
  return load().notes.find((n) => n.id === id) || null;
}

function saveNote(note) {
  const { composeBody } = require('../domain/notes/fields');
  const doc = load();
  const now = Date.now();
  const idx = doc.notes.findIndex((n) => n.id === note.id);
  const materials = note.materials || '';
  const steps = note.steps || '';
  const tips = note.tips || '';
  const intro = note.intro || '';
  const body =
    note.body != null && note.body !== ''
      ? note.body
      : composeBody({ materials, steps, tips, intro });
  const row = {
    id: note.id || uid('n'),
    title: (note.title || '').trim(),
    body,
    intro,
    materials,
    steps,
    tips,
    imagePath: note.imagePath || '',
    reviews: Array.isArray(note.reviews) ? note.reviews : [],
    eatenAt: Array.isArray(note.eatenAt)
      ? note.eatenAt.filter(
          (e) => e && typeof e.date === 'string' && MEAL_TYPES.includes(e.type)
        )
      : [],
    tags: Array.isArray(note.tags) ? note.tags.filter(Boolean) : [],
    category: note.category,
    createdAt: note.createdAt || now,
    updatedAt: now,
  };
  if (!row.title) return { ok: false, error: '名称不能为空' };
  if (idx >= 0) {
    const prev = doc.notes[idx];
    doc.notes[idx] = {
      ...prev,
      ...row,
      id: prev.id,
      createdAt: prev.createdAt || now,
      reviews: row.reviews.length ? row.reviews : prev.reviews || [],
      eatenAt: note.eatenAt != null ? row.eatenAt : prev.eatenAt || [],
      tags: note.tags != null ? row.tags : prev.tags || [],
    };
  } else {
    doc.notes.push(row);
  }
  const result = save(doc);
  if (!result.ok) return result;
  return { ok: true, note: getNote(row.id) };
}

function searchNotes(category, keyword, tag) {
  const q = String(keyword || '')
    .trim()
    .toLowerCase();
  const t = String(tag || '').trim();
  let list = listNotes(category);
  if (t) {
    list = list.filter((n) => {
      const tags = Array.isArray(n.tags) ? n.tags : [];
      if (tags.includes(t)) return true;
      const blob = [n.title, n.intro, n.materials, n.steps, n.tips, n.body].join('\n');
      return blob.includes(t);
    });
  }
  if (!q) return list;
  return list.filter((n) => {
    const blob = [n.title, n.intro, n.materials, n.steps, n.tips, n.body, ...(n.tags || [])]
      .join('\n')
      .toLowerCase();
    return blob.includes(q);
  });
}

function deleteNote(id) {
  const doc = load();
  doc.notes = doc.notes.filter((n) => n.id !== id);
  // End any active check-in for this note
  doc.checkins = doc.checkins.map((c) => {
    if (c.noteId === id && c.status === 'active') {
      return { ...c, status: 'ended', endedAt: require('../utils/date').dayKey() };
    }
    return c;
  });
  return save(doc);
}

function listCheckins() {
  return load().checkins.slice();
}

function upsertCheckin(checkin) {
  const doc = load();
  const idx = doc.checkins.findIndex((c) => c.id === checkin.id);
  if (idx >= 0) doc.checkins[idx] = checkin;
  else doc.checkins.push(checkin);
  const result = save(doc);
  if (!result.ok) return result;
  return { ok: true, checkin };
}

function replaceCheckins(checkins) {
  const doc = load();
  doc.checkins = checkins;
  return save(doc);
}

/**
 * Find all meal entries (note + mealType) for a given date string (YYYY-MM-DD).
 * Returns: { breakfast: [note, ...], lunch: [note, ...], dinner: [note, ...] }
 */
function findMealsForDate(date) {
  const out = { breakfast: [], lunch: [], dinner: [] };
  if (!date) return out;
  const notes = load().notes;
  for (const n of notes) {
    const eatenAt = Array.isArray(n.eatenAt) ? n.eatenAt : [];
    for (const e of eatenAt) {
      if (e && e.date === date && MEAL_TYPES.includes(e.type)) {
        out[e.type].push(n);
      }
    }
  }
  return out;
}

/**
 * For a given month string (YYYY-MM), return date strings that have at least one meal.
 */
function datesWithMealsInMonth(monthKey) {
  const set = new Set();
  if (!monthKey) return [];
  const notes = load().notes;
  for (const n of notes) {
    const eatenAt = Array.isArray(n.eatenAt) ? n.eatenAt : [];
    for (const e of eatenAt) {
      if (e && typeof e.date === 'string' && e.date.startsWith(monthKey)) {
        set.add(e.date);
      }
    }
  }
  return Array.from(set).sort();
}

/**
 * Expenses helpers — expenses live inside life_ben_v1 (alongside notes/checkins)
 * so that the whole app's data is in one doc.
 */
function getExpenses() {
  const doc = load();
  return Array.isArray(doc.expenses) ? doc.expenses : [];
}

function setExpenses(list) {
  const doc = load();
  doc.expenses = Array.isArray(list) ? list : [];
  const result = save(doc);
  if (!result.ok) return result;
  return { ok: true, expenses: doc.expenses };
}

function addExpense(expense) {
  const list = getExpenses();
  list.push(expense);
  return setExpenses(list);
}

function deleteExpense(predicate) {
  const list = getExpenses();
  const filtered = list.filter((e) => !predicate(e));
  return setExpenses(filtered);
}

function clearExpenses() {
  return setExpenses([]);
}

/**
 * One-time migration: if old standalone 'expenses' or 'categories' keys exist in storage
 * but life_ben_v1 doesn't have them yet, fold them in.
 */
function migrateLegacyStorage() {
  try {
    const legacyExpenses = wx.getStorageSync('expenses');
    const legacyCategories = wx.getStorageSync('categories');
    const doc = load();
    let changed = false;
    const expensesEmpty = !Array.isArray(doc.expenses) || doc.expenses.length === 0;
    const categoriesEmpty = !Array.isArray(doc.categories) || doc.categories.length === 0;
    if (Array.isArray(legacyExpenses) && legacyExpenses.length && expensesEmpty) {
      doc.expenses = legacyExpenses;
      changed = true;
    }
    if (Array.isArray(legacyCategories) && legacyCategories.length && categoriesEmpty) {
      doc.categories = legacyCategories;
      changed = true;
    }
    if (changed) save(doc);
  } catch (e) {
    // ignore
  }
}

function seedIfEmpty() {
  const doc = load();
  if (doc.notes.length > 0) return { seeded: false };
  const { composeBody } = require('../domain/notes/fields');
  const now = Date.now();
  const mk = (partial) => {
    const materials = partial.materials || '';
    const steps = partial.steps || '';
    const tips = partial.tips || '';
    const intro = partial.intro || '';
    const body =
      partial.body != null
        ? partial.body
        : composeBody({ materials, steps, tips, intro });
    return {
      imagePath: '',
      reviews: [],
      intro,
      materials,
      steps,
      tips,
      body,
      ...partial,
      tags: Array.isArray(partial.tags) ? partial.tags : [],
      createdAt: now,
      updatedAt: now,
    };
  };
  const notes = [
    mk({
      id: 'n_seed_wuhong',
      category: '美食',
      title: '五红汤',
      intro: '温和补气养血的日常汤饮，适合早晨空腹一小碗。',
      tags: ['甜汤', '拿手菜'],
      materials: '红豆  30g\n红枣  6 颗\n枸杞  一小把\n花生衣  适量\n红糖  适量',
      steps:
        '1. 红豆提前浸泡 2–4 小时。\n2. 加水煮开后转小火，煮至红豆软烂。\n3. 放入红枣、花生衣再煮 10 分钟。\n4. 出锅前加枸杞与红糖，再焖 2 分钟。\n5. 早晨空腹温热喝一小碗。',
      tips: '根据自己身体情况调整频次；经期或特殊体质请遵医嘱。',
    }),
    mk({
      id: 'n_seed_egg',
      category: '美食',
      title: '番茄炒蛋',
      intro: '家常快手菜，酸甜开胃。',
      tags: ['家常菜'],
      materials: '番茄  2 个\n鸡蛋  3 个\n盐  适量\n糖  少许',
      steps:
        '1. 鸡蛋打散，热油滑炒盛出。\n2. 番茄切块下锅炒出汁。\n3. 倒回鸡蛋，加盐和少许糖，快速翻匀出锅。',
      tips: '番茄先出汁再合蛋，口感更好。',
    }),
    mk({
      id: 'n_seed_mask',
      category: '美容',
      title: '面膜',
      intro: '晚间基础补水护理。',
      materials: '常用面膜  1 片',
      steps:
        '1. 洁面后用温水敷脸 1 分钟。\n2. 敷面膜 15 分钟，避开眼周。\n3. 取下后用清水轻拍至吸收，再上夜间保湿。',
      tips: '建议晚上做；敏感期减频。',
    }),
    mk({
      id: 'n_seed_quote1',
      category: '学习',
      title: '句子',
      tags: ['口才'],
      body: '世界上只有一种真正的英雄主义，那就是在认清生活的真相后依然热爱生活。\n——罗曼·罗兰',
    }),
    mk({
      id: 'n_seed_quote2',
      category: '学习',
      title: '句子',
      tags: ['Idea'],
      body: '我们读过的书，终将内化成眼里的光，骨子里的从容，以及谈吐间的气质。',
    }),
  ];
  // Preserve any existing fields (e.g. migrated expenses / categories)
  save({ ...doc, version: VERSION, notes });
  return { seeded: true };
}

module.exports = {
  STORAGE_KEY,
  MEAL_TYPES,
  MEAL_TYPE_LABEL,
  load,
  save,
  listNotes,
  searchNotes,
  getNote,
  saveNote,
  deleteNote,
  listCheckins,
  upsertCheckin,
  replaceCheckins,
  findMealsForDate,
  datesWithMealsInMonth,
  getExpenses,
  setExpenses,
  addExpense,
  deleteExpense,
  clearExpenses,
  migrateLegacyStorage,
  seedIfEmpty,
  uid,
};
