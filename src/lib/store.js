/**
 * Actra's application state.
 *
 * Deliberately framework-agnostic: the store is a plain observable object, not
 * React state. WebMCP tools are registered once on mount and call these methods
 * directly, so an agent always acts on the current state — no stale closures,
 * and no second code path that could drift from what the UI does.
 */

const STORAGE_KEY = 'actra.workspace.v1';

export const PRIORITIES = ['high', 'medium', 'low'];
export const DUE_LABELS = ['Today', 'Tomorrow', 'This Week', 'Later'];

const PRIORITY_WEIGHT = { high: 0, medium: 1, low: 2 };
const DUE_WEIGHT = { Today: 0, Tomorrow: 1, 'This Week': 2, Later: 3 };

const dueWeight = (due) => (due in DUE_WEIGHT ? DUE_WEIGHT[due] : 2.5);

const SEED = [
  { title: 'Fix the checkout race condition', priority: 'high', due: 'Today' },
  { title: 'Practice React hooks — useReducer deep dive', priority: 'medium', due: 'This Week' },
  { title: 'Reply to the design review thread', priority: 'high', due: 'Tomorrow' },
  { title: 'Cancel the unused analytics subscription', priority: 'low', due: 'Later' },
  { title: 'Write the sprint retro notes', priority: 'medium', due: 'Today', done: true },
];

let uid = 0;
const newId = () => `task-${Date.now().toString(36)}-${(uid++).toString(36)}`;

function makeTask({ title, priority, due, done }) {
  return {
    id: newId(),
    title: String(title).trim(),
    priority: PRIORITIES.includes(priority) ? priority : 'medium',
    due: due ? String(due).trim() : 'Later',
    done: Boolean(done),
    createdAt: new Date().toISOString(),
  };
}

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (raw && Array.isArray(raw.tasks)) return raw;
  } catch {
    /* fall through to a seeded workspace */
  }
  return { tasks: SEED.map(makeTask), activity: [] };
}

/** Public shape of a task as returned to the agent. */
export const serialize = (t) => ({
  id: t.id,
  title: t.title,
  priority: t.priority,
  due: t.due,
  done: t.done,
});

export function createStore() {
  let state = loadState();
  const listeners = new Set();

  const persist = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked — the session still works in memory */
    }
  };

  const emit = () => {
    persist();
    for (const fn of listeners) fn();
  };

  /** Records what just happened so the UI can show the agent's work. */
  const log = (source, tool, summary) => {
    state = {
      ...state,
      activity: [
        { id: newId(), at: new Date().toISOString(), source, tool, summary },
        ...state.activity,
      ].slice(0, 40),
    };
  };

  const setTasks = (tasks) => {
    state = { ...state, tasks };
  };

  /** Resolve by exact id first, then by a unique-enough title match. */
  const find = (ref) => {
    if (!ref) return null;
    const key = String(ref).trim();
    const byId = state.tasks.find((t) => t.id === key);
    if (byId) return byId;
    const lower = key.toLowerCase();
    return (
      state.tasks.find((t) => t.title.toLowerCase() === lower) ||
      state.tasks.find((t) => t.title.toLowerCase().includes(lower)) ||
      null
    );
  };

  const notFound = (ref) => ({
    success: false,
    error: 'task_not_found',
    message: `No task matching "${ref}". Call list_tasks to see valid ids.`,
  });

  return {
    /* ---------------------------------------------------- subscription */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getState() {
      return state;
    },

    /* --------------------------------------------------------- actions */

    createTask({ title, priority, due }, source = 'agent') {
      if (!title || !String(title).trim()) {
        return { success: false, error: 'invalid_input', message: 'A non-empty title is required.' };
      }
      const task = makeTask({ title, priority, due });
      setTasks([...state.tasks, task]);
      log(source, 'create_task', `Created “${task.title}” (${task.priority})`);
      emit();
      return { success: true, task: serialize(task), totalTasks: state.tasks.length };
    },

    completeTask({ id }, source = 'agent') {
      const task = find(id);
      if (!task) return notFound(id);
      if (task.done) {
        return { success: true, taskId: task.id, alreadyComplete: true, task: serialize(task) };
      }
      setTasks(state.tasks.map((t) => (t.id === task.id ? { ...t, done: true } : t)));
      log(source, 'complete_task', `Completed “${task.title}”`);
      emit();
      return { success: true, taskId: task.id, task: { ...serialize(task), done: true } };
    },

    reopenTask({ id }, source = 'you') {
      const task = find(id);
      if (!task) return notFound(id);
      setTasks(state.tasks.map((t) => (t.id === task.id ? { ...t, done: false } : t)));
      log(source, 'reopen_task', `Reopened “${task.title}”`);
      emit();
      return { success: true, taskId: task.id };
    },

    updateTask({ id, title, priority, due }, source = 'agent') {
      const task = find(id);
      if (!task) return notFound(id);

      const patch = {};
      if (title !== undefined && String(title).trim()) patch.title = String(title).trim();
      if (priority !== undefined) {
        if (!PRIORITIES.includes(priority)) {
          return {
            success: false,
            error: 'invalid_priority',
            message: `Priority must be one of: ${PRIORITIES.join(', ')}.`,
          };
        }
        patch.priority = priority;
      }
      if (due !== undefined && String(due).trim()) patch.due = String(due).trim();

      if (!Object.keys(patch).length) {
        return {
          success: false,
          error: 'nothing_to_update',
          message: 'Supply at least one of: title, priority, due.',
        };
      }

      const updated = { ...task, ...patch };
      setTasks(state.tasks.map((t) => (t.id === task.id ? updated : t)));
      log(source, 'update_task', `Updated “${updated.title}” (${Object.keys(patch).join(', ')})`);
      emit();
      return { success: true, taskId: task.id, changed: Object.keys(patch), task: serialize(updated) };
    },

    deleteTask({ id }, source = 'agent') {
      const task = find(id);
      if (!task) return notFound(id);
      setTasks(state.tasks.filter((t) => t.id !== task.id));
      log(source, 'delete_task', `Deleted “${task.title}”`);
      emit();
      return { success: true, taskId: task.id, deleted: serialize(task) };
    },

    listTasks({ filter = 'all', priority } = {}) {
      let rows = state.tasks;
      if (filter === 'active') rows = rows.filter((t) => !t.done);
      if (filter === 'completed') rows = rows.filter((t) => t.done);
      if (priority) rows = rows.filter((t) => t.priority === priority);
      return { success: true, count: rows.length, tasks: rows.map(serialize) };
    },

    /**
     * The hero action: reorders the board so the next thing to do is on top.
     * Returns the moves it made, so an agent can explain itself to the user.
     */
    prioritizeTasks({ strategy = 'balanced' } = {}, source = 'agent') {
      const before = state.tasks.map((t) => t.id);

      const score = (t) => {
        if (t.done) return 1000;
        if (strategy === 'deadline') return dueWeight(t.due) * 10 + PRIORITY_WEIGHT[t.priority];
        if (strategy === 'priority') return PRIORITY_WEIGHT[t.priority] * 10 + dueWeight(t.due);
        return PRIORITY_WEIGHT[t.priority] * 4 + dueWeight(t.due) * 3;
      };

      const sorted = [...state.tasks]
        .map((t, i) => ({ t, i }))
        .sort((a, b) => score(a.t) - score(b.t) || a.i - b.i)
        .map(({ t }) => t);

      setTasks(sorted);
      const after = sorted.map((t) => t.id);
      const moved = after.filter((id, i) => before[i] !== id).length;

      log(source, 'prioritize_tasks', `Reordered the board — ${moved} task${moved === 1 ? '' : 's'} moved`);
      emit();

      const top = sorted.find((t) => !t.done);
      return {
        success: true,
        strategy,
        tasksMoved: moved,
        focusNext: top ? serialize(top) : null,
        order: sorted.filter((t) => !t.done).map((t) => ({ id: t.id, title: t.title, priority: t.priority, due: t.due })),
      };
    },

    clearCompleted(_args, source = 'agent') {
      const removed = state.tasks.filter((t) => t.done);
      if (!removed.length) {
        return { success: true, removedCount: 0, message: 'There were no completed tasks to clear.' };
      }
      setTasks(state.tasks.filter((t) => !t.done));
      log(source, 'clear_completed', `Cleared ${removed.length} completed task${removed.length === 1 ? '' : 's'}`);
      emit();
      return { success: true, removedCount: removed.length, removed: removed.map(serialize) };
    },

    getSummary() {
      const { tasks } = state;
      const active = tasks.filter((t) => !t.done);
      const byPriority = Object.fromEntries(
        PRIORITIES.map((p) => [p, active.filter((t) => t.priority === p).length]),
      );
      const overloaded = byPriority.high > 3;
      const next = active[0];

      return {
        success: true,
        totalTasks: tasks.length,
        active: active.length,
        completed: tasks.length - active.length,
        completionRate: tasks.length ? Math.round(((tasks.length - active.length) / tasks.length) * 100) : 0,
        activeByPriority: byPriority,
        dueToday: active.filter((t) => t.due === 'Today').length,
        focusNext: next ? serialize(next) : null,
        advice: overloaded
          ? 'More than three high-priority tasks are open — consider downgrading or deferring some.'
          : 'Priority load looks manageable.',
      };
    },

    /** Lets other surfaces (the claim form) record into the same activity feed. */
    logEvent(source, tool, summary) {
      log(source, tool, summary);
      emit();
    },

    resetWorkspace() {
      state = { tasks: SEED.map(makeTask), activity: [] };
      log('you', 'reset', 'Workspace reset to the sample set');
      emit();
    },
  };
}
