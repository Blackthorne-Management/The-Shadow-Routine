import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { registerServiceWorker } from './lib/push';
import { applyTheme, watchSystemTheme } from './lib/theme';
import App from './App';
import { Splash } from './components/ui';
// Self-hosted (bundled + cached by the service worker) so the app looks the same offline
import '@fontsource-variable/inter-tight';
import './styles.css';

registerServiceWorker();

applyTheme();
watchSystemTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<Splash />}>
          <App />
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
