// PWA install + Web Push helpers. iOS only allows push for apps added to the
// Home Screen (iOS 16.4+), and the permission prompt must follow a tap.

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** iOS Safari tabs can't receive push; the app must be installed first. */
export const needsInstallForPush = () => isIOS() && !isStandalone();

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    // An installed app can sit open in the background for days. When it comes
    // back to the front, check for a new deploy; if one took over while it was
    // away, reload so nobody keeps running an old version.
    let hadController = !!navigator.serviceWorker.controller;
    let updated = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) updated = true;
      hadController = true;
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (updated) { location.reload(); return; }
      reg.update().catch(() => {});
    });
  } catch (e) {
    console.warn('Service worker registration failed', e);
  }
}

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Must be called from a click handler. Returns the subscription JSON to store. */
export async function subscribeToPush(): Promise<PushSubscriptionJSON> {
  const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!vapid) throw new Error('Push is not configured (missing VAPID key).');
  if (!pushSupported()) throw new Error('This browser does not support push notifications.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications were not allowed. You can enable them in Settings for this app.');

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapid),
  });
  return sub.toJSON();
}

export async function unsubscribeFromPush() {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  await sub?.unsubscribe();
}

/** Local notification to confirm permission works on this device. */
export async function showTestNotification() {
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification('The Shadow Routine', {
    body: "Notifications are working. We'll remind you at your chosen time.",
    icon: '/icons/icon-192.png',
    tag: 'test',
  });
}
