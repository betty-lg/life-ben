const repo = require('../../services/repository');
const engine = require('../../domain/checkin/engine');
const { dayKey } = require('../../utils/date');

Page({
  data: {
    active: [],
    ended: [],
    localOnlyHint: true,
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const list = repo.listCheckins();
    const { active, ended } = engine.partitionByStatus(list);
    const today = dayKey();
    this.setData({
      active: active.map((c) => this.decorate(c, today)),
      ended: ended.map((c) => this.decorate(c, today)),
    });
  },

  decorate(c, today) {
    const done = engine.progressCount(c, today);
    const pct = Math.min(100, Math.round((done / Math.max(c.target, 1)) * 100));
    return {
      ...c,
      progressText: engine.progressText(c, today),
      pending: engine.isPendingToday(c, today),
      todayDone: (c.completions || []).includes(today),
      pct,
      recent: (c.completions || []).slice(-3).join('、'),
    };
  },

  onComplete(e) {
    const id = e.currentTarget.dataset.id;
    this._mutate(id, (c) => engine.recordCompletion(c, dayKey()));
  },

  onMakeup(e) {
    const id = e.currentTarget.dataset.id;
    const c = repo.listCheckins().find((x) => x.id === id);
    if (!c) return;
    const days = engine.eligibleMakeupDays(c, dayKey());
    if (!days.length) {
      wx.showToast({ title: '没有可补的日期', icon: 'none' });
      return;
    }
    wx.showActionSheet({
      itemList: days.map((d) => `补卡 ${d}`),
      success: (res) => {
        const day = days[res.tapIndex];
        this._mutate(id, (cur) => engine.recordCompletion(cur, day));
      },
    });
  },

  onStop(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '结束打卡？',
      content: '将移到「已结束」，笔记还在「记录」里。',
      success: (res) => {
        if (!res.confirm) return;
        this._mutate(id, (c) => ({
          checkin: engine.stopCheckin(c, dayKey()),
          signal: 'stopped',
        }));
      },
    });
  },

  onResume(e) {
    const id = e.currentTarget.dataset.id;
    const list = repo.listCheckins();
    const ended = list.find((x) => x.id === id);
    if (!ended) return;
    if (engine.hasActiveForNote(list, ended.noteId)) {
      wx.showToast({ title: '该笔记已有进行中的打卡', icon: 'none' });
      return;
    }
    const next = engine.resumeCheckin(ended, dayKey());
    const result = repo.upsertCheckin(next);
    if (!result.ok) {
      wx.showToast({ title: '保存失败', icon: 'none' });
      return;
    }
    wx.showToast({ title: '已继续打卡', icon: 'success' });
    this.refresh();
  },

  _mutate(id, fn) {
    const list = repo.listCheckins();
    const cur = list.find((x) => x.id === id);
    if (!cur) return;
    const out = fn(cur);
    const next = out.checkin;
    const signal = out.signal;
    const result = repo.upsertCheckin(next);
    if (!result.ok) {
      wx.showToast({ title: '保存失败（可能存储已满）', icon: 'none' });
      return;
    }

    if (signal === 'askContinue') {
      wx.showModal({
        title: '本周期已完成',
        content: `「${next.label}」已达到 ${engine.progressText(next)}。要不要继续坚持？`,
        confirmText: '继续坚持',
        cancelText: '先停一停',
        success: (res) => {
          let final;
          if (res.confirm) {
            final = engine.applyContinue(next, dayKey());
            wx.showToast({ title: '已开启下一周期', icon: 'success' });
          } else {
            final = engine.stopCheckin(next, dayKey());
            wx.showToast({ title: '已移到已结束', icon: 'none' });
          }
          repo.upsertCheckin(final);
          this.refresh();
        },
      });
      return;
    }

    if (signal === 'autoRenewed') {
      wx.showToast({ title: '已自动进入下一周期', icon: 'success' });
    } else if (signal === 'alreadyDone') {
      wx.showToast({ title: out.message || '今日已打', icon: 'none' });
    } else if (signal === 'ok') {
      wx.showToast({ title: '已打卡', icon: 'success' });
    } else if (signal === 'stopped') {
      wx.showToast({ title: '已结束', icon: 'none' });
    } else if (out.message) {
      wx.showToast({ title: out.message, icon: 'none' });
    }
    this.refresh();
  },
});
