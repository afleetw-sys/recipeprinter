import { beforeEach, describe, expect, it } from "vitest";
import { forgetSaveIntent, rememberSaveIntent, takeSaveIntent } from "@/lib/saveIntent";

/* A save that was promised before signing in has to survive signing in — and on
   every phone, signing in destroys the page: `signInWithCookPilotProvider` uses
   `signInWithRedirect` for any coarse pointer, so Google and Apple leave the
   document and come back to a fresh one. The promise therefore cannot live in a
   React ref, which is what it used to be. These assert the two halves of that:
   it survives the trip, and it cannot be spent on anything else. */

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  get length() { return this.values.size; }
}

const memory = new MemoryStorage();

beforeEach(() => {
  memory.clear();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { sessionStorage: memory },
  });
});

const HALF_AN_HOUR = 30 * 60 * 1000;

describe("a save that was waiting for an account", () => {
  it("survives the page being destroyed by a sign-in redirect", () => {
    rememberSaveIntent("book-a");
    // Nothing in memory is carried over; the new document asks storage.
    expect(takeSaveIntent("book-a")).toBe(true);
  });

  it("is spent once, so the save runs once", () => {
    rememberSaveIntent("book-a");
    expect(takeSaveIntent("book-a")).toBe(true);
    expect(takeSaveIntent("book-a")).toBe(false);
  });

  it("is not there when nobody asked", () => {
    expect(takeSaveIntent("book-a")).toBe(false);
  });

  /* Walking away from the sign-in dialog cancels the save that opened it —
     otherwise the next sign-in, for anything, any time later, silently writes
     that project into the account they had just declined to create for it. */
  it("is dropped when the cook walks away from the dialog", () => {
    rememberSaveIntent("book-a");
    forgetSaveIntent();
    expect(takeSaveIntent("book-a")).toBe(false);
  });

  it("is never spent on a different project", () => {
    rememberSaveIntent("book-a");
    expect(takeSaveIntent("book-b")).toBe(false);
    // And it is cleared rather than left to be reconsidered against the next
    // project that comes along.
    expect(takeSaveIntent("book-a")).toBe(false);
  });

  /* Session storage survives reloads, so a promise left in a long-lived tab
     would otherwise be honoured days later against whatever was open then. */
  it("expires, rather than saving on the strength of a forgotten press", () => {
    rememberSaveIntent("book-a");
    const later = Date.now() + HALF_AN_HOUR + 1_000;
    expect(takeSaveIntent("book-a", later)).toBe(false);
  });

  it("still holds across a slow sign-in", () => {
    rememberSaveIntent("book-a");
    expect(takeSaveIntent("book-a", Date.now() + HALF_AN_HOUR - 1_000)).toBe(true);
  });

  /* A working copy that has no id yet is still somebody's press. */
  it("works for a project with no id to check against", () => {
    rememberSaveIntent(undefined);
    expect(takeSaveIntent("book-a")).toBe(true);
  });
});
