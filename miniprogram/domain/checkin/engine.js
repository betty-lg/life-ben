const {
  dayKey,
  startOfWeek,
  endOfWeek,
  isSameWeek,
  eachDay,
  parseDayKey,
  addDays,
  formatCnMd,
} = require('../../utils/date');

function clone(c) {
  return {
    ...c,
    completions: [...(c.completions || [])],
    archivedCompletions: [...(c.archivedCompletions || [])],
  };
}

function collectDays(checkin, into) {
  (checkin.completions || []).forEach((d) => {
    if (d) into.add(d);
  });
  (checkin.archivedCompletions || []).forEach((d) => {
    if (d) into.add(d);
  });
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
 * 当前连续打卡天数(从 today 往前数,今天没打不算断)。
 * 仅对 streak 类型有意义;weekly 类型返回 0。
 */
function currentStreak(checkin, todayKey = dayKey()) {
  if (!checkin || checkin.goalType !== 'streak') return 0;
  const set = new Set(checkin.completions || []);
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = addDays(todayKey, -i);
    if (set.has(d)) {
      streak += 1;
    } else if (i === 0) {
      // 今天还没打,不算断,继续看昨天
      continue;
    } else {
      break;
    }
  }
  return streak;
}

/** 历史最长连续天数(遍历 completions 找最长段)。仅对 streak 类型有意义。 */
function longestStreak(checkin) {
  if (!checkin || checkin.goalType !== 'streak') return 0;
  const days = (checkin.completions || []).slice().sort();
  if (!days.length) return 0;
  let max = 1;
  let cur = 1;
  for (let i = 1; i < days.length; i++) {
    if (days[i] === addDays(days[i - 1], 1)) {
      cur += 1;
      if (cur > max) max = cur;
    } else {
      cur = 1;
    }
  }
  return max;
}

/**
 * 按 noteId 汇总该事项全部打卡日(进行中、已结束、续期归档,去重)。
 * 连续天数和周频次都算,每个事项单独一条。
 * @returns {Map<string, { startDate: string|null, totalDays: number }>}
 */
function summarizeByNote(checkins) {
  const map = new Map();
  (checkins || []).forEach((c) => {
    if (!c || !c.noteId) return;
    if (!map.has(c.noteId)) {
      map.set(c.noteId, { days: new Set() });
    }
    collectDays(c, map.get(c.noteId).days);
  });
  const out = new Map();
  map.forEach((entry, noteId) => {
    if (!entry.days.size) {
      out.set(noteId, { startDate: null, totalDays: 0 });
    } else {
      const sorted = Array.from(entry.days).sort();
      out.set(noteId, { startDate: sorted[0], totalDays: entry.days.size });
    }
  });
  return out;
}

/** 「从10月16日开始，累计打卡5天」。没有打卡记录时返回空字符串。 */
function cumulativeText(entry, refDate = new Date()) {
  if (!entry || !entry.totalDays || !entry.startDate) return '';
  const label = formatCnMd(entry.startDate, refDate);
  if (!label) return '';
  return '从' + label + '开始，累计打卡' + entry.totalDays + '天';
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
  const archived = new Set(c.archivedCompletions || []);
  (c.completions || []).forEach((d) => {
    if (d) archived.add(d);
  });
  c.archivedCompletions = Array.from(archived).sort();
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
    id: overrides.id || base.id,
    noteId: base.noteId,
    label: base.label,
    goalType: overrides.goalType || base.goalType,
    target: overrides.target != null ? overrides.target : base.target,
    longTerm: overrides.longTerm != null ? overrides.longTerm : base.longTerm,
    status: 'active',
    completions: [...(base.completions || [])],
    archivedCompletions: [...(base.archivedCompletions || [])],
    cycleStart: base.cycleStart || todayKey,
  };
}

/**
 * 旧的「继续打卡」会把未完成的天数挪进归档并清零。
 * 本周期还没达标时，把这些天数放回当前进度。
 */
function restoreUnfinishedCycle(checkin) {
  const c = clone(checkin);
  const completions = [...(c.completions || [])];
  const archived = [...(c.archivedCompletions || [])].filter(Boolean);
  if (completions.length > 0 || !archived.length) return c;
  if (archived.length >= Number(c.target)) return c;
  c.completions = Array.from(new Set(archived)).sort();
  c.archivedCompletions = [];
  if (!c.cycleStart || c.cycleStart > c.completions[0]) c.cycleStart = c.completions[0];
  return c;
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
  currentStreak,
  longestStreak,
  summarizeByNote,
  cumulativeText,
  eligibleMakeupDays,
  recordCompletion,
  renewCycle,
  applyContinue,
  stopCheckin,
  resumeCheckin,
  restoreUnfinishedCycle,
  createCheckin,
  partitionByStatus,
  hasActiveForNote,
};
