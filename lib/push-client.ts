// lib/push-client.ts
// Browser-side helper for Web Push. Three operations:
//   - subscribe(): registers SW + subscribes to PushManager + POSTs to API
//   - unsubscribe(): tears down the subscription
//   - getPermission(): probes current Notification permission state
//
// Designed to fail-soft: any unsupported browser / network error returns
// a friendly { ok: false, reason } so the UI can show a clear toast.

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = typeof window !== 'undefined' ? window.atob(b64) : '';
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushResult = { ok: true } | { ok: false; reason: string };

/** Returns the current Notification permission ("granted" | "denied" | "default"
 *  | "unsupported"). Safe to call from any context. */
export function getPushPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/** Subscribes the current device to Web Push. Returns ok=true if a subscription
 *  was created (or already existed) and successfully POSTed to the server.
 *
 *  `state` is a snapshot of the user's fridge / household — stored alongside
 *  the subscription so the server-side cron + test push can build personalised
 *  notifications even for guest users (whose state never syncs to user_app_state). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function subscribePush(args: {
  userId?: string;
  notifTimes?: Record<string, string>;
  timezone?: string;
  state?: Record<string, any>;
}): Promise<PushResult> {
  if (typeof window === 'undefined') return { ok: false, reason: 'no-window' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'unsupported' };
  }
  if (!VAPID_PUBLIC_KEY) return { ok: false, reason: 'no-vapid-key' };

  // 1. Permission
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: `permission-${perm}` };

  // 2. Ensure SW registration. If layout's eager register already ran, we'll
  // pick it up. If not (race condition / first-visit), register here. Then
  // wait for the SW to reach the active state with a 5s timeout — bare
  // `serviceWorker.ready` hangs forever when no registration exists, which
  // is what was silently breaking the earlier flow.
  let reg = await navigator.serviceWorker.getRegistration();
  if (!reg) {
    try {
      reg = await navigator.serviceWorker.register('/sw.js');
    } catch (e) {
      return { ok: false, reason: 'sw-register-failed:' + (e instanceof Error ? e.message : 'unknown') };
    }
  }
  if (!reg.active) {
    const readyOrTimeout = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>(resolve => setTimeout(() => resolve(null), 5000)),
    ]);
    if (!readyOrTimeout) return { ok: false, reason: 'sw-not-active' };
    reg = readyOrTimeout as ServiceWorkerRegistration;
  }

  // 3. Reuse existing subscription if present, else create new.
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    // Cast to BufferSource — TS lib types changed between versions to make
    // ArrayBufferLike non-assignable; the runtime contract is unchanged.
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
    });
  }

  // 4. Send subscription + prefs to the server. The server stores it keyed
  // by endpoint so duplicates auto-dedupe.
  try {
    const res = await fetch('/api/push-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        userId: args.userId || null,
        notifTimes: args.notifTimes || {},
        timezone: args.timezone || (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'),
        state: args.state || {},
      }),
    });
    if (!res.ok) return { ok: false, reason: `server-${res.status}` };
  } catch {
    return { ok: false, reason: 'server-network' };
  }

  return { ok: true };
}

/** Returns the current PushSubscription endpoint URL if one exists, else null. */
export async function getCurrentPushEndpoint(): Promise<string | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub?.endpoint ?? null;
  } catch {
    return null;
  }
}

/** Sends a test push to the current device — useful for the "Send test
 *  notification" button so users can verify end-to-end that push works.
 *  Returns the preview payload (title + body) so the UI can show the user
 *  exactly what the server is sending. */
export type TestPushResult =
  | { ok: true; preview?: { title: string; body: string } }
  | { ok: false; reason: string };

export async function sendTestPush(): Promise<TestPushResult> {
  const endpoint = await getCurrentPushEndpoint();
  if (!endpoint) return { ok: false, reason: 'no-subscription' };
  try {
    const res = await fetch('/api/push-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    });
    if (!res.ok) return { ok: false, reason: `server-${res.status}` };
    const data = await res.json().catch(() => ({}));
    return { ok: true, preview: data.preview };
  } catch {
    return { ok: false, reason: 'server-network' };
  }
}

/** True iff the device is iOS Safari running in a non-installed (browser tab)
 *  context. iOS only supports Web Push when the site is added to the home
 *  screen, so we surface a friendly hint instead of a confusing failure. */
export function isIOSSafariBrowserTab(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  if (!isIOS) return false;
  const standalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true
    || window.matchMedia?.('(display-mode: standalone)').matches;
  return !standalone;
}

/** Diagnostic snapshot for debugging push problems. Shows what's actually
 *  going on under the hood — service worker state, permission, subscription. */
export async function getPushDiagnostics(): Promise<{
  supportsServiceWorker: boolean;
  supportsPushManager: boolean;
  notificationPermission: string;
  serviceWorkerActive: boolean;
  hasSubscription: boolean;
  endpoint: string | null;
  isIOS: boolean;
  isPWAInstalled: boolean;
  vapidConfigured: boolean;
  userAgent: string;
}> {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const standalone = (typeof window !== 'undefined' &&
    ((window.navigator as unknown as { standalone?: boolean }).standalone === true
      || window.matchMedia?.('(display-mode: standalone)').matches)) || false;

  const supportsServiceWorker = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const supportsPushManager = typeof window !== 'undefined' && 'PushManager' in window;
  const notificationPermission = typeof window !== 'undefined' && 'Notification' in window
    ? Notification.permission : 'unsupported';
  const vapidConfigured = !!VAPID_PUBLIC_KEY;

  let serviceWorkerActive = false;
  let hasSubscription = false;
  let endpoint: string | null = null;

  if (supportsServiceWorker) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      serviceWorkerActive = !!reg?.active;
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        hasSubscription = !!sub;
        endpoint = sub?.endpoint ?? null;
      }
    } catch {
      // ignore
    }
  }

  return {
    supportsServiceWorker,
    supportsPushManager,
    notificationPermission,
    serviceWorkerActive,
    hasSubscription,
    endpoint,
    isIOS,
    isPWAInstalled: standalone,
    vapidConfigured,
    userAgent: ua,
  };
}

/** Unsubscribes the device. Tells the server to forget this endpoint too. */
export async function unsubscribePush(): Promise<PushResult> {
  if (typeof window === 'undefined') return { ok: false, reason: 'no-window' };
  if (!('serviceWorker' in navigator)) return { ok: false, reason: 'unsupported' };
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return { ok: true };
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await fetch('/api/push-subscription', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    }).catch(() => {});
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'unknown' };
  }
}
