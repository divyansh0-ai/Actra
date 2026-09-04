import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Plug, PlugZap, LayoutList, FileText, RotateCcw } from 'lucide-react';

import { store } from './lib/instance.js';
import { buildTools } from './lib/tools.js';
import Board from './components/Board.jsx';
import ClaimForm from './components/ClaimForm.jsx';
import ActivityLog from './components/ActivityLog.jsx';

export default function App() {
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const [tab, setTab] = useState('board');
  const [mcp, setMcp] = useState({ ready: false, tools: [] });

  /* Register every imperative tool once, and tear them down with an
     AbortController — the signal option the WebMCP API provides for exactly
     this lifecycle. */
  useEffect(() => {
    const mc = document.modelContext;
    if (!mc) return undefined;

    const controller = new AbortController();

    (async () => {
      for (const tool of buildTools(store)) {
        try {
          await mc.registerTool(tool, { signal: controller.signal });
        } catch (err) {
          console.warn(`[actra] could not register ${tool.name}:`, err.message);
        }
      }
      try {
        // Includes the declarative claim form, which the browser derives from markup.
        const tools = await mc.getTools();
        if (!controller.signal.aborted) {
          setMcp({ ready: true, tools: tools.map((t) => t.name) });
        }
      } catch {
        setMcp({ ready: true, tools: [] });
      }
    })();

    return () => controller.abort();
  }, []);

  /* When an agent activates the claim tool, bring that panel forward so the
     user actually watches the form fill itself. */
  useEffect(() => {
    const onActivated = (e) => {
      if (e.toolName === 'submit_travel_claim') setTab('claim');
    };
    window.addEventListener('toolactivated', onActivated);
    return () => window.removeEventListener('toolactivated', onActivated);
  }, []);

  const toolCount = mcp.tools.length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark">A</span>
          <div>
            <h1>Actra</h1>
            <p>Tell it the goal. Let it do the work.</p>
          </div>
        </div>

        <div className={`mcp-chip ${mcp.ready ? 'on' : 'off'}`} title={mcp.tools.join('\n')}>
          {mcp.ready ? <PlugZap size={15} /> : <Plug size={15} />}
          {mcp.ready
            ? `WebMCP connected · ${toolCount} tool${toolCount === 1 ? '' : 's'}`
            : 'WebMCP unavailable'}
        </div>
      </header>

      <nav className="tabs">
        <button className={tab === 'board' ? 'tab on' : 'tab'} onClick={() => setTab('board')}>
          <LayoutList size={15} /> Board
        </button>
        <button className={tab === 'claim' ? 'tab on' : 'tab'} onClick={() => setTab('claim')}>
          <FileText size={15} /> Travel claim
        </button>
        <button className="tab ghost" onClick={() => store.resetWorkspace()} title="Reset to sample data">
          <RotateCcw size={14} /> Reset
        </button>
      </nav>

      <main className="layout">
        <div className="panels">
          {/* Both panels stay mounted: the claim form's declarative tool only
              exists while its <form> is in the DOM, and an agent should be able
              to discover it no matter which tab a human is looking at. */}
          <section className="panel" hidden={tab !== 'board'}>
            <Board state={state} />
          </section>
          <section className="panel" hidden={tab !== 'claim'}>
            <ClaimForm />
          </section>
        </div>

        <ActivityLog activity={state.activity} tools={mcp.tools} />
      </main>
    </div>
  );
}
