import "server-only";

import webpush from "web-push";

/** A stored browser push subscription (DB shape -> web-push shape). */
export interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

let configured = false;

/** Configure web-push from env once. Returns false if VAPID keys are missing. */
export function isPushConfigured(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) return false;
  if (!configured) {
    webpush.setVapidDetails(subject, pub, priv);
    configured = true;
  }
  return true;
}

/**
 * Send one push. Resolves `{ ok: true }` on success, `{ ok: false, gone: true }`
 * when the subscription is expired/invalid (HTTP 404/410 — caller should delete
 * it), or `{ ok: false }` for any other error.
 */
export async function sendPush(
  sub: StoredSubscription,
  payload: PushPayload,
): Promise<{ ok: boolean; gone?: boolean }> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    );
    return { ok: true };
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return { ok: false, gone: true };
    return { ok: false };
  }
}
