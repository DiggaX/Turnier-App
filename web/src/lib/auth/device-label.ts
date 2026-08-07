/**
 * Naming a signed-in device in the list.
 *
 * Kept apart from device-pairing.ts because that module reaches for node:crypto
 * and this one is rendered in the browser.
 */

/**
 * Condense a user agent into something recognisable. Full UA strings are
 * unreadable and the only question being answered is "which of my phones is
 * this".
 *
 * `null` means the session did not come from a paired device: auth.sessions
 * only ever sees our own server, so there is nothing to name.
 */
export function deviceLabel(userAgent: string | null): string {
  if (!userAgent?.trim()) return "Anmeldung per E-Mail oder Passwort";

  const os =
    /iPhone|iPad/i.test(userAgent) ? "iPhone/iPad"
    : /Android/i.test(userAgent) ? "Android"
    : /Windows/i.test(userAgent) ? "Windows"
    : /Macintosh|Mac OS/i.test(userAgent) ? "Mac"
    : /Linux/i.test(userAgent) ? "Linux"
    : null;

  // Order matters: Edge and Opera both claim Chrome, and Chrome claims Safari.
  const browser =
    /Edg\//i.test(userAgent) ? "Edge"
    : /OPR\//i.test(userAgent) ? "Opera"
    : /Firefox\//i.test(userAgent) ? "Firefox"
    : /Chrome\//i.test(userAgent) ? "Chrome"
    : /Safari\//i.test(userAgent) ? "Safari"
    : null;

  if (os && browser) return `${browser} auf ${os}`;
  return os ?? browser ?? "Unbekanntes Gerät";
}
