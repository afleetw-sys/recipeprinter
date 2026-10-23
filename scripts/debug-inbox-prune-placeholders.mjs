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

import { inboxAccessToken } from "./debug-inbox-auth.mjs";

// One token for the whole run. Both passes finish well inside its hour.
const accessToken = await inboxAccessToken("scripts/debug-inbox-prune-placeholders.mjs");

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
