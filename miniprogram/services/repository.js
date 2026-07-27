const STORAGE_KEY = 'life_ben_v1';
const VERSION = 1;

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
  const body =
    note.body != null && note.body !== ''
      ? note.body
      : composeBody({ materials, steps, tips });
  const row = {
    id: note.id || uid('n'),
    title: (note.title || '').trim(),
    body,
    materials,
    steps,
    tips,
    imagePath: note.imagePath || '',
    category: note.category,
    createdAt: note.createdAt || now,
    updatedAt: now,
  };
  if (!row.title) return { ok: false, error: '标题不能为空' };
  if (idx >= 0) {
    const prev = doc.notes[idx];
    doc.notes[idx] = {
      ...prev,
      ...row,
      id: prev.id,
      createdAt: prev.createdAt || now,
    };
  } else {
    doc.notes.push(row);
  }
  const result = save(doc);
  if (!result.ok) return result;
  return { ok: true, note: getNote(row.id) };
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

function seedIfEmpty() {
  const doc = load();
  if (doc.notes.length > 0) return { seeded: false };
  const { composeBody } = require('../domain/notes/fields');
  const now = Date.now();
  const mk = (partial) => {
    const materials = partial.materials || '';
    const steps = partial.steps || '';
    const tips = partial.tips || '';
    return {
      ...partial,
      materials,
      steps,
      tips,
      imagePath: '',
      body: composeBody({ materials, steps, tips }),
      createdAt: now,
      updatedAt: now,
    };
  };
  const notes = [
    mk({
      id: 'n_seed_wuhong',
      category: '美食',
      title: '五红汤',
      materials: '红豆 30g、红枣 6 颗、枸杞一小把、花生衣适量、红糖适量',
      steps:
        '1. 红豆提前浸泡 2–4 小时。\n2. 加水煮开后转小火，煮至红豆软烂。\n3. 放入红枣、花生衣再煮 10 分钟。\n4. 出锅前加枸杞与红糖，再焖 2 分钟。\n5. 早晨空腹温热喝一小碗。',
      tips: '根据自己身体情况调整频次；经期或特殊体质请遵医嘱。',
    }),
    mk({
      id: 'n_seed_mask',
      category: '美容',
      title: '面膜',
      materials: '常用面膜 1 片',
      steps:
        '1. 洁面后用温水敷脸 1 分钟。\n2. 敷面膜 15 分钟，避开眼周。\n3. 取下后用清水轻拍至吸收，再上夜间保湿。',
      tips: '建议晚上做；敏感期减频。',
    }),
    mk({
      id: 'n_seed_egg',
      category: '美食',
      title: '番茄炒蛋',
      materials: '番茄 2 个、鸡蛋 3 个、盐、糖少许',
      steps:
        '1. 鸡蛋打散，热油滑炒盛出。\n2. 番茄切块下锅炒出汁。\n3. 倒回鸡蛋，加盐和少许糖，快速翻匀出锅。',
      tips: '番茄先出汁再合蛋，口感更好。',
    }),
  ];
  save({ version: VERSION, notes, checkins: [] });
  return { seeded: true };
}

module.exports = {
  STORAGE_KEY,
  load,
  save,
  listNotes,
  getNote,
  saveNote,
  deleteNote,
  listCheckins,
  upsertCheckin,
  replaceCheckins,
  seedIfEmpty,
  uid,
};
