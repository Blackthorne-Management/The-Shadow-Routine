import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { registerServiceWorker } from './lib/push';
import App from './App';
// Self-hosted (bundled + cached by the service worker) so the app looks the same offline
import '@fontsource-variable/inter-tight';
import './styles.css';

registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
