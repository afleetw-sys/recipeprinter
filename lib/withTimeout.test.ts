import { afterEach, describe, expect, it, vi } from "vitest";
import { TimeoutError, withTimeout } from "./withTimeout";

afterEach(() => {
  vi.useRealTimers();
});

describe("withTimeout", () => {
  it("passes through a value that arrives in time", async () => {
    await expect(withTimeout(Promise.resolve("projects"), 1000)).resolves.toBe("projects");
  });

  it("passes through a rejection rather than masking it as a timeout", async () => {
    const failure = new Error("permission-denied");
    await expect(withTimeout(Promise.reject(failure), 1000)).rejects.toBe(failure);
  });

  it("rejects a promise that never settles — the case this exists for", async () => {
    vi.useFakeTimers();
    // Never resolves and never rejects: Firestore's `getDocs` against a network
    // that is blocked rather than broken. Without the deadline this await is
    // where a spinner lives forever.
    const forever = new Promise<string>(() => {});
    const raced = withTimeout(forever, 12_000);
    const settled = expect(raced).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(12_000);
    await settled;
  });

  it("does not fire the deadline once the work has settled", async () => {
    vi.useFakeTimers();
    await expect(withTimeout(Promise.resolve("fast"), 5_000)).resolves.toBe("fast");
    // The timer is cleared on settle, so nothing is left pending to fire.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("carries the deadline it blew, so a caller can say how long it waited", async () => {
    vi.useFakeTimers();
    const raced = withTimeout(new Promise<string>(() => {}), 250);
    const settled = raced.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(250);
    const error = await settled;
    expect(error).toBeInstanceOf(TimeoutError);
    expect((error as TimeoutError).ms).toBe(250);
  });
});
