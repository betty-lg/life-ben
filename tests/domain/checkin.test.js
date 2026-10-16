const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../../miniprogram/domain/checkin/engine');

function base(overrides = {}) {
  return {
    id: 'c1',
    noteId: 'n1',
    label: '美食·五红汤',
    goalType: 'continuous',
    target: 14,
    longTerm: false,
    status: 'active',
    completions: [],
    cycleStart: '2026-07-01',
    ...overrides,
  };
}

describe('checkin engine', () => {
  it('AE1: continuous 14 not longTerm → askContinue; applyContinue resets', () => {
    let c = base({ target: 14, completions: Array.from({ length: 13 }, (_, i) => `2026-07-${String(i + 1).padStart(2, '0')}`) });
    const r = engine.recordCompletion(c, '2026-07-14');
    assert.equal(r.signal, 'askContinue');
    assert.equal(engine.progressCount(r.checkin, '2026-07-14'), 14);
    const next = engine.applyContinue(r.checkin, '2026-07-14');
    assert.equal(next.status, 'active');
    assert.equal(next.completions.length, 0);
    assert.equal(next.target, 14);
    assert.equal(next.cycleStart, '2026-07-14');
  });

  it('AE2: weekly 2 longTerm → autoRenewed, no ask', () => {
    const { dayKey } = require('../../miniprogram/utils/date');
    const today = dayKey();
    // Pick a completion day in the same week as today
    const { startOfWeek, addDays } = require('../../miniprogram/utils/date');
    const weekMon = dayKey(startOfWeek(new Date()));
    const first = weekMon;
    const second = addDays(weekMon, 1);
    let c = base({
      label: '美容·面膜',
      noteId: 'n3',
      goalType: 'weekly',
      target: 2,
      longTerm: true,
      cycleStart: weekMon,
      completions: [first],
    });
    const r = engine.recordCompletion(c, second);
    assert.equal(r.signal, 'autoRenewed');
    assert.equal(r.checkin.completions.length, 0);
    assert.equal(r.checkin.cycleStart, today);
    assert.equal(r.checkin.status, 'active');
  });

  it('AE3: decline continue → ended via stopCheckin', () => {
    const c = base({ completions: Array.from({ length: 14 }, (_, i) => `2026-07-${String(i + 1).padStart(2, '0')}`) });
    const ended = engine.stopCheckin(c, '2026-07-14');
    assert.equal(ended.status, 'ended');
    assert.equal(ended.noteId, 'n1');
    assert.equal(ended.endedAt, '2026-07-14');
  });

  it('AE4: makeup missed day increases count, no auto-fail', () => {
    const c = base({
      target: 14,
      cycleStart: '2026-07-01',
      completions: ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05', '2026-07-06', '2026-07-08'],
    });
    assert.equal(engine.progressCount(c), 7);
    const r = engine.recordCompletion(c, '2026-07-07');
    assert.equal(r.signal, 'ok');
    assert.equal(engine.progressCount(r.checkin), 8);
    assert.equal(r.checkin.status, 'active');
  });

  it('resume after today check-in keeps 1/14', () => {
    const ended = engine.stopCheckin(
      base({
        id: 'c-today',
        completions: ['2026-10-16'],
        cycleStart: '2026-10-01',
        target: 14,
      }),
      '2026-10-16'
    );
    const next = engine.resumeCheckin(ended, '2026-10-16');
    assert.equal(next.id, 'c-today');
    assert.equal(next.status, 'active');
    assert.equal(engine.progressCount(next, '2026-10-16'), 1);
    assert.equal(engine.progressText(next, '2026-10-16'), '1 / 14');
    assert.equal(ended.status, 'ended');
  });

  it('restore unfinished cycle parked by an older resume', () => {
    const parked = base({
      status: 'active',
      completions: [],
      archivedCompletions: ['2026-10-16'],
      cycleStart: '2026-10-16',
      target: 14,
    });
    const fixed = engine.restoreUnfinishedCycle(parked);
    assert.equal(engine.progressCount(fixed, '2026-10-16'), 1);
    assert.deepEqual(fixed.archivedCompletions, []);
    const finished = base({
      completions: [],
      archivedCompletions: Array.from({ length: 14 }, (_, i) => `2026-07-${String(i + 1).padStart(2, '0')}`),
      target: 14,
    });
    assert.equal(engine.restoreUnfinishedCycle(finished).completions.length, 0);
  });

  it('AE6: resume ended → new active; ended retained by caller', () => {
    const ended = engine.stopCheckin(
      base({ label: '美容·面膜', noteId: 'n3', goalType: 'weekly', target: 2, longTerm: true }),
      '2026-07-20'
    );
    const next = engine.resumeCheckin(ended, '2026-07-22', { id: 'c_new' });
    assert.equal(next.status, 'active');
    assert.equal(next.noteId, 'n3');
    assert.equal(next.target, 2);
    assert.equal(next.longTerm, true);
    assert.equal(next.completions.length, 0);
    assert.equal(ended.status, 'ended');
  });

  it('second tap same day → alreadyDone', () => {
    const c = base({ completions: ['2026-07-22'] });
    const r = engine.recordCompletion(c, '2026-07-22');
    assert.equal(r.signal, 'alreadyDone');
    assert.equal(r.checkin.completions.length, 1);
  });

  it('weekly prior week does not count toward current week', () => {
    const c = base({
      goalType: 'weekly',
      target: 2,
      // 2026-07-13 is Monday of prior week; 2026-07-22 is Wed current week
      completions: ['2026-07-13', '2026-07-14'],
      cycleStart: '2026-07-01',
    });
    assert.equal(engine.progressCount(c, '2026-07-22'), 0);
  });

  it('stopCheckin on longTerm active → ended', () => {
    const c = base({ longTerm: true, goalType: 'weekly', target: 2 });
    const ended = engine.stopCheckin(c, '2026-07-22');
    assert.equal(ended.status, 'ended');
  });

  it('hasActiveForNote / partitionByStatus', () => {
    const list = [
      base({ id: 'a', status: 'active' }),
      base({ id: 'b', noteId: 'n2', status: 'ended' }),
    ];
    assert.equal(engine.hasActiveForNote(list, 'n1'), true);
    assert.equal(engine.hasActiveForNote(list, 'n2'), false);
    const { active, ended } = engine.partitionByStatus(list);
    assert.equal(active.length, 1);
    assert.equal(ended.length, 1);
  });

  it('stop then resume keeps cumulative days per note', () => {
    const maskEnded = engine.stopCheckin(
      base({
        id: 'mask-old',
        noteId: 'mask',
        label: '美容·面膜',
        goalType: 'continuous',
        target: 14,
        completions: ['2026-08-01', '2026-08-02', '2026-08-03'],
      }),
      '2026-08-04'
    );
    const maskNext = engine.resumeCheckin(maskEnded, '2026-08-10', { id: 'mask-new' });
    maskNext.completions = ['2026-08-10', '2026-08-11'];

    const soup = base({
      id: 'soup',
      noteId: 'soup',
      label: '美食·五红汤',
      goalType: 'continuous',
      target: 14,
      completions: ['2026-07-02', '2026-07-03'],
    });

    const summary = engine.summarizeByNote([maskEnded, maskNext, soup]);
    const mask = summary.get('mask');
    const soupSum = summary.get('soup');
    assert.equal(mask.startDate, '2026-08-01');
    assert.equal(mask.totalDays, 5);
    assert.equal(soupSum.startDate, '2026-07-02');
    assert.equal(soupSum.totalDays, 2);
    assert.equal(
      engine.cumulativeText(mask, new Date(2026, 9, 16)),
      '从8月1日开始，累计打卡5天'
    );
    assert.equal(
      engine.cumulativeText(soupSum, new Date(2026, 9, 16)),
      '从7月2日开始，累计打卡2天'
    );
  });

  it('renewCycle keeps prior days for the cumulative count', () => {
    const done = base({
      completions: ['2026-07-01', '2026-07-02', '2026-07-03'],
    });
    const next = engine.applyContinue(done, '2026-07-04');
    next.completions = ['2026-07-05'];
    assert.equal(engine.progressCount(next, '2026-07-05'), 1);
    const summary = engine.summarizeByNote([next]);
    assert.equal(summary.get('n1').totalDays, 4);
    assert.equal(summary.get('n1').startDate, '2026-07-01');
  });

  it('same day across cycles counts once', () => {
    const ended = base({
      id: 'a',
      status: 'ended',
      completions: ['2026-07-01', '2026-07-02'],
    });
    const active = base({
      id: 'b',
      status: 'active',
      archivedCompletions: ['2026-07-01', '2026-07-02'],
      completions: ['2026-07-02', '2026-07-03'],
    });
    const summary = engine.summarizeByNote([ended, active]);
    assert.equal(summary.get('n1').totalDays, 3);
  });

  it('cumulativeText is empty before the first check-in', () => {
    const summary = engine.summarizeByNote([base()]);
    assert.equal(summary.get('n1').totalDays, 0);
    assert.equal(engine.cumulativeText(summary.get('n1')), '');
  });

  it('eligibleMakeupDays skips completed and today', () => {
    const c = base({
      cycleStart: '2026-07-20',
      completions: ['2026-07-20'],
    });
    const days = engine.eligibleMakeupDays(c, '2026-07-23');
    assert.ok(days.includes('2026-07-21'));
    assert.ok(days.includes('2026-07-22'));
    assert.ok(!days.includes('2026-07-20'));
    assert.ok(!days.includes('2026-07-23'));
  });
});
