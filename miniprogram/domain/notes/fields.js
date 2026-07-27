/**
 * Compose legacy `body` from structured fields for list preview / fallback.
 */
function composeBody({ materials, steps, tips }) {
  const parts = [];
  if ((materials || '').trim()) parts.push(`材料：\n${materials.trim()}`);
  if ((steps || '').trim()) parts.push(`步骤：\n${steps.trim()}`);
  if ((tips || '').trim()) parts.push(`注意事项：\n${tips.trim()}`);
  return parts.join('\n\n');
}

/**
 * Normalize note for UI: prefer structured fields; fall back to body as steps.
 */
function normalizeNote(note) {
  if (!note) return null;
  const hasStructured =
    !!(note.materials && note.materials.trim()) ||
    !!(note.steps && note.steps.trim()) ||
    !!(note.tips && note.tips.trim());
  return {
    ...note,
    imagePath: note.imagePath || '',
    materials: hasStructured ? note.materials || '' : '',
    steps: hasStructured ? note.steps || '' : note.body || '',
    tips: hasStructured ? note.tips || '' : '',
    body: note.body || composeBody(note),
  };
}

function previewText(note) {
  const n = normalizeNote(note);
  const raw = (n.materials || n.steps || n.tips || n.body || '').replace(/\n/g, ' ');
  return raw.slice(0, 40);
}

module.exports = {
  composeBody,
  normalizeNote,
  previewText,
};
