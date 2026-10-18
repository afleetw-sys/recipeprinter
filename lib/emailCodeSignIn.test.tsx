// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The emailed-code sign-in form. Reported 2026-10-18 on a password account:
 * going to "Use my password instead" and back with "Email me a code instead"
 * mailed a second code, which replaced the first, so the code in the first
 * email (still valid) was refused; and the refusal then vanished from the
 * screen without a second try reaching the server.
 */

const { sendEmailCode, verifyEmailCode } = vi.hoisted(() => ({
  sendEmailCode: vi.fn(),
  verifyEmailCode: vi.fn(),
}));

vi.mock("@/lib/emailCode", async () => {
  const pending = await import("@/lib/emailCodePending");
  return {
    ...pending,
    normalizeEmail: (email: string) => email.trim().toLowerCase(),
    sendEmailCode,
    verifyEmailCode,
  };
});
vi.mock("@/lib/firebase/client", () => ({
  getFirebaseAuth: () => ({ currentUser: null, authStateReady: () => Promise.resolve() }),
  firebaseConfigured: () => true,
}));
vi.mock("@/lib/firebase/functions", () => ({ getFns: () => ({}) }));
vi.mock("@/lib/firebase/recipePrinterAccount", () => ({ ensureRecipePrinterAccount: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn(), syncAnalyticsIdentity: vi.fn() }));
vi.mock("firebase/auth", () => {
  class Provider {
    static PROVIDER_ID = "google.com";
    addScope() {}
  }
  return {
    GoogleAuthProvider: Provider,
    OAuthProvider: Provider,
    browserPopupRedirectResolver: {},
    sendPasswordResetEmail: vi.fn(),
    getRedirectResult: vi.fn(),
    onAuthStateChanged: vi.fn(() => () => {}),
    signInWithCustomToken: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    signInWithPopup: vi.fn(),
    signInWithRedirect: vi.fn(),
  };
});

import { CookPilotLoginForm } from "@/components/CookPilotAuth";

let now = Date.parse("2026-10-18T12:18:57Z");

beforeEach(() => {
  now = Date.parse("2026-10-18T12:18:57Z");
  vi.spyOn(Date, "now").mockImplementation(() => now);
  sessionStorage.clear();
  sendEmailCode.mockReset().mockResolvedValue({ status: "sent", hasPassword: true });
  verifyEmailCode.mockReset().mockResolvedValue({ status: "wrong", attemptsLeft: 4 });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const codeField = () => screen.getByRole("textbox", { name: /6-digit code/ });

describe("email code sign-in, password account", () => {
  it("keeps the first code working when they visit the password step and come back, and keeps a refusal on screen", async () => {
    render(<CookPilotLoginForm onAuthenticated={() => {}} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), { target: { value: "cook@example.com" } });
    fireEvent.submit(screen.getByRole("textbox", { name: "Email" }).closest("form")!);
    await waitFor(() => codeField());
    expect(sendEmailCode).toHaveBeenCalledTimes(1);

    // Every gap a cook might take on the password step, all within the code's 10 minutes.
    for (const awayMs of [5_000, 49_000, 9 * 60_000]) {
      fireEvent.click(screen.getByRole("button", { name: "Use my password instead" }));
      now += awayMs;
      fireEvent.click(screen.getByRole("button", { name: "Email me a code instead" }));
      await waitFor(() => codeField());
      expect(sendEmailCode).toHaveBeenCalledTimes(1);
      now -= awayMs;
    }

    // A refused code stays refused on screen until they change the digits.
    await act(async () => {
      fireEvent.change(codeField(), { target: { value: "856980" } });
    });
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    fireEvent.change(codeField(), { target: { value: "" } });
    fireEvent.change(codeField(), { target: { value: "abc" } });
    expect(screen.queryByRole("alert")).not.toBeNull();
    fireEvent.change(codeField(), { target: { value: "3" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
