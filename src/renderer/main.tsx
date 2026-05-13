import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import AppErrorBoundary from './shared/components/AppErrorBoundary';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root was not found.');
}

const root = createRoot(rootElement);

root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
