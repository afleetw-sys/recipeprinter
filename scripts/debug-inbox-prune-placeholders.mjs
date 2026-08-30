/**
 * Delete rows from Firestore `debugInbox` whose payload is a reserved address.
 *
 * The debug inbox is the list you read to find real bugs. Probes sent while
 * testing the capture pipeline itself sit in it looking exactly like user
 * failures — example.com/debug-inbox-probe-1, example.com/slow, and the rest.
 * `lib/queue.ts` stops new ones being written; this removes the ones already
 * collected.
 *
 * WHAT COUNTS AS RESERVED
 *
 * The same rule the app uses, kept deliberately in step with
 * `isPlaceholderHost` in lib/friendlyErrors.ts:
 *
 *   exact  : example.com / .org / .net / .edu   (RFC 2606)
 *   exact  : localhost, 127.0.0.1, 0.0.0.0, ::1
 *   suffix : .test, .invalid, .localhost, .example   (RFC 6761, whole tree)
 *
 * A row is a candidate only when its payload parses as a URL AND that URL's
 * host is reserved. A pasted-text row that merely mentions example.com is not
 * touched: someone may well have pasted a real recipe that cites it.
 *
 * WHAT IT WILL NOT DO
 *
 * It never deletes a row carrying an `imagePath`. Those point at bytes in
 * Storage, and dropping the row orphans the folder it references. There should
 * be no such row here (a placeholder is a URL, not a photograph) and if one
 * turns up it is listed and skipped rather than guessed at.
 *
 * DRY RUN BY DEFAULT. It prints the rows it matched, with their payload, user
 * and timestamp, and changes nothing. Deleting is not undoable:
 *
 *   # look first
 *   node scripts/debug-inbox-prune-placeholders.mjs --use-cli-login
 *
 *   # then delete exactly what the dry run listed
 *   node scripts/debug-inbox-prune-placeholders.mjs --use-cli-login --apply
 *
 * Optional: RP_INBOX_PROJECT (defaults to cookpilot-bbecb), and
 * RP_INBOX_PRODUCT to limit to one product's rows (defaults to every row,
 * since the collection is shared with CookPilot and a probe is a probe).
 */

const PROJECT_ID = process.env.RP_INBOX_PROJECT ?? "cookpilot-bbecb";
const PRODUCT = process.env.RP_INBOX_PRODUCT ?? "";
const COLLECTION = "debugInbox";
const APPLY = process.argv.includes("--apply");

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

if (!KEY_PATH && !USE_CLI_LOGIN) {
  console.error(
    "No credentials found. Either:\n\n" +
      "  GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json node scripts/debug-inbox-prune-placeholders.mjs\n\n" +
      "or, to borrow the login the Firebase CLI already has on this machine:\n\n" +
      "  node scripts/debug-inbox-prune-placeholders.mjs --use-cli-login\n",
  );
  process.exit(1);
}

// One token for the whole run. Both passes finish well inside its hour.
const accessToken = KEY_PATH ? await serviceAccountToken(KEY_PATH) : await cliLoginToken();

/** REST rather than an SDK client, so one credential path covers both passes. */
async function bearer() {
  return { Authorization: `Bearer ${accessToken}` };
}

const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Kept in step with isPlaceholderHost in lib/friendlyErrors.ts.
const PLACEHOLDER_HOSTS = new Set(["example.com", "example.org", "example.net", "example.edu"]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);
const RESERVED_TLDS = new Set(["test", "invalid", "localhost", "example"]);

function isPlaceholderHost(hostname) {
  const host = hostname.trim().toLowerCase().replace(/^www\./, "");
  if (!host) return false;
  if (PLACEHOLDER_HOSTS.has(host) || LOOPBACK_HOSTS.has(host)) return true;
  return RESERVED_TLDS.has(host.split(".").pop() ?? "");
}

/**
 * The host of a payload that is a bare URL, or null.
 *
 * A payload has to BE a URL, not contain one. `new URL` needs a scheme, and
 * the capture stores whatever the user typed, so a schemeless `example.com/x`
 * is retried with https. Anything with whitespace in it is prose, not a link.
 */
function urlHost(payload) {
  const raw = (payload ?? "").trim();
  if (!raw || /\s/.test(raw)) return null;
  for (const candidate of [raw, `https://${raw}`]) {
    try {
      return new URL(candidate).hostname;
    } catch {
      /* try the next form */
    }
  }
  return null;
}

/** Every row in the collection, paged. */
async function readRows() {
  const rows = [];
  let pageToken;
  do {
    const url = new URL(`${FIRESTORE}/${COLLECTION}`);
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, { headers: await bearer() });
    if (!response.ok) {
      throw new Error(`Read failed (${response.status} ${(await response.text()).slice(0, 200)})`);
    }
    const body = await response.json();
    for (const doc of body.documents ?? []) {
      const f = doc.fields ?? {};
      rows.push({
        name: doc.name,
        id: doc.name.split("/").pop(),
        payload: f.payload?.stringValue ?? "",
        product: f.product?.stringValue ?? "",
        source: f.source?.stringValue ?? "",
        category: f.category?.stringValue ?? "",
        user: f.user?.stringValue ?? "",
        imagePath: f.imagePath?.stringValue ?? null,
        createdAt: f.createdAt?.timestampValue ?? "",
      });
    }
    pageToken = body.nextPageToken;
  } while (pageToken);
  return rows;
}

async function deleteRow(name) {
  const response = await fetch(`https://firestore.googleapis.com/v1/${name}`, {
    method: "DELETE",
    headers: await bearer(),
  });
  if (!response.ok) {
    throw new Error(`Delete failed (${response.status} ${(await response.text()).slice(0, 200)})`);
  }
}

const rows = await readRows();
const scoped = PRODUCT ? rows.filter((row) => row.product === PRODUCT) : rows;

const matched = [];
const skippedWithImages = [];
for (const row of scoped) {
  const host = urlHost(row.payload);
  if (!host || !isPlaceholderHost(host)) continue;
  (row.imagePath ? skippedWithImages : matched).push(row);
}

console.log(`${COLLECTION}: ${rows.length} rows, ${scoped.length} in scope, ${matched.length} reserved.\n`);
for (const row of matched) {
  const when = row.createdAt ? row.createdAt.slice(0, 19).replace("T", " ") : "no timestamp";
  console.log(
    `  ${when}  ${row.product || "?"}/${row.source || "?"}  ${row.category || "?"}  ${row.user || "signed out"}\n` +
      `    ${row.payload}\n`,
  );
}

if (skippedWithImages.length) {
  console.log(`Skipped ${skippedWithImages.length} reserved row(s) carrying an imagePath:`);
  for (const row of skippedWithImages) console.log(`  ${row.id}  ${row.payload}  ${row.imagePath}`);
  console.log("Deleting these would orphan the Storage folder they point at. Handle them by hand.\n");
}

if (!matched.length) {
  console.log("Nothing to delete.");
  process.exit(0);
}

if (!APPLY) {
  console.log(`Dry run. Re-run with --apply to delete these ${matched.length} row(s).`);
  process.exit(0);
}

let deleted = 0;
for (const row of matched) {
  try {
    await deleteRow(row.name);
    deleted += 1;
  } catch (err) {
    console.error(`  failed: ${row.id} (${err.message})`);
  }
}
console.log(`Deleted ${deleted} of ${matched.length}.`);
