// A stand-in for CookPilot's emailed sign-in codes (recipePrinterEmailCodeSend /
// recipePrinterEmailCodeVerify), for the browser tests and the local referral preview.
// Nothing is emailed: the code is printed, and `GET /last-code?email=` returns it.
//
// Accounts are real ones in the Auth emulator, made and read through its admin API
// (the `owner` token), and the token handed back is an unsigned custom token, which
// the emulator accepts. Like the real callables:
//   - an address with no account gets one, verified, when its code is checked;
//   - an existing account is marked verified;
//   - `hasPassword` says whether "Use my password instead" applies;
//   - five wrong tries spend a code, and a code lasts 10 minutes.
// An email starting "verify" that has no account yet is first made as an UNVERIFIED
// password account (password VERIFY_PASSWORD), so the referral's "confirm your email"
// step can be seen: sign in with the password, then confirm by code.

export const VERIFY_PASSWORD = "verify-password";
const TTL_MS = 10 * 60 * 1000;

export function emailCodeStandIn({ authHost, projectId }) {
  const base = `http://${authHost}/identitytoolkit.googleapis.com/v1/projects/${projectId}`;
  const codes = new Map(); // email -> { code, tries, sentAtMs }

  async function admin(path, body) {
    const response = await fetch(`${base}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer owner" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`auth emulator ${path}: ${response.status} ${await response.text()}`);
    return response.json();
  }

  const lookup = async (email) => (await admin("accounts:lookup", { email: [email] })).users?.[0] ?? null;

  function customToken(uid) {
    const part = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    return `${part({ alg: "none", typ: "JWT" })}.${part({
      aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
      iat: now,
      exp: now + 3600,
      iss: "stand-in@example.test",
      sub: "stand-in@example.test",
      uid,
    })}.`;
  }

  async function sendCode(data) {
    const email = String(data.email ?? "").trim().toLowerCase();
    let user = await lookup(email);
    if (!user && email.startsWith("verify")) {
      await admin("accounts", { email, password: VERIFY_PASSWORD, emailVerified: false });
      user = await lookup(email);
    }
    const providers = (user?.providerUserInfo ?? []).map((p) => p.providerId);
    const hasPassword = providers.includes("password") || Boolean(user?.passwordHash);
    if (!hasPassword && providers.includes("google.com")) return { status: "use_provider", provider: "google" };
    const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
    codes.set(email, { code, tries: 0, sentAtMs: Date.now() });
    console.log(`sign-in code for ${email}: ${code}`);
    return { status: "sent", hasPassword };
  }

  async function verifyCode(data) {
    const email = String(data.email ?? "").trim().toLowerCase();
    const entry = codes.get(email);
    if (!entry || Date.now() - entry.sentAtMs > TTL_MS) return { status: "expired" };
    if (entry.tries >= 5) return { status: "locked" };
    if (String(data.code) !== entry.code) {
      entry.tries += 1;
      return entry.tries >= 5 ? { status: "locked" } : { status: "wrong", attemptsLeft: 5 - entry.tries };
    }
    codes.delete(email);
    let user = await lookup(email);
    const created = !user;
    if (!user) {
      await admin("accounts", { email, emailVerified: true });
      user = await lookup(email);
    } else if (!user.emailVerified) {
      await admin("accounts:update", { localId: user.localId, emailVerified: true });
    }
    return { status: "ok", token: customToken(user.localId), created };
  }

  return {
    /** The callable's answer, or null when `url` isn't one of these callables. */
    async handle(url, data) {
      if (url.endsWith("/recipePrinterEmailCodeSend")) return sendCode(data);
      if (url.endsWith("/recipePrinterEmailCodeVerify")) return verifyCode(data);
      return null;
    },
    lastCode(email) {
      return codes.get(String(email ?? "").trim().toLowerCase())?.code ?? null;
    },
  };
}
