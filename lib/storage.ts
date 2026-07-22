/**
 * Safe access to `localStorage` / `sessionStorage`.
 *
 * Every storage call in this app has to survive two things: server-side
 * rendering (no `window` at all) and browsers where the storage APIs exist but
 * throw on use — Safari private mode, and any browser once the origin's quota
 * is full. Before this module, each of the nine storage keys re-implemented
 * that guard inline, and they had quietly drifted: some checked `typeof
 * window`, some didn't; some swallowed write failures, some let them escape.
 *
 * Reads return `null` rather than taking a caller-supplied default on purpose.
 * "Storage is unavailable" does not mean the same thing everywhere here: an
 * unreadable queue means an empty queue, but an unreadable "have we shown the
 * post-print dialog?" flag means *do* show it, and an unreadable "was this user
 * signed in?" flag means assume they were. Baking a default into the helper
 * would flatten those into one answer; `?? fallback` at each call site keeps
 * each decision where its reasoning lives.
 */

export interface SafeStorage {
  /**
   * Whether this storage area can actually be used right now (false during
   * SSR, and in browsers that throw on access).
   *
   * Needed because `get` returning null deliberately conflates "no value
   * stored" with "storage unusable", and a couple of call sites must tell
   * those apart: the CookPilot signed-in hint treats an *absent* key as "not
   * signed in" but an *unreadable* one as "assume signed in", so it doesn't
   * flash a logged-out UI at someone whose session is about to rehydrate.
   */
  available(): boolean;
  /** The stored string, or null if absent, unparseable, or storage is unusable. */
  get(key: string): string | null;
  /** True if the value was actually persisted. */
  set(key: string, value: string): boolean;
  remove(key: string): void;
  /** Parsed JSON, or null if absent/invalid/unusable. Never throws. */
  getJson<T>(key: string): T | null;
  /** True if the value serialized and persisted. */
  setJson(key: string, value: unknown): boolean;
}

function safeStorage(read: () => Storage): SafeStorage {
  // Resolved per call, not once at module load: `typeof window` is false
  // during SSR/prerender, and this module is imported by client components
  // that Next also renders on the server at build time.
  function area(): Storage | null {
    if (typeof window === "undefined") return null;
    try {
      return read();
    } catch {
      return null;
    }
  }

  return {
    available() {
      return area() !== null;
    },
    get(key) {
      try {
        return area()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        const store = area();
        if (!store) return false;
        store.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      try {
        area()?.removeItem(key);
      } catch {
        /* Nothing to do — the value is already effectively gone. */
      }
    },
    getJson<T>(key: string): T | null {
      const raw = this.get(key);
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    setJson(key, value) {
      try {
        return this.set(key, JSON.stringify(value));
      } catch {
        // JSON.stringify itself throws on circular structures and BigInt.
        return false;
      }
    },
  };
}

export const localStore = safeStorage(() => window.localStorage);
export const sessionStore = safeStorage(() => window.sessionStorage);
