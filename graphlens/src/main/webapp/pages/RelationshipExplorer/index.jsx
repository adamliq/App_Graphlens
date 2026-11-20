import React from 'react';
import { createRoot } from 'react-dom/client';
import SplunkThemeProvider from '@splunk/themes/SplunkThemeProvider';
import App from './App';
import './App.css';

const container = document.getElementById('graphlens-relationship-explorer-root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      {/* Without this, @splunk/react-ui components fall back to this
          library's own default theme (prisma/dark) instead of the
          enterprise/light theme GraphLens's own CSS assumes - confirmed
          against a live instance as the cause of near-invisible toolbar
          button text (white-on-white). See CHANGELOG.md and
          ARCHITECTURE.md. */}
      <SplunkThemeProvider family="enterprise" colorScheme="light" density="comfortable">
        <App />
      </SplunkThemeProvider>
    </React.StrictMode>,
  );
}
