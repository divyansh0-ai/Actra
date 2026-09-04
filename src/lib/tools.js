/**
 * Actra's imperative WebMCP surface.
 *
 * Each descriptor is a real tool: typed JSON Schema in, structured JSON out.
 * Handlers delegate straight to the store, which is the same code path the
 * human UI uses — so an agent's call and a user's click cannot drift apart.
 */

import { PRIORITIES, DUE_LABELS } from './store.js';

const priorityProp = {
  type: 'string',
  enum: PRIORITIES,
  description: 'Task urgency. One of: high, medium, low.',
};

const dueProp = {
  type: 'string',
  description:
    `When the task is due. Prefer one of the standard labels (${DUE_LABELS.join(', ')}) ` +
    'so it sorts correctly, but any short label is accepted.',
};

const idProp = {
  type: 'string',
  description:
    'The task id (from create_task or list_tasks). The exact task title is also accepted ' +
    'if you do not have the id to hand.',
};

export function buildTools(store) {
  return [
    {
      name: 'create_task',
      description:
        'Create a new task in the Actra workspace. Use this whenever the user mentions ' +
        'something they need to do.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'What needs doing, as a short imperative phrase.' },
          priority: priorityProp,
          due: dueProp,
        },
        required: ['title'],
      },
      annotations: { title: 'Create task', readOnlyHint: false, destructiveHint: false },
      execute: (args = {}) => store.createTask(args),
    },

    {
      name: 'complete_task',
      description: 'Mark an existing task as completed.',
      inputSchema: {
        type: 'object',
        properties: { id: idProp },
        required: ['id'],
      },
      annotations: { title: 'Complete task', readOnlyHint: false, idempotentHint: true },
      execute: (args = {}) => store.completeTask(args),
    },

    {
      name: 'update_task',
      description:
        'Update an existing task. Only the fields you supply are changed — omit the rest. ' +
        'Use this to rename a task, re-prioritise it, or move its due date.',
      inputSchema: {
        type: 'object',
        properties: {
          id: idProp,
          title: { type: 'string', description: 'New title. Omit to leave unchanged.' },
          priority: priorityProp,
          due: dueProp,
        },
        required: ['id'],
      },
      annotations: { title: 'Update task', readOnlyHint: false, idempotentHint: true },
      execute: (args = {}) => store.updateTask(args),
    },

    {
      name: 'delete_task',
      description: 'Permanently delete a task from the workspace.',
      inputSchema: {
        type: 'object',
        properties: { id: idProp },
        required: ['id'],
      },
      annotations: { title: 'Delete task', readOnlyHint: false, destructiveHint: true },
      execute: (args = {}) => store.deleteTask(args),
    },

    {
      name: 'list_tasks',
      description:
        'List tasks in the workspace, optionally narrowed by status or priority. Read-only — ' +
        'call this first when you need task ids.',
      inputSchema: {
        type: 'object',
        properties: {
          filter: {
            type: 'string',
            enum: ['all', 'active', 'completed'],
            description: 'Which tasks to return. Defaults to "all".',
          },
          priority: priorityProp,
        },
      },
      annotations: { title: 'List tasks', readOnlyHint: true },
      execute: (args = {}) => store.listTasks(args),
    },

    {
      name: 'prioritize_tasks',
      description:
        'Reorder the whole board so the most important work sits on top, and report what moved. ' +
        'Use this when the user asks what to focus on, or says their list feels unmanageable.',
      inputSchema: {
        type: 'object',
        properties: {
          strategy: {
            type: 'string',
            enum: ['balanced', 'priority', 'deadline'],
            description:
              'How to weigh the sort. "priority" leads with urgency, "deadline" leads with the ' +
              'due date, "balanced" (the default) blends both.',
          },
        },
      },
      annotations: { title: 'Prioritize tasks', readOnlyHint: false, idempotentHint: true },
      execute: (args = {}) => store.prioritizeTasks(args),
    },

    {
      name: 'clear_completed',
      description: 'Remove every completed task from the board in one step.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { title: 'Clear completed', readOnlyHint: false, destructiveHint: true },
      execute: () => store.clearCompleted(),
    },

    {
      name: 'get_workspace_summary',
      description:
        'Summarise the workspace: counts, completion rate, priority load, what to do next, and ' +
        'a warning when too much is marked high priority. Read-only.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { title: 'Workspace summary', readOnlyHint: true },
      execute: () => store.getSummary(),
    },
  ];
}
