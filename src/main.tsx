import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// DevSecOps / Web Developer Error & WebSocket Filter
// Intercepts and mitigates benign Vite WebSocket disconnection events in container sandboxes
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = (reason && (reason.message || reason.stack || String(reason))) || '';
    if (
      msg.includes('WebSocket closed without opened') ||
      msg.includes('failed to connect to websocket') ||
      msg.includes('WebSocket connection') ||
      (reason && reason.name === 'ViteError')
    ) {
      event.preventDefault();
      event.stopPropagation();
      console.debug('[DevSecOps] Handled Vite sandbox WebSocket reconnection safely.');
    }
  });

  window.addEventListener('error', (event) => {
    const msg = (event && (event.message || '')) || '';
    if (
      msg.includes('WebSocket closed without opened') ||
      msg.includes('failed to connect to websocket')
    ) {
      event.preventDefault();
      event.stopPropagation();
      console.debug('[DevSecOps] Handled Vite WebSocket runtime notice safely.');
    }
  });
}

// Find mount container safely
const mountElement = document.getElementById('chatbot-root') || document.getElementById('root');

if (mountElement) {
  createRoot(mountElement).render(
    <StrictMode>
      <ErrorBoundary fallbackTitle="Asisten Hukum HTS & Partners AI">
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}
