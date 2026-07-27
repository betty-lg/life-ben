/**
 * Date helpers for check-in periods (device local time).
 * Week boundary: Monday–Sunday.
 */

function pad(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

/** @param {Date} [d] @returns {string} YYYY-MM-DD */
function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Monday 00:00 local of the week containing d */
function startOfWeek(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay(); // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfWeek(d = new Date()) {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}

/** @param {string} key YYYY-MM-DD */
function parseDayKey(key) {
  const [y, m, day] = key.split('-').map(Number);
  return new Date(y, m - 1, day);
}

function isSameWeek(aKey, bKey) {
  const a = startOfWeek(parseDayKey(aKey)).getTime();
  const b = startOfWeek(parseDayKey(bKey)).getTime();
  return a === b;
}

function addDays(key, n) {
  const d = parseDayKey(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** Inclusive list of day keys from start to end */
function eachDay(startKey, endKey) {
  const out = [];
  let cur = startKey;
  while (cur <= endKey) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

module.exports = {
  dayKey,
  startOfWeek,
  endOfWeek,
  parseDayKey,
  isSameWeek,
  addDays,
  eachDay,
};
