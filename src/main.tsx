import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { AppProvider } from './store';
import { App } from './App';

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>,
);
