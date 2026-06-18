export interface InviteStatus {
  expiresAt: string;
  acceptedAt: string | null;
}

/** Usable = not yet accepted and not past its expiry, relative to `now`. */
export function isInviteUsable(inv: InviteStatus, now: Date): boolean {
  if (inv.acceptedAt) return false;
  return new Date(inv.expiresAt).getTime() > now.getTime();
}

/** The shareable signup URL that redeems an invite code. */
export function buildInviteUrl(origin: string, code: string): string {
  return `${origin}/signup?invite=${encodeURIComponent(code)}`;
}
