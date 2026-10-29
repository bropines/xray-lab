import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initTheme } from './app/theme';
import { TooltipProvider } from './components/ui';

initTheme();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </StrictMode>,
);
