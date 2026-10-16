const repo = require('../../services/repository');
const engine = require('../../domain/checkin/engine');
const { dayKey, parseDayKey, addDays } = require('../../utils/date');

const MEAL_TYPE_LABEL = { 美食: '美食', 美容: '美容', 学习: '学习' };

/** 把 dueDate 翻译成人话: 今天 / 明天 / 后天 / 周X / M月D日 / 过期 N 天
 *  都附上具体日期和星期几,方便一眼看到
 *  例:
 *    今天         →  今天 10/16 周五
 *    明天         →  明天 10/17 周六
 *    周二(3 天后) →  周二 10/19
 *    +8 天        →  10/25 周二
 *    已过 2 天    →  10/14 周二
 *    跨年         →  2027-01-15 周五
 */
function dateLabel(dueDate) {
  if (!dueDate) return '';
  const today = dayKey();
  const wnames = ['日', '一', '二', '三', '四', '五', '六'];
  const d = parseDayKey(dueDate);
  const dow = wnames[d.getDay()];
  const md = (d.getMonth() + 1) + '/' + d.getDate();
  const ymd = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const full = d.getFullYear() === new Date().getFullYear() ? md : ymd;

  if (dueDate === today) {
    // 今天 10/16 周五
    return '今天 ' + full + ' 周' + dow;
  }
  const tomorrow = addDays(today, 1);
  if (dueDate === tomorrow) {
    return '明天 ' + full + ' 周' + dow;
  }
  const dayAfter = addDays(today, 2);
  if (dueDate === dayAfter) {
    return '后天 ' + full + ' 周' + dow;
  }

  const todayMs = parseDayKey(today).getTime();
  const dueMs = d.getTime();
  const diffDays = Math.round((dueMs - todayMs) / 86400000);
  if (diffDays < 0) {
    // 过期: 已过 N 天 10/14 周二
    return '已过 ' + (-diffDays) + ' 天 ' + full + ' 周' + dow;
  }
  if (diffDays > 0 && diffDays <= 7) {
    // 1 周内: 周X 10/19
    return '周' + dow + ' ' + full;
  }
  // +8 天及以上: 10/25 周二
  return full + ' 周' + dow;
}

function isOverdue(todo) {
  if (todo.done) return false;
  if (!todo.dueDate) return false;
  return todo.dueDate < dayKey();
}

Page({
  data: {
    today: '',
    todos: [],
    activeTodos: [],
    doneTodos: [],
    doneCollapsed: true,
    ideas: [],
    addTodoOpen: false,
    addTodoText: '',
    addTodoDate: '',
    addIdeaOpen: false,
    addIdeaText: '',
    editingIdeaId: '',
    // checkin (照旧)
    active: [],
    ended: [],
    checkinStats: { totalDays: 0 },
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const today = dayKey();
    const allTodos = repo.getTodos();
    // 待办: 过期 > 今天 > 明天 > ... > 无日期
    const active = allTodos
      .filter((t) => !t.done)
      .sort((a, b) => {
        // 过期优先 (有日期的过期 在最前)
        if (a.dueDate && !b.dueDate) return -1;
        if (!a.dueDate && b.dueDate) return 1;
        if (a.dueDate && b.dueDate) {
          if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
        }
        return (a.createdAt || 0) - (b.createdAt || 0);
      })
      .map((t) => ({
        ...t,
        dueLabel: dateLabel(t.dueDate),
        overdue: isOverdue(t),
      }));
    const done = allTodos
      .filter((t) => t.done)
      .sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0))
      .map((t) => ({ ...t, dueLabel: dateLabel(t.dueDate) }));

    const ideas = repo.getIdeas()
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .map((i) => {
        const d = new Date(i.createdAt);
        const sameYear = d.getFullYear() === new Date().getFullYear();
        return {
          ...i,
          timeLabel: sameYear
            ? (d.getMonth() + 1) + '/' + d.getDate()
            : d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate(),
        };
      });

    // checkin
    const list = repo.listCheckins();
    const activeCheckins = engine.partitionByStatus(list).active;
    const endedCheckins = engine.partitionByStatus(list).ended;
    const decorate = (c) => {
      const done = engine.progressCount(c, today);
      const pct = Math.min(100, Math.round((done / Math.max(c.target, 1)) * 100));
      const completions = c.completions || [];
      // 每个事项自己算连续(active 看当前连续;ended 看历史最长)
      const isStreak = c.goalType === 'streak';
      const cur = isStreak ? engine.currentStreak(c, today) : 0;
      const longest = isStreak ? engine.longestStreak(c) : 0;
      const streakText = !isStreak
        ? ''
        : (c.status === 'ended'
          ? '曾连续 ' + longest + ' 天'
          : (cur > 0 ? '连续 ' + cur + ' 天' : '今日还没打卡'));
      return {
        ...c,
        doneCount: done,
        progressText: engine.progressText(c, today),
        pending: engine.isPendingToday(c, today),
        todayDone: completions.includes(today),
        pct,
        recent: completions.slice(-3).join('、'),
        recentLast: completions.length ? completions[completions.length - 1] : '',
        showStreak: isStreak,
        streakText,
      };
    };

    // 累计打卡天数(所有 checkin 的 completions 合并去重)—— 跨事项的总和
    const allDays = new Set();
    list.forEach((c) => (c.completions || []).forEach((d) => allDays.add(d)));
    const checkinStats = {
      totalDays: allDays.size,
    };

    this.setData({
      today,
      todos: allTodos,
      activeTodos: active,
      doneTodos: done,
      ideas,
      active: activeCheckins.map(decorate),
      ended: endedCheckins.map(decorate),
      checkinStats,
    });
  },

  // ====== TODO ======
  onOpenAddTodo() {
    this.setData({ addTodoOpen: true, addTodoText: '', addTodoDate: this.data.today });
  },
  onCloseAddTodo() {
    this.setData({ addTodoOpen: false });
  },
  onTodoTextInput(e) {
    this.setData({ addTodoText: e.detail.value || '' });
  },
  onTodoDateChange(e) {
    this.setData({ addTodoDate: e.detail.value || '' });
  },
  onClearTodoDate() {
    this.setData({ addTodoDate: '' });
  },
  onQuickTodoDate(e) {
    const tag = e.currentTarget.dataset.tag;
    let date = this.data.today;
    if (tag === 'tomorrow') date = addDays(this.data.today, 1);
    else if (tag === 'dayAfter') date = addDays(this.data.today, 2);
    else if (tag === 'none') date = '';
    this.setData({ addTodoDate: date });
  },
  onConfirmAddTodo() {
    const text = (this.data.addTodoText || '').trim();
    if (!text) {
      wx.showToast({ title: '请输入内容', icon: 'none' });
      return;
    }
    const result = repo.addTodo({ text, dueDate: this.data.addTodoDate || '' });
    if (!result.ok) {
      wx.showToast({ title: result.error || '添加失败', icon: 'none' });
      return;
    }
    this.setData({ addTodoOpen: false, addTodoText: '' });
    this.refresh();
  },
  onToggleTodo(e) {
    const id = e.currentTarget.dataset.id;
    const t = this.data.todos.find((x) => x.id === id);
    if (!t) return;
    repo.updateTodo(id, { done: !t.done });
    this.refresh();
  },
  onDeleteTodo(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除这条待办？',
      confirmText: '删除',
      cancelText: '取消',
      confirmColor: '#a33b2c',
      success: (res) => {
        if (!res.confirm) return;
        repo.deleteTodo(id);
        this.refresh();
      },
    });
  },
  onToggleDoneFold() {
    this.setData({ doneCollapsed: !this.data.doneCollapsed });
  },

  // ====== IDEAS ======
  onOpenAddIdea() {
    this.setData({ addIdeaOpen: true, addIdeaText: '', editingIdeaId: '' });
  },
  onCloseAddIdea() {
    this.setData({ addIdeaOpen: false, editingIdeaId: '' });
  },
  onEditIdea(e) {
    const id = e.currentTarget.dataset.id;
    const idea = this.data.ideas.find((x) => x.id === id);
    if (!idea) return;
    this.setData({
      addIdeaOpen: true,
      addIdeaText: idea.text,
      editingIdeaId: id,
    });
  },
  onIdeaTextInput(e) {
    this.setData({ addIdeaText: e.detail.value || '' });
  },
  onConfirmAddIdea() {
    const text = (this.data.addIdeaText || '').trim();
    if (!text) {
      wx.showToast({ title: '请输入内容', icon: 'none' });
      return;
    }
    const editId = this.data.editingIdeaId;
    const result = editId
      ? repo.updateIdea(editId, { text })
      : repo.addIdea({ text });
    if (!result.ok) {
      wx.showToast({ title: result.error || '保存失败', icon: 'none' });
      return;
    }
    this.setData({ addIdeaOpen: false, addIdeaText: '', editingIdeaId: '' });
    wx.showToast({ title: editId ? '已更新' : '已保存', icon: 'success' });
    this.refresh();
  },
  onDeleteIdea(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除这条想法？',
      confirmText: '删除',
      cancelText: '取消',
      confirmColor: '#a33b2c',
      success: (res) => {
        if (!res.confirm) return;
        repo.deleteIdea(id);
        this.refresh();
      },
    });
  },

  // ====== CHECKIN (照旧从 checkin.js 搬过来) ======
  noop() {},
  onOpenDetail(e) {
    const noteId = e.currentTarget.dataset.noteId;
    if (!noteId) {
      wx.showToast({ title: '找不到关联内容', icon: 'none' });
      return;
    }
    const note = repo.getNote(noteId);
    if (!note) {
      wx.showToast({ title: '内容已删除', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/note-detail/note-detail?id=' + noteId });
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
      itemList: days.map((d) => '补卡 ' + d),
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
      content: '将移到「已结束」，内容仍在对应分类里。',
      success: (res) => {
        if (!res.confirm) return;
        this._mutate(id, (c) => ({ checkin: engine.stopCheckin(c, dayKey()), signal: 'stopped' }));
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
    if (!result.ok) { wx.showToast({ title: '保存失败', icon: 'none' }); return; }
    wx.showToast({ title: '已继续打卡', icon: 'success' });
    this.refresh();
  },
  onDeleteCheckin(e) {
    const id = e.currentTarget.dataset.id;
    const label = e.currentTarget.dataset.label || '这条打卡';
    wx.showModal({
      title: '删除这条打卡？',
      content: '「' + label + '」会从打卡列表移除，但笔记内容仍保留在「美食 / 美容 / 学习」里。',
      confirmText: '删除',
      cancelText: '取消',
      confirmColor: '#a33b2c',
      success: (res) => {
        if (!res.confirm) return;
        const result = repo.deleteCheckin(id);
        if (!result.ok) { wx.showToast({ title: '删除失败', icon: 'none' }); return; }
        wx.showToast({ title: '已删除', icon: 'success' });
        this.refresh();
      },
    });
  },
  _mutate(id, fn) {
    const list = repo.listCheckins();
    const cur = list.find((x) => x.id === id);
    if (!cur) return;
    const out = fn(cur);
    const next = out.checkin;
    const signal = out.signal;
    const result = repo.upsertCheckin(next);
    if (!result.ok) { wx.showToast({ title: '保存失败（可能存储已满）', icon: 'none' }); return; }
    if (signal === 'askContinue') {
      wx.showModal({
        title: '本周期已完成',
        content: '「' + next.label + '」已达到 ' + engine.progressText(next) + '。要不要继续坚持？',
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
