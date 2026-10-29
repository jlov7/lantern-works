import '@fontsource/young-serif/400.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './styles/tokens.css';
import './styles/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installGlobalHandlers } from './ui/diagnostics';
import { ErrorBoundary } from './ui/ErrorBoundary';

installGlobalHandlers();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// Production only: a small service worker keeps the game playable offline after the first visit.
// The entry chunk's hashed name versions the worker, so each deploy installs a fresh precache.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const build = new URL(import.meta.url).pathname.split('/').pop() ?? '';
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL(`sw.js?v=${encodeURIComponent(build)}`, document.baseURI)).catch(() => {
      // Offline play is a bonus; the game works the same without it.
    });
  });
}
