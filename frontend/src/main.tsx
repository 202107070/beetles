import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { EyeMonitorProvider } from './monitoring/EyeMonitorContext';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <EyeMonitorProvider>
      <App />
    </EyeMonitorProvider>
  </React.StrictMode>,
);
