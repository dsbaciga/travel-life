import { createRoot } from 'react-dom/client'
import { Workbox } from 'workbox-window'
import './index.css'
import App from './App.tsx'

declare global {
  interface Window {
    workbox?: Workbox;
  }
}

// Dark is the default, but the user's stored choice wins. Applied here, before
// React mounts, so there is no light-to-dark flash on first paint. themeStore
// re-applies the same value on rehydration; both must agree or the Appearance
// toggle in Settings reads the opposite of what is on screen.
{
  let storedTheme: string | null = null;
  try {
    const raw = localStorage.getItem('theme-storage');
    if (raw) storedTheme = JSON.parse(raw)?.state?.theme ?? null;
  } catch {
    // Unparseable or unavailable storage: fall through to the dark default.
  }
  const isDark = storedTheme !== 'light';
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
}

// Register service worker for PWA functionality
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  const wb = new Workbox('/sw.js');

  // Event fired when a new service worker has installed but is waiting to activate
  wb.addEventListener('waiting', () => {
    console.log('[SW] New service worker waiting to activate');
    // Dispatch a custom event that components can listen for
    window.dispatchEvent(new CustomEvent('sw-waiting', { detail: wb }));
  });

  // Event fired when the service worker has taken control
  wb.addEventListener('controlling', () => {
    console.log('[SW] Service worker now controlling the page');
    // Reload only if there was a previous controller (meaning this is an update)
    if (navigator.serviceWorker.controller) {
      window.location.reload();
    }
  });

  // Event fired when the service worker is activated
  wb.addEventListener('activated', (event) => {
    if (event.isUpdate) {
      console.log('[SW] Service worker updated');
    } else {
      console.log('[SW] Service worker activated for the first time');
    }
  });

  // Event fired if there's an error during registration
  wb.addEventListener('redundant', () => {
    console.warn('[SW] Service worker became redundant');
  });

  // Register the service worker
  wb.register()
    .then((registration) => {
      console.log('[SW] Service worker registered:', registration);
    })
    .catch((error) => {
      console.error('[SW] Service worker registration failed:', error);
    });

  // Expose the workbox instance globally for components to use
  window.workbox = wb;
}

createRoot(document.getElementById('root')!).render(
  <App />
)
