/**
 * Move failed URL/text captures out of Storage and into Firestore `debugInbox`.
 *
 * Every failed import used to write a `payload.txt` into Storage under
 * `recipeprinter/debug/failed-imports/<category>/<stamp>_<id>/`, where it could
 * be neither queried nor browsed usefully. Failures are recorded in the
 * `debugInbox` collection now (see lib/failedImportCapture.ts), and Storage
 * keeps IMAGE BYTES only. This backfills everything already collected.
 *
 * WHAT IT TOUCHES
 *
 *   Moves : a capture folder whose only file is `payload.txt`. One Firestore
 *           row is written, then the object is deleted.
 *   Keeps : any folder containing an image (`0.jpg`, `1.jpg`, …). Those belong
 *           in Storage. If such a folder ALSO has a payload.txt, the payload is
 *           copied into the row and the image files are left exactly where they
 *           are — nothing with bytes in it is ever deleted.
 *   Reads : both roots, so pre-August captures come too:
 *             recipeprinter/debug/failed-imports/**   (current)
 *             debug/failed-imports/**                 (before 2026-08-03)
 *
 * `createdAt` is taken from the folder name's timestamp, NOT from now, so the
 * migrated rows sort into their real place in the history instead of all
 * landing on the day this was run.
 *
 * DRY RUN BY DEFAULT. It prints what it would do and changes nothing. Deleting
 * from Storage is not undoable, so the write pass is opt-in:
 *
 *   # look first
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json \
 *     npx --yes --package firebase-admin -c "node scripts/debug-inbox-backfill.mjs"
 *
 *   # write the rows, leave Storage alone
 *   … node scripts/debug-inbox-backfill.mjs --apply
 *
 *   # write the rows AND delete the migrated payload.txt objects
 *   … node scripts/debug-inbox-backfill.mjs --apply --delete
 *
 * `--apply` without `--delete` is the safe order: run it, look at the
 * collection, and only then come back with `--delete`. Re-running is safe —
 * a row already migrated is recognised by its `storagePath` and skipped.
 *
 * Optional: RP_BACKFILL_PROJECT (defaults to cookpilot-bbecb),
 * RP_BACKFILL_BUCKET (defaults to cookpilot-bbecb.firebasestorage.app),
 * RP_BACKFILL_LIMIT to stop after N folders while trying it out.
 */

const PROJECT_ID = process.env.RP_BACKFILL_PROJECT ?? "cookpilot-bbecb";
const BUCKET = process.env.RP_BACKFILL_BUCKET ?? "cookpilot-bbecb.firebasestorage.app";
const LIMIT = Number(process.env.RP_BACKFILL_LIMIT ?? 0) || Infinity;

const APPLY = process.argv.includes("--apply");
const DELETE = process.argv.includes("--delete");

const ROOTS = ["recipeprinter/debug/failed-imports/", "debug/failed-imports/"];
const PAYLOAD_FILE = "payload.txt";
/** Matches what `captureFailedImportImages` writes: `<i>.jpg`. */
const IMAGE_FILE = /\/\d+\.jpg$/;
/** The client caps payloads here too; a longer legacy one is cut and flagged. */
const MAX_PAYLOAD_CHARS = 20_000;

let admin;
try {
  admin = (await import("firebase-admin")).default;
} catch {
  console.error(
    "firebase-admin is not resolvable. Run this via:\n\n" +
      "  GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json \\\n" +
      '    npx --yes --package firebase-admin -c "node scripts/debug-inbox-backfill.mjs"\n',
  );
  process.exit(1);
}

/**
 * Falls back to the Firebase CLI's own login when there is no service account
 * and no ADC — which is the normal state of a laptop that has only ever run
 * `firebase login`.
 *
 * It reads the refresh token the CLI already stores, exchanges it with Google
 * for a short-lived access token, and hands that to the Admin SDK. Nothing is
 * written: no new credential file, no token in the output, no token on disk.
 * The exchange is the same one the CLI performs on every command it runs.
 *
 * Opt in with --use-cli-login, so using a personal Google identity to write to
 * production is always something someone chose rather than something that
 * happened because a variable was unset.
 */
async function cliLoginCredential() {
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
  if (!refreshToken) throw new Error("The Firebase CLI is not logged in. Run `firebase login`.");

  // firebase-tools' own public OAuth client. Public by design: it identifies
  // the CLI, it does not authorize anything on its own.
  const CLIENT_ID = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
  const CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi";

  // `admin.credential.refreshToken` is the supported way to authenticate as a
  // human rather than a service account, and it takes the credential as an
  // object — so this stays in memory. Nothing is written to disk, and neither
  // the refresh token nor any access token is ever printed.
  return admin.credential.refreshToken({
    type: "authorized_user",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: refreshToken,
  });
}

const USE_CLI_LOGIN = process.argv.includes("--use-cli-login");
const hasAppCredentials =
  Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS) || Boolean(process.env.FIREBASE_CONFIG);

if (!hasAppCredentials && !USE_CLI_LOGIN) {
  console.error(
    "No credentials found. Either:\n\n" +
      "  GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json node scripts/debug-inbox-backfill.mjs\n\n" +
      "or, to borrow the login the Firebase CLI already has on this machine:\n\n" +
      "  node scripts/debug-inbox-backfill.mjs --use-cli-login\n",
  );
  process.exit(1);
}

const credential = hasAppCredentials
  ? admin.credential.applicationDefault()
  : await cliLoginCredential();

admin.initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET, credential });

/**
 * Storage goes through the JSON API rather than the Admin SDK.
 *
 * `admin.storage()` refuses anything that is not a certificate or real ADC, so
 * on a laptop with only a `firebase login` it cannot list a bucket at all. The
 * REST endpoints take a plain bearer token, which every credential type can
 * produce — so a dry run works with whatever is already on the machine, and
 * nothing has to be written to disk to make it work.
 */
async function bearer() {
  const { access_token } = await credential.getAccessToken();
  return { Authorization: `Bearer ${access_token}` };
}

const GCS = "https://storage.googleapis.com/storage/v1/b";

async function gcsList(prefix) {
  const out = [];
  let pageToken;
  do {
    const url = new URL(`${GCS}/${encodeURIComponent(BUCKET)}/o`);
    url.searchParams.set("prefix", prefix);
    url.searchParams.set("maxResults", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, { headers: await bearer() });
    if (!response.ok) {
      throw new Error(`Listing ${prefix} failed (${response.status} ${await response.text()})`);
    }
    const body = await response.json();
    for (const item of body.items ?? []) out.push(item);
    pageToken = body.nextPageToken;
  } while (pageToken);
  return out;
}

async function gcsDownload(name) {
  const url = `${GCS}/${encodeURIComponent(BUCKET)}/o/${encodeURIComponent(name)}?alt=media`;
  const response = await fetch(url, { headers: await bearer() });
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  return response.text();
}

async function gcsDelete(name) {
  const url = `${GCS}/${encodeURIComponent(BUCKET)}/o/${encodeURIComponent(name)}`;
  const response = await fetch(url, { method: "DELETE", headers: await bearer() });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Delete failed (${response.status})`);
  }
}

/**
 * Firestore goes through its REST API, for the same reason Storage does: the
 * Admin SDK's client insists on a certificate or real ADC and will not take a
 * bearer token, which is all a `firebase login` can produce. Going direct
 * means one credential path for the whole script instead of a dry run that
 * works on this machine and a write pass that does not.
 */
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

/** JS value to Firestore's typed JSON. Only the shapes a row actually uses. */
function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  return { stringValue: String(value) };
}

async function firestoreCreate(collection, row) {
  const fields = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, toFirestoreValue(value)]),
  );
  const response = await fetch(`${FIRESTORE}/${collection}`, {
    method: "POST",
    headers: { ...(await bearer()), "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!response.ok) {
    throw new Error(`Write failed (${response.status} ${(await response.text()).slice(0, 200)})`);
  }
}

/** Every `storagePath` already in the collection, for the re-run guard. */
async function firestoreStoragePaths(collection) {
  const paths = new Set();
  let pageToken;
  do {
    const url = new URL(`${FIRESTORE}/${collection}`);
    url.searchParams.set("pageSize", "300");
    url.searchParams.append("mask.fieldPaths", "storagePath");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, { headers: await bearer() });
    if (!response.ok) {
      throw new Error(`Read failed (${response.status} ${(await response.text()).slice(0, 200)})`);
    }
    const body = await response.json();
    for (const doc of body.documents ?? []) {
      const value = doc.fields?.storagePath?.stringValue;
      if (value) paths.add(value);
    }
    pageToken = body.nextPageToken;
  } while (pageToken);
  return paths;
}

/**
 * `<root>/<category>/<2026-08-27T17-44-03-665Z>_<id>/payload.txt`
 *
 * The stamp is an ISO string with `:` and `.` swapped for `-` (see
 * `newCaptureFolder`), so it is turned back before parsing.
 */
function parseFolder(folder) {
  const parts = folder.split("/").filter(Boolean);
  const leaf = parts[parts.length - 1] ?? "";
  const category = parts[parts.length - 2] ?? "unknown";
  const stamp = leaf.split("_")[0] ?? "";
  const iso = stamp.replace(
    /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,
    "$1T$2:$3:$4.$5Z",
  );
  const at = Number.isNaN(Date.parse(iso)) ? null : new Date(iso);
  return { category, capturedAt: at };
}

/** Groups every object under the debug roots by its capture folder. */
async function readFolders() {
  const folders = new Map();
  for (const prefix of ROOTS) {
    for (const file of await gcsList(prefix)) {
      const slash = file.name.lastIndexOf("/");
      if (slash < 0) continue;
      const folder = file.name.slice(0, slash + 1);
      const entry = folders.get(folder) ?? { folder, payload: null, images: [] };
      if (file.name.endsWith(`/${PAYLOAD_FILE}`)) entry.payload = file;
      else if (IMAGE_FILE.test(file.name)) entry.images.push(file);
      folders.set(folder, entry);
    }
  }
  return [...folders.values()];
}

/**
 * Rows already migrated, so a second run is a no-op rather than a duplicate.
 *
 * A dry run continues without this if Firestore is out of reach — it only
 * makes the preview over-count, and it says so rather than pretending.
 */
async function readMigratedPaths() {
  try {
    return { paths: await firestoreStoragePaths("debugInbox"), known: true };
  } catch (error) {
    if (APPLY) throw error;
    console.warn(
      `  ! could not read debugInbox (${error.message.split("\n")[0]}).\n` +
        "    Continuing: this preview cannot tell which rows were migrated already.\n",
    );
    return { paths: new Set(), known: false };
  }
}

async function main() {
  console.log(
    `debugInbox backfill — project ${PROJECT_ID}, bucket ${BUCKET}\n` +
      `mode: ${APPLY ? (DELETE ? "APPLY + DELETE" : "APPLY (no deletes)") : "DRY RUN"}\n`,
  );

  const folders = await readFolders();
  const { paths: migrated, known } = await readMigratedPaths();
  console.log(
    `${folders.length} capture folders found` +
      (known ? `, ${migrated.size} already migrated.` : ", migrated count unknown.") +
      "\n",
  );

  const stats = { moved: 0, copied: 0, skipped: 0, imagesKept: 0, deleted: 0, failed: 0 };

  for (const entry of folders.slice(0, LIMIT === Infinity ? undefined : LIMIT)) {
    const { folder, payload, images } = entry;
    if (images.length > 0) stats.imagesKept += images.length;

    if (!payload) {
      // Images only: already in the right place, nothing to write.
      stats.skipped += 1;
      continue;
    }
    if (migrated.has(payload.name)) {
      stats.skipped += 1;
      continue;
    }

    const { category, capturedAt } = parseFolder(folder);
    let text = "";
    let meta = {};
    try {
      text = await gcsDownload(payload.name);
      meta = payload.metadata ?? {};
    } catch (error) {
      console.warn(`  ! could not read ${payload.name}: ${error.message}`);
      stats.failed += 1;
      continue;
    }

    const truncated = text.length > MAX_PAYLOAD_CHARS;
    const row = {
      product: "recipeprinter",
      source: meta.source ?? "url",
      category: meta.category ?? category,
      reason: String(meta.reason ?? "").slice(0, 500),
      payload: truncated ? text.slice(0, MAX_PAYLOAD_CHARS) : text,
      payloadTruncated: truncated,
      payloadLength: text.length,
      imagePath: images.length > 0 ? folder : null,
      imageCount: images.length,
      user: meta.user ?? "",
      userAgent: String(meta.userAgent ?? "").slice(0, 300),
      // The capture's own moment when the folder name carries one, so the rows
      // land in their real place in the history rather than all on today.
      createdAt: capturedAt ?? new Date(),
      // Both the dedupe key for a re-run and the audit trail for where this
      // row came from. Rows written by the live app do not carry it.
      storagePath: payload.name,
      backfilled: true,
    };

    const label = `${row.category}/${(capturedAt ?? new Date(0)).toISOString().slice(0, 10)}`;
    const preview = text.replace(/\s+/g, " ").slice(0, 70);

    if (!APPLY) {
      console.log(`  would move ${label}  ${preview}`);
      stats.moved += 1;
      continue;
    }

    try {
      await firestoreCreate("debugInbox", row);
      stats.moved += 1;
      if (images.length > 0) stats.copied += 1;
      if (DELETE) {
        // Only ever the payload object. The image files in this folder are
        // deliberately untouched.
        await gcsDelete(payload.name);
        stats.deleted += 1;
      }
      console.log(`  moved ${label}  ${preview}`);
    } catch (error) {
      console.warn(`  ! could not migrate ${payload.name}: ${error.message}`);
      stats.failed += 1;
    }
  }

  console.log(
    `\n${APPLY ? "Done" : "Dry run"}: ` +
      `${stats.moved} payload${stats.moved === 1 ? "" : "s"} ${APPLY ? "written" : "to write"}, ` +
      `${stats.deleted} deleted from Storage, ` +
      `${stats.skipped} skipped, ` +
      `${stats.imagesKept} image files left in place, ` +
      `${stats.failed} failed.`,
  );
  if (!APPLY) console.log("Nothing was changed. Re-run with --apply to write the rows.");
  else if (!DELETE) console.log("Storage untouched. Re-run with --apply --delete to remove the migrated payloads.");
}

await main();
