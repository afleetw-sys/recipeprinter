/**
 * Client-side id generation.
 *
 * Was three byte-identical copies (lib/queue.ts, lib/project.ts,
 * lib/printProjects.ts). They generate ids for things that reference each
 * other — a project's `sections[].itemIds` point at queue item ids — so any
 * future divergence between the copies would be a collision risk across
 * stores that are joined at render time.
 *
 * `crypto.randomUUID` needs a secure context, which localhost and https both
 * are but an http LAN address (a phone hitting a dev server over Wi-Fi) is
 * not, so the fallback is a real path rather than legacy-browser paranoia.
 */
export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
