import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// No StrictMode: its double-invoked effects would register every WebMCP tool
// twice, and registerTool rejects duplicate names.
createRoot(document.getElementById('root')).render(<App />);
