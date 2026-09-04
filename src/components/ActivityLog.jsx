import React from 'react';
import { Bot, User, Wrench } from 'lucide-react';

const time = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function ActivityLog({ activity, tools }) {
  return (
    <aside className="side">
      <section className="card">
        <h3><Wrench size={14} /> Exposed tools</h3>
        {tools.length ? (
          <ul className="toollist">
            {tools.map((t) => (
              <li key={t}><code>{t}</code></li>
            ))}
          </ul>
        ) : (
          <p className="muted">No WebMCP host detected on this page.</p>
        )}
      </section>

      <section className="card grow">
        <h3><Bot size={14} /> Activity</h3>
        {activity.length ? (
          <ol className="feed">
            {activity.map((a) => (
              <li key={a.id}>
                <div className="feed-head">
                  <span className={`who ${a.source}`}>
                    {a.source === 'agent' ? <Bot size={12} /> : <User size={12} />}
                    {a.source}
                  </span>
                  <code>{a.tool}</code>
                  <time>{time(a.at)}</time>
                </div>
                <p>{a.summary}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">
            Nothing yet. Every tool call — from you or an agent — lands here.
          </p>
        )}
      </section>
    </aside>
  );
}
