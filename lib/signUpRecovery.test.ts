import { describe, expect, it, vi } from "vitest";
import { createAccountOrRecover, isEmailInUseError } from "@/lib/signUpRecovery";

const inUse = Object.assign(new Error("in use"), { code: "auth/email-already-in-use" });
const wrongPassword = Object.assign(new Error("bad"), { code: "auth/invalid-credential" });

function deps(overrides: Partial<Parameters<typeof createAccountOrRecover>[0]> = {}) {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    signIn: vi.fn().mockResolvedValue(undefined),
    currentUserEmail: vi.fn().mockReturnValue(null),
    ...overrides,
  };
}

describe("creating an account", () => {
  it("creates it and does nothing else when that works", async () => {
    const d = deps();
    await expect(createAccountOrRecover(d, "a@b.co")).resolves.toBe("created");
    expect(d.signIn).not.toHaveBeenCalled();
  });

  it("counts a refusal as success when the earlier call already signed us in", async () => {
    // The second press after the first one worked: the account is the one just made.
    const d = deps({
      create: vi.fn().mockRejectedValue(inUse),
      currentUserEmail: vi.fn().mockReturnValue("A@B.co"),
    });
    await expect(createAccountOrRecover(d, "a@b.co")).resolves.toBe("already-signed-in");
    expect(d.signIn).not.toHaveBeenCalled();
  });

  it("signs in with the same password when the account exists and it opens it", async () => {
    const d = deps({ create: vi.fn().mockRejectedValue(inUse) });
    await expect(createAccountOrRecover(d, "a@b.co")).resolves.toBe("signed-in-existing");
    expect(d.signIn).toHaveBeenCalledOnce();
  });

  it("reports the original refusal, not the sign-in failure, when the password is not theirs", async () => {
    const d = deps({
      create: vi.fn().mockRejectedValue(inUse),
      signIn: vi.fn().mockRejectedValue(wrongPassword),
    });
    await expect(createAccountOrRecover(d, "a@b.co")).rejects.toBe(inUse);
  });

  it("does not try to sign in for any other failure", async () => {
    const weak = Object.assign(new Error("weak"), { code: "auth/weak-password" });
    const d = deps({ create: vi.fn().mockRejectedValue(weak) });
    await expect(createAccountOrRecover(d, "a@b.co")).rejects.toBe(weak);
    expect(d.signIn).not.toHaveBeenCalled();
  });
});

describe("recognising a refusal", () => {
  it("matches on the Firebase code only", () => {
    expect(isEmailInUseError(inUse)).toBe(true);
    expect(isEmailInUseError(wrongPassword)).toBe(false);
    expect(isEmailInUseError(new Error("email-already-in-use"))).toBe(false);
    expect(isEmailInUseError(null)).toBe(false);
  });
});
