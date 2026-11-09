import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider } from './store';
import App from './App';
import './styles/index.css';
import { initPwa } from './mobile/pwa';

initPwa();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider><App /></AppProvider>
  </StrictMode>
);
