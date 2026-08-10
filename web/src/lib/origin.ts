import { headers } from "next/headers";

/**
 * Read the request origin (scheme + host) for building absolute redirect URLs.
 *
 * Lives here rather than next to the auth actions that use it: those files carry
 * `"use server"`, where every export becomes a callable server action. A helper
 * exported from there would be a public endpoint for no reason.
 */
export async function getOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  // Fall back to forwarded headers (proxies) or the host header.
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}
