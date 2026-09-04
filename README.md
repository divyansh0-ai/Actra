# Actra

**Tell it the goal. Let it do the work.** Real tools, not pretend buttons.

Actra is an AI-action workspace. A normal productivity site can only *tell* you to
prioritise your work. Actra exposes the operation itself, so an agent can perform it:

```
User goal  →  AI agent  →  WebMCP tool  →  application state changes  →  UI updates  →  activity log
```

Nine WebMCP tools, two surfaces, no backend. Everything runs in the tab.

| | |
| --- | --- |
| **Live demo** | _add your deployed URL here_ |
| **Demo video** | _add your YouTube link here_ |
| **License** | MIT |

---

## Why this use case is a strong fit for WebMCP

Most agent demos wrap a database in tool calls. If the logic lives on a server, you never
needed WebMCP — a plain MCP server would do the same job better. Actra deliberately puts
the tools where the logic already is: **in the page**.

Two surfaces make that argument in two different ways.

**1. The board — state the agent can steer.** Tasks live in the tab, in `localStorage`.
`prioritize_tasks` doesn't return advice; it reorders the real board and reports what moved.
The user watches their workspace rearrange itself. The agent and the human are looking at
the same artifact and touching the same code path.

**2. The travel claim — validation the agent cannot guess.** This is a fifteen-field
reimbursement form with conditional sections and real company policy: the return date must
follow departure, a passport must stay valid six months past the return date, IFSC codes
have a format, spend is capped by trip type. That rule graph is the product. Nobody is going
to reimplement it as a remote MCP server — and if they did, it would immediately drift from
the form users actually submit.

So the agent fills the form, submits it, and **gets rejected**:

```json
{
  "status": "rejected",
  "errorCount": 3,
  "errors": [
    { "field": "passport_expiry", "code": "policy_passport_validity",
      "message": "Passport must stay valid for 6 months after the return date. With a return of 2026-10-20, expiry must be on or after 2027-04-20 — you entered 2026-12-01." },
    { "field": "amount_inr", "code": "policy_cap_exceeded",
      "message": "international travel is capped at ₹2,50,000. You claimed ₹3,10,000." },
    { "field": "ifsc", "code": "format",
      "message": "IFSC must be 4 letters, then a 0, then 6 alphanumeric characters, e.g. HDFC0001234." }
  ],
  "hint": "Correct those values and call submit_travel_claim again."
}
```

The agent reads the errors, fixes those three fields, resubmits, and the claim is accepted.
That closed loop — model proposes, page enforces, model corrects — is the part that only
works when the tool lives inside the application.

There's a privacy argument too. Passport and bank details never leave the tab. There is no
server to send them to.

## How it creates a better user experience

- **You state an outcome, not a sequence of clicks.** "Everything shipping today is high
  priority, then show me what to do first" is one sentence instead of eleven interactions.
- **The work is visible.** Every tool call — from the agent or from you — lands in the same
  activity feed, labelled with its source. Nothing happens in a hidden API you have to trust.
- **The agent can't quietly do the wrong thing.** Policy is enforced by the page, not by the
  model's judgement. A claim that violates the passport rule is rejected whether a human or
  an agent submitted it.
- **Forms stop being a wall.** The worst part of admin software is transcribing what you
  already know into fifteen boxes. Here you say it once, in a sentence, and correct the
  agent's mistakes instead of typing everything yourself.

## What people and agents can do together that was difficult before

Before WebMCP, an agent operating a web app had two bad options: screen-scrape and click
around the DOM (brittle, invisible, unable to read validation), or talk to an API that
doesn't exist for most apps. Neither could participate in a form's rule graph.

With Actra, a person and an agent share one live workspace:

- The agent reorders your board while you're looking at it, and you drag one card back —
  no sync, no refresh, no divergence. Same state, same code path.
- The agent submits a claim on your behalf, hits a policy wall it had no way to know about,
  reads the page's own explanation, and fixes itself — without a human relaying the error.
- You keep the sensitive fields local. The agent supplies structure; the tab holds the data.

## How WebMCP is implemented

Both halves of the API are used, each where it fits.

**Imperative — eight tools registered on `document.modelContext`** ([src/lib/tools.js](src/lib/tools.js)):

```js
document.modelContext.registerTool({
  name: "prioritize_tasks",
  description:
    "Reorder the whole board so the most important work sits on top, and report what moved.",
  inputSchema: {
    type: "object",
    properties: {
      strategy: {
        type: "string",
        enum: ["balanced", "priority", "deadline"],
        description: "How to weigh the sort."
      }
    }
  },
  annotations: { title: "Prioritize tasks", readOnlyHint: false, idempotentHint: true },
  execute: async (input) => store.prioritizeTasks(input)
});
```

Registration happens once in a `useEffect` and is torn down with an `AbortController`,
passed as `registerTool(tool, { signal })` — the lifecycle hook the API provides.

**Declarative — the claim form is the tool** ([src/components/ClaimForm.jsx](src/components/ClaimForm.jsx)).
No `registerTool` call; the browser derives the schema from markup, fills the real inputs and
submits, and the page answers through `respondWith`:

```jsx
<form toolname="submit_travel_claim" tooldescription="Submit a travel claim…" toolautosubmit>
  <input name="passport_number"
         toolparamdescription="International trips only. One uppercase letter then 7 digits." />
</form>
```

```js
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const { valid, errors } = validateClaim(readForm());
  if (e.agentInvoked) {
    e.respondWith(valid ? { status: 'accepted', claim } : { status: 'rejected', errors });
  }
});
```

**Two React traps this codebase documents**, both of which fail silently:

1. **Never use controlled inputs on a declarative tool form.** An agent assigns
   `input.value` directly. React's value tracker sees no change and swallows the synthetic
   event, so a controlled form ignores everything the agent typed. Actra's claim form is
   uncontrolled and reads `FormData` at submit time.
2. **`onSubmit` gives you a SyntheticEvent.** WebMCP puts `agentInvoked` and `respondWith`
   on the **native** event, so a React handler cannot see them — `respondWith` is never
   called, and the tool call times out and resolves `null`. Actra attaches a native
   `submit` listener via a ref.

State lives in a plain observable store ([src/lib/store.js](src/lib/store.js)) rather than in
React state, so tools always act on current data with no stale closures, and the agent's path
and the human's path are literally the same function.

## The nine tools

| Tool | Kind | Does |
| --- | --- | --- |
| `create_task` | imperative | Adds a task; `priority` is one of high / medium / low. |
| `complete_task` | imperative | Marks a task done. Returns `{ success, taskId }`. |
| `update_task` | imperative | Changes title, priority, or due — only the fields supplied. |
| `delete_task` | imperative | Removes a task. |
| `list_tasks` | imperative, read-only | Lists tasks, filtered by status or priority. |
| `prioritize_tasks` | imperative | Reorders the board; returns `tasksMoved` and `focusNext`. |
| `clear_completed` | imperative | Bulk-removes completed tasks. |
| `get_workspace_summary` | imperative, read-only | Counts, completion rate, priority overload warning. |
| `submit_travel_claim` | **declarative** | Validates against policy; returns field-addressed errors. |

Every task tool accepts an **id or the task title**, so an agent doesn't have to call
`list_tasks` before acting. Unknown references return
`{ success: false, error: "task_not_found", message: … }` instead of throwing, so the agent
can recover.

## Run it

```bash
npm install
npm run dev
```

Then open <http://localhost:5180>. Production build:

```bash
npm run build
```

No backend, no database, no auth. State persists in `localStorage`.

### Browser support

WebMCP is behind an origin trial in Chrome. [`public/webmcp-polyfill.js`](public/webmcp-polyfill.js)
(vendored from [GoogleChromeLabs/webmcp-tools](https://github.com/GoogleChromeLabs/webmcp-tools),
Apache-2.0) installs `document.modelContext` when the API isn't native, so Actra runs in any
browser and in ChatGPT's in-app browser. To use the native API on your own origin, add your
origin-trial token to `index.html`:

```html
<meta http-equiv="origin-trial" content="YOUR_TOKEN" />
```

### Driving the tools by hand

Useful for testing without an agent. Note that `executeTool` takes the **tool descriptor**,
not the tool name:

```js
const mc = document.modelContext;
const tools = await mc.getTools();
const call = (name, args) => mc.executeTool(tools.find(t => t.name === name), args);

await call('create_task', { title: 'Ship the demo video', priority: 'high', due: 'Today' });
await call('prioritize_tasks', { strategy: 'balanced' });
await call('get_workspace_summary', {});
```

## Try these

- *"Add a high-priority task to ship the demo video today, then tell me what to do first."*
- *"My list is out of control — reorder it by deadline and summarise where I stand."*
- *"File my Berlin trip: 14th to 20th October, conference, ₹3,10,000, passport Z1234567
  expiring December, account 123456789012 at HDFC123."* — watch it get rejected three times
  over and fix itself.
- *"Clear everything I've finished."*

## Project layout

```
index.html                   loads the polyfill, then the app
public/webmcp-polyfill.js    vendored WebMCP polyfill (Apache-2.0, Google LLC)
src/lib/store.js             observable state; every tool's real implementation
src/lib/tools.js             the eight imperative tool descriptors
src/lib/claimRules.js        the policy rule graph the agent has to satisfy
src/components/ClaimForm.jsx the declarative tool form + respondWith loop
src/components/Board.jsx     task board and human controls
src/components/ActivityLog.jsx  agent/human activity feed
```
