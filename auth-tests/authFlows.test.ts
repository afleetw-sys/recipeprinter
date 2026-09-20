import { deleteUser, connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInAnonymously, signInWithEmailAndPassword, signOut, type Auth } from "firebase/auth";
import { initializeApp } from "firebase/app";
import { beforeAll, describe, expect, it } from "vitest";
import { purgeAnonymousUser } from "@/lib/anonymousSession";
import { createAccountOrRecover } from "@/lib/signUpRecovery";

/**
 * The sign-in failures that only exist against a real Firebase Auth, so a mock
 * would only be agreeing with us. Each one was found by hand first; these keep them
 * from coming back.
 */

const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
let appCount = 0;

// A fresh app and Auth per test: nothing carries over between them, the way a page
// load is a fresh document.
function freshAuth(): Auth {
  const app = initializeApp({ apiKey: "demo-key", projectId: "demo-recipeprinter" }, `t${appCount++}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${host}`, { disableWarnings: true });
  return auth;
}

let emailCount = 0;
const uniqueEmail = () => `person${Date.now()}-${emailCount++}@example.com`;
const PASSWORD = "correct horse battery";

beforeAll(() => {
  if (!host) throw new Error("Run this through `npm run test:auth`, which starts the Auth emulator.");
});

describe("the anonymous cleanup", () => {
  it("SDK behaviour we guard against: deleting an anonymous user signs out whoever is current", async () => {
    // Characterization, not a wish. `User.delete()` ends in `auth.signOut()`. If a
    // later SDK stops doing this the guard below becomes redundant, not wrong.
    const auth = freshAuth();
    const { user: anonymous } = await signInAnonymously(auth);
    await createUserWithEmailAndPassword(auth, uniqueEmail(), PASSWORD);
    expect(auth.currentUser?.isAnonymous).toBe(false);

    await deleteUser(anonymous);

    expect(auth.currentUser).toBeNull();
  });

  it("leaves a real account signed in when a late cleanup lands on it", async () => {
    const auth = freshAuth();
    const email = uniqueEmail();
    const { user: anonymous } = await signInAnonymously(auth);
    await createUserWithEmailAndPassword(auth, email, PASSWORD);

    await purgeAnonymousUser(auth, anonymous);

    expect(auth.currentUser?.email).toBe(email);
  });

  it("still removes an anonymous session that is the one signed in", async () => {
    const auth = freshAuth();
    const { user: anonymous } = await signInAnonymously(auth);

    await purgeAnonymousUser(auth, anonymous);

    expect(auth.currentUser).toBeNull();
  });
});

describe("creating an account", () => {
  const deps = (auth: Auth, email: string) => ({
    create: () => createUserWithEmailAndPassword(auth, email, PASSWORD),
    signIn: () => signInWithEmailAndPassword(auth, email, PASSWORD),
    currentUserEmail: () => (auth.currentUser?.isAnonymous ? null : auth.currentUser?.email),
  });

  it("creates a new account", async () => {
    const auth = freshAuth();
    const email = uniqueEmail();
    await expect(createAccountOrRecover(deps(auth, email), email)).resolves.toBe("created");
    expect(auth.currentUser?.email).toBe(email);
  });

  it("counts a second press as success when the first one already signed us in", async () => {
    const auth = freshAuth();
    const email = uniqueEmail();
    await createAccountOrRecover(deps(auth, email), email);

    await expect(createAccountOrRecover(deps(auth, email), email)).resolves.toBe("already-signed-in");
  });

  it("signs a returning person in with the password they typed instead of refusing them", async () => {
    const auth = freshAuth();
    const email = uniqueEmail();
    await createAccountOrRecover(deps(auth, email), email);
    await signOut(auth);

    await expect(createAccountOrRecover(deps(auth, email), email)).resolves.toBe("signed-in-existing");
    expect(auth.currentUser?.email).toBe(email);
  });

  it("only reports 'already in use' when the password is not theirs", async () => {
    const auth = freshAuth();
    const email = uniqueEmail();
    await createAccountOrRecover(deps(auth, email), email);
    await signOut(auth);

    const wrong = {
      ...deps(auth, email),
      create: () => createUserWithEmailAndPassword(auth, email, "a different password"),
      signIn: () => signInWithEmailAndPassword(auth, email, "a different password"),
    };
    await expect(createAccountOrRecover(wrong, email)).rejects.toMatchObject({ code: "auth/email-already-in-use" });
  });
});

describe("the reported bug, end to end", () => {
  it("does not refuse the account someone just made after a late cleanup", async () => {
    // Anonymous session for the email check, the account is created, the cleanup
    // lands late, and the person presses Create again.
    const auth = freshAuth();
    const email = uniqueEmail();
    const { user: anonymous } = await signInAnonymously(auth);
    await createUserWithEmailAndPassword(auth, email, PASSWORD);
    await purgeAnonymousUser(auth, anonymous);

    const outcome = await createAccountOrRecover(
      {
        create: () => createUserWithEmailAndPassword(auth, email, PASSWORD),
        signIn: () => signInWithEmailAndPassword(auth, email, PASSWORD),
        currentUserEmail: () => auth.currentUser?.email,
      },
      email,
    );

    expect(outcome).toBe("already-signed-in");
    expect(auth.currentUser?.email).toBe(email);
  });
});
