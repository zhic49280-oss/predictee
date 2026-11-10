import { Buffer } from 'buffer';

const g = globalThis as unknown as {
  Buffer?: typeof Buffer;
  global?: typeof globalThis;
  process?: { env: Record<string, string> };
};
if (typeof g.Buffer === 'undefined') g.Buffer = Buffer;
if (typeof g.global === 'undefined') g.global = globalThis;
if (typeof g.process === 'undefined') g.process = { env: {} };

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
