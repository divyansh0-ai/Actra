import React, { useState } from 'react';
import { Check, Trash2, Plus, ArrowUpNarrowWide, Sparkles } from 'lucide-react';

import { store, } from '../lib/instance.js';
import { PRIORITIES, DUE_LABELS } from '../lib/store.js';

export default function Board({ state }) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  const [due, setDue] = useState('Today');

  const active = state.tasks.filter((t) => !t.done);
  const done = state.tasks.length - active.length;
  const rate = state.tasks.length ? Math.round((done / state.tasks.length) * 100) : 0;
  const focus = active[0];

  const submit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    store.createTask({ title, priority, due }, 'you');
    setTitle('');
  };

  return (
    <>
      <div className="stats">
        <Stat value={state.tasks.length} label="Tasks" />
        <Stat value={active.length} label="Active" />
        <Stat value={active.filter((t) => t.priority === 'high').length} label="High priority" />
        <Stat value={active.filter((t) => t.due === 'Today').length} label="Due today" />
        <Stat value={`${rate}%`} label="Complete" />
      </div>

      {focus && (
        <div className="focus">
          <Sparkles size={15} />
          <div>
            <span className="focus-label">Focus next</span>
            <strong>{focus.title}</strong>
          </div>
          <button className="btn small" onClick={() => store.prioritizeTasks({}, 'you')}>
            <ArrowUpNarrowWide size={14} /> Prioritize
          </button>
        </div>
      )}

      <form className="composer" onSubmit={submit}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task by hand — the agent uses the same code path"
          aria-label="New task title"
        />
        <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due">
          {DUE_LABELS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <button className="btn" type="submit"><Plus size={15} /> Add</button>
      </form>

      <ul className="tasks">
        {state.tasks.map((t) => (
          <li key={t.id} className={`task ${t.done ? 'done' : ''} p-${t.priority}`}>
            <button
              className="check"
              aria-label={t.done ? 'Reopen task' : 'Complete task'}
              onClick={() => (t.done ? store.reopenTask({ id: t.id }) : store.completeTask({ id: t.id }, 'you'))}
            >
              {t.done && <Check size={13} />}
            </button>

            <div className="task-body">
              <span className="task-title">{t.title}</span>
              <div className="task-meta">
                <em className={`pill ${t.priority}`}>{t.priority}</em>
                <em className="pill">{t.due}</em>
                <code>{t.id}</code>
              </div>
            </div>

            <button className="icon" aria-label="Delete task" onClick={() => store.deleteTask({ id: t.id }, 'you')}>
              <Trash2 size={15} />
            </button>
          </li>
        ))}
        {!state.tasks.length && <li className="empty">No tasks yet. Add one, or ask your agent to.</li>}
      </ul>
    </>
  );
}

const Stat = ({ value, label }) => (
  <div className="stat">
    <b>{value}</b>
    <span>{label}</span>
  </div>
);
