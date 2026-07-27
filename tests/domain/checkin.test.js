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
