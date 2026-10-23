/**
 * NO DEPENDENCIES, on purpose.
 *
 * The sibling backfill script needs `firebase-admin` and therefore an
 * `npx --package firebase-admin -c "..."` incantation to run at all, and that
 * form does not put the package on an ESM resolution path on every machine.
 * All the SDK was ever doing here is exchanging a credential for an access
 * token, which is one HTTPS call. Doing it directly means this is `node
 * scripts/...` and nothing else, on any machine with a Firebase CLI login.
 */

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/datastore";

/** base64url, which JWT wants and Buffer's "base64" does not quite produce. */
function b64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * A service account signs its own assertion and trades it for a token. This is
 * the path to prefer: the identity is the project's, not a person's.
 */
async function serviceAccountToken(keyPath) {
  const { readFileSync } = await import("node:fs");
  const { createSign } = await import("node:crypto");
  const key = JSON.parse(readFileSync(keyPath, "utf8"));
  if (!key.client_email || !key.private_key) {
    throw new Error(`${keyPath} is not a service account key (no client_email/private_key).`);
  }
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: key.client_email,
    scope: SCOPE,
    aud: TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify(claim))}`;
  const signature = createSign("RSA-SHA256").update(unsigned).end().sign(key.private_key);
  const assertion = `${unsigned}.${b64url(signature)}`;

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) {
    throw new Error(`Token exchange failed (${response.status} ${(await response.text()).slice(0, 200)})`);
  }
  return (await response.json()).access_token;
}

/**
 * Borrows the login the Firebase CLI already has, for the same reason the
 * backfill script does: a laptop that has only run `firebase login` has no
 * service account and no ADC. It reads the refresh token the CLI stores and
 * exchanges it, which is what the CLI itself does on every command. Nothing is
 * written to disk and no token is printed.
 *
 * Opt in with --use-cli-login, so reaching production with a personal Google
 * identity stays a choice rather than a fallback that happens quietly.
 */
async function cliLoginToken() {
  const { readFileSync } = await import("node:fs");
  const { homedir } = await import("node:os");
  const { join } = await import("node:path");
  const configPath = join(homedir(), ".config", "configstore", "firebase-tools.json");

  let refreshToken;
  try {
    refreshToken = JSON.parse(readFileSync(configPath, "utf8"))?.tokens?.refresh_token;
  } catch {
    throw new Error(`Could not read the Firebase CLI login at ${configPath}. Run \`firebase login\`.`);
  }
  if (!refreshToken) throw new Error("The Firebase CLI is not logged in. Run \`firebase login\`.");

  // firebase-tools' own public OAuth client. Public by design: it identifies
  // the CLI, it does not authorize anything on its own.
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com",
      client_secret: "j9iVZfS8kkCEFUPaAeJV0sAi",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    throw new Error(`Token exchange failed (${response.status} ${(await response.text()).slice(0, 200)})`);
  }
  return (await response.json()).access_token;
}

const USE_CLI_LOGIN = process.argv.includes("--use-cli-login");
const KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS;

/**
 * One token for the whole run, or exit with how to supply one. `script` is
 * the path to print in that message.
 */
export async function inboxAccessToken(script) {
  if (!KEY_PATH && !USE_CLI_LOGIN) {
    console.error(
      "No credentials found. Either:\n\n" +
        `  GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json node ${script}\n\n` +
        "or, to borrow the login the Firebase CLI already has on this machine:\n\n" +
        `  node ${script} --use-cli-login\n`,
    );
    process.exit(1);
  }
  return KEY_PATH ? serviceAccountToken(KEY_PATH) : cliLoginToken();
}

