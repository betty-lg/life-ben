/**
 * Compose legacy `body` from structured fields for fallback / learn content.
 */
function composeBody({ materials, steps, tips, intro, body }) {
  if (body && String(body).trim()) return String(body).trim();
  const parts = [];
  if ((intro || '').trim()) parts.push(`简介：\n${intro.trim()}`);
  if ((materials || '').trim()) parts.push(`材料：\n${materials.trim()}`);
  if ((steps || '').trim()) parts.push(`步骤：\n${steps.trim()}`);
  if ((tips || '').trim()) parts.push(`注意事项：\n${tips.trim()}`);
  return parts.join('\n\n');
}

function firstLine(text) {
  const s = String(text || '')
    .replace(/\r/g, '')
    .trim();
  if (!s) return '';
  return s.split('\n')[0].trim();
}

/**
 * Normalize note for UI by category.
 */
function normalizeNote(note) {
  if (!note) return null;
  const hasStructured =
    !!(note.materials && note.materials.trim()) ||
    !!(note.steps && note.steps.trim()) ||
    !!(note.tips && note.tips.trim()) ||
    !!(note.intro && note.intro.trim());

  const body = note.body || '';
  const intro = note.intro || '';

  return {
    ...note,
    imagePath: note.imagePath || '',
    intro,
    materials: hasStructured ? note.materials || '' : '',
    steps: hasStructured ? note.steps || '' : note.category === '学习' ? '' : body,
    tips: hasStructured ? note.tips || '' : '',
    body: note.category === '学习' ? body : body || composeBody(note),
    reviews: Array.isArray(note.reviews) ? note.reviews : [],
    eatenAt: Array.isArray(note.eatenAt) ? note.eatenAt : [],
    tags: Array.isArray(note.tags) ? note.tags.filter(Boolean) : [],
    summary:
      note.category === '学习'
        ? firstLine(body) || note.title || '（空）'
        : intro || firstLine(note.materials) || firstLine(body) || '',
  };
}

function previewText(note) {
  const n = normalizeNote(note);
  if (!n) return '';
  if (n.category === '学习') return n.summary;
  return (n.intro || n.summary || n.materials || n.steps || n.body || '').replace(/\n/g, ' ').slice(0, 48);
}

function parseMaterialGroups(raw) {
  const text = (raw || '').trim();
  if (!text) return [];
  const lines = text.split('\n');
  const groups = [];
  let cur = null;
  for (const line of lines) {
    const heading = line.match(/^【(.+?)】\s*$/);
    if (heading) {
      cur = { name: heading[1], items: [] };
      groups.push(cur);
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!cur) {
      cur = { name: '', items: [] };
      groups.push(cur);
    }
    const sep = trimmed.match(/^(.+?)\s{2,}(.+)$/) || trimmed.match(/^(.+?)\t+(.+)$/);
    if (sep) {
      cur.items.push({ mat: sep[1].trim(), amount: sep[2].trim() });
    } else {
      cur.items.push({ mat: trimmed, amount: '' });
    }
  }
  return groups;
}

module.exports = {
  composeBody,
  normalizeNote,
  previewText,
  firstLine,
  parseMaterialGroups,
};
