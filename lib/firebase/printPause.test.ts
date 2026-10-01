import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `pauseFirestoreForPrint` / `resumeFirestoreAfterPrint` (lib/firebase/db.ts):
 * Firestore's connection closed for the moment Safari's `print()` needs the
 * page quiet, and reopened as soon as the print is under way. See
 * e2e/quiet-print.spec.ts for why.
 */

const firestore = vi.hoisted(() => ({
  disableNetwork: vi.fn(() => Promise.resolve()),
  enableNetwork: vi.fn(() => Promise.resolve()),
  getFirestore: vi.fn(() => ({ fake: "db" })),
  connectFirestoreEmulator: vi.fn(),
}));
vi.mock("firebase/firestore", () => firestore);
vi.mock("./client", () => ({ getFirebaseApp: () => ({}) }));

type Db = typeof import("./db");

/** A fresh module each time: the pause state is module-level. */
async function load(started = true): Promise<Db> {
  vi.resetModules();
  const db = await import("./db");
  if (started) db.getDb();
  return db;
}

beforeEach(() => {
  vi.useFakeTimers();
  firestore.disableNetwork.mockClear();
  firestore.enableNetwork.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("pausing Firestore for a print", () => {
  it("never starts Firestore just to close it", async () => {
    const db = await load(false);
    db.pauseFirestoreForPrint();
    db.resumeFirestoreAfterPrint();
    vi.runAllTimers();
    expect(firestore.getFirestore).not.toHaveBeenCalled();
    expect(firestore.disableNetwork).not.toHaveBeenCalled();
    expect(firestore.enableNetwork).not.toHaveBeenCalled();
  });

  it("closes synchronously, so print() can follow in the same click", async () => {
    const db = await load();
    db.pauseFirestoreForPrint();
    expect(firestore.disableNetwork).toHaveBeenCalledTimes(1);
  });

  it("closes once however often it is asked", async () => {
    const db = await load();
    db.pauseFirestoreForPrint(); // pointerdown
    db.pauseFirestoreForPrint(); // printNow
    expect(firestore.disableNetwork).toHaveBeenCalledTimes(1);
  });

  it("reopens a task after resume, once", async () => {
    const db = await load();
    db.pauseFirestoreForPrint();
    db.resumeFirestoreAfterPrint();
    db.resumeFirestoreAfterPrint();
    expect(firestore.enableNetwork).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(firestore.enableNetwork).toHaveBeenCalledTimes(1);
  });

  it("a click that prints keeps it closed: resume then pause in one task", async () => {
    const db = await load();
    db.pauseFirestoreForPrint(); // pointerdown
    db.resumeFirestoreAfterPrint(); // handlePrint lets go of the press
    db.pauseFirestoreForPrint(); // printNow, same task
    vi.advanceTimersByTime(0);
    expect(firestore.enableNetwork).not.toHaveBeenCalled();
    expect(firestore.disableNetwork).toHaveBeenCalledTimes(1);
  });

  it("reopens by itself after 10 seconds if no print ever starts", async () => {
    const db = await load();
    db.pauseFirestoreForPrint();
    vi.advanceTimersByTime(9_999);
    expect(firestore.enableNetwork).not.toHaveBeenCalled();
    // The cap asks for the usual one-task-later reopen; a fake clock runs a
    // zero-delay timer set inside another timer a millisecond on.
    vi.advanceTimersByTime(5);
    expect(firestore.enableNetwork).toHaveBeenCalledTimes(1);
  });

  it("a second press restarts the 10 seconds", async () => {
    const db = await load();
    db.pauseFirestoreForPrint();
    vi.advanceTimersByTime(8_000);
    db.pauseFirestoreForPrint();
    vi.advanceTimersByTime(8_000);
    expect(firestore.enableNetwork).not.toHaveBeenCalled();
  });

  it("resume with nothing paused does nothing", async () => {
    const db = await load();
    db.resumeFirestoreAfterPrint();
    vi.runAllTimers();
    expect(firestore.enableNetwork).not.toHaveBeenCalled();
  });

  it("can pause again after a full round", async () => {
    const db = await load();
    db.pauseFirestoreForPrint();
    db.resumeFirestoreAfterPrint();
    vi.advanceTimersByTime(0);
    db.pauseFirestoreForPrint();
    expect(firestore.disableNetwork).toHaveBeenCalledTimes(2);
  });
});
