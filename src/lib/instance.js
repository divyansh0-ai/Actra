import { createStore } from './store.js';

/** One workspace per page. Tools and UI share this exact instance. */
export const store = createStore();
