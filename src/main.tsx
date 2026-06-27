import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

function isCrossOriginScriptError(message: string, source?: string): boolean {
  const normalized = (message || '').trim();
  return (
    normalized === 'Script error.' ||
    normalized === 'Script error' ||
    (!source && normalized === '')
  );
}

window.addEventListener('error', (event) => {
  if (isCrossOriginScriptError(event.message, event.filename)) {
    console.warn(
      '[TraceLink] Cross-origin script error — browser hides details due to CORS policy.',
      {
        source: event.filename || '(unknown origin)',
        line: event.lineno,
        col: event.colno,
        hint: 'This is typically a third-party script, not a React/framework bug.',
      },
    );
    return;
  }

  console.error('[TraceLink] Uncaught application error:', {
    message: event.message,
    source: event.filename,
    line: event.lineno,
    col: event.colno,
    stack: event.error instanceof Error ? event.error.stack : event.error,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  console.error('[TraceLink] Unhandled promise rejection:', {
    reason,
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
