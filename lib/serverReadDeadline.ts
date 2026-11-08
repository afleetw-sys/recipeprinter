/**
 * How long a read the cook is waiting on may take before it counts as failed.
 *
 * Firestore only rejects a server read once it has decided it is offline (its
 * own verdict comes after 10 seconds without a connection). A connection that
 * stops answering while still looking open never gets that verdict, so the read
 * simply never settles. That is what a Mac Safari tab left open for an hour did
 * to /projects on 2026-11-08: "Loading projects…" forever, no error, no Try
 * again, and a reload (a brand-new connection) loaded the list in 50 ms.
 *
 * Longer than Firestore's own offline verdict, so a read Firestore would fail
 * by itself still fails the way it always has.
 */
export const SERVER_READ_DEADLINE_MS = 15_000;

/**
 * `read`, or a rejection once the deadline passes. `onTimeout` runs on a miss,
 * which is where the caller restarts the stuck connection so the next attempt
 * (Try again) gets a fresh one instead of the same silence.
 */
export function withServerReadDeadline<T>(
  read: Promise<T>,
  onTimeout: () => void,
  ms: number = SERVER_READ_DEADLINE_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(new Error("The server didn't answer in time."));
    }, ms);
    read.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
