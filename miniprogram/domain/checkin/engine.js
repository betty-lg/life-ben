const {
  dayKey,
  startOfWeek,
  endOfWeek,
  isSameWeek,
  eachDay,
  parseDayKey,
} = require('../../utils/date');

function clone(c) {
  return {
    ...c,
    completions: [...(c.completions || [])],
  };
}

function progressCount(checkin, todayKey = dayKey()) {
  if (checkin.goalType === 'weekly') {
    return (checkin.completions || []).filter((k) => isSameWeek(k, todayKey)).length;
  }
  return (checkin.completions || []).length;
}

function progressText(checkin, todayKey = dayKey()) {
  const done = progressCount(checkin, todayKey);
  if (checkin.goalType === 'weekly') {
    return `${done} / 一周${checkin.target}次`;
  }
  return `${done} / ${checkin.target}`;
}

function isPendingToday(checkin, todayKey = dayKey()) {
  if (checkin.status !== 'active') return false;
  if ((checkin.completions || []).includes(todayKey)) return false;
  return progressCount(checkin, todayKey) < checkin.target;
}

function isTargetMet(checkin, todayKey = dayKey()) {
  return progressCount(checkin, todayKey) >= checkin.target;
}

function yesterdayKey(todayKey) {
  const d = parseDayKey(todayKey);
  d.setDate(d.getDate() - 1);
  return dayKey(d);
}

/**
 * Eligible makeup days: from cycleStart through yesterday, not yet completed.
 * Weekly: only days in the current natural week.
 */
function eligibleMakeupDays(checkin, todayKey = dayKey()) {
  if (checkin.status !== 'active') return [];
  const yesterday = yesterdayKey(todayKey);
  let start = checkin.cycleStart || todayKey;
  let end = yesterday;
  if (end < start) return [];

  if (checkin.goalType === 'weekly') {
    const weekStart = dayKey(startOfWeek(parseDayKey(todayKey)));
    const weekEndKey = dayKey(endOfWeek(parseDayKey(todayKey)));
    if (start < weekStart) start = weekStart;
    if (end > weekEndKey) end = weekEndKey;
    if (end > yesterday) end = yesterday;
  }

  if (end < start) return [];
  const done = new Set(checkin.completions || []);
  return eachDay(start, end).filter((k) => !done.has(k));
}

/**
 * @returns {{ checkin: object, signal: string, message?: string }}
 */
function recordCompletion(checkin, day = dayKey()) {
  const c = clone(checkin);
  if (c.status !== 'active') {
    return { checkin: c, signal: 'notActive', message: '打卡已结束' };
  }
  if ((c.completions || []).includes(day)) {
    return { checkin: c, signal: 'alreadyDone', message: '这一天已经打过卡' };
  }
  // For weekly, evaluate met against "today" week; for continuous against cycle count.
  const viewDay = dayKey();
  if (isTargetMet(c, viewDay)) {
    return { checkin: c, signal: 'targetReached', message: '本周期已完成' };
  }

  c.completions = [...(c.completions || []), day].sort();

  if (!isTargetMet(c, viewDay)) {
    return { checkin: c, signal: 'ok' };
  }

  if (c.longTerm) {
    return {
      checkin: renewCycle(c, viewDay),
      signal: 'autoRenewed',
      message: '已自动进入下一周期',
    };
  }
  return { checkin: c, signal: 'askContinue', message: '本周期已完成' };
}

function renewCycle(checkin, todayKey = dayKey()) {
  const c = clone(checkin);
  c.completions = [];
  c.cycleStart = todayKey;
  c.status = 'active';
  delete c.endedAt;
  return c;
}

function applyContinue(checkin, todayKey = dayKey()) {
  return renewCycle(checkin, todayKey);
}

function stopCheckin(checkin, todayKey = dayKey()) {
  const c = clone(checkin);
  c.status = 'ended';
  c.endedAt = todayKey;
  return c;
}

function resumeCheckin(endedCheckin, todayKey = dayKey(), overrides = {}) {
  const base = endedCheckin;
  return {
    id: overrides.id || `c_${Date.now()}`,
    noteId: base.noteId,
    label: base.label,
    goalType: overrides.goalType || base.goalType,
    target: overrides.target != null ? overrides.target : base.target,
    longTerm: overrides.longTerm != null ? overrides.longTerm : base.longTerm,
    status: 'active',
    completions: [],
    cycleStart: todayKey,
  };
}

function createCheckin({
  id,
  noteId,
  label,
  goalType,
  target,
  longTerm,
  todayKey = dayKey(),
}) {
  return {
    id: id || `c_${Date.now()}`,
    noteId,
    label,
    goalType,
    target: Number(target),
    longTerm: !!longTerm,
    status: 'active',
    completions: [],
    cycleStart: todayKey,
  };
}

function partitionByStatus(list) {
  const active = [];
  const ended = [];
  for (const c of list || []) {
    if (c.status === 'active') active.push(c);
    else if (c.status === 'ended') ended.push(c);
  }
  return { active, ended };
}

function hasActiveForNote(list, noteId) {
  return (list || []).some((c) => c.noteId === noteId && c.status === 'active');
}

module.exports = {
  progressCount,
  progressText,
  isPendingToday,
  isTargetMet,
  eligibleMakeupDays,
  recordCompletion,
  renewCycle,
  applyContinue,
  stopCheckin,
  resumeCheckin,
  createCheckin,
  partitionByStatus,
  hasActiveForNote,
};
