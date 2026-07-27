/**
 * Check-in domain types (JSDoc only — no runtime deps).
 *
 * @typedef {'continuous'|'weekly'} GoalType
 * @typedef {'active'|'ended'} CheckinStatus
 *
 * @typedef {Object} Checkin
 * @property {string} id
 * @property {string} noteId
 * @property {string} label  分类·名称
 * @property {GoalType} goalType
 * @property {number} target
 * @property {boolean} longTerm
 * @property {CheckinStatus} status
 * @property {string[]} completions  day keys YYYY-MM-DD in current cycle
 * @property {string} cycleStart  day key when current cycle began
 * @property {string} [endedAt]
 */

module.exports = {};
