import React from 'react';
import { createRoot } from 'react-dom/client';
import SplunkThemeProvider from '@splunk/themes/SplunkThemeProvider';
import App from './App';
import './App.css';

const container = document.getElementById('graphlens-health-root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      {/* See the matching comment in RelationshipExplorer/index.jsx. */}
      <SplunkThemeProvider family="enterprise" colorScheme="light" density="comfortable">
        <App />
      </SplunkThemeProvider>
    </React.StrictMode>,
  );
}
