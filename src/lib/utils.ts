import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes, resolving conflicts in favour of the last value. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * A local unique key, safe on every browser the counter actually runs.
 *
 * `crypto.randomUUID()` exists only in a *secure context*: HTTPS, or localhost.
 * Anywhere else — a terminal reached over plain HTTP on the warehouse LAN, an
 * IP address rather than a hostname, an older WebView — the property is simply
 * absent and calling it throws `crypto.randomUUID is not a function`. When that
 * happens inside a `useState` initialiser it throws during the first render,
 * before anything is on screen, so the whole route is replaced by the error
 * boundary: the operator sees "An unexpected error occurred" and never reaches
 * the form. That is device-dependent by nature, which is why it strikes some
 * machines and never others.
 *
 * These identifiers are React list keys for unsaved draft lines. They never
 * leave the browser and the server assigns the real ones, so uniqueness within
 * the page is the only requirement and `Math.random` fully satisfies it.
 */
export function localId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
