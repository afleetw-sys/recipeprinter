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

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIREBASE_CONFIG) {
  console.error(
    "No credentials found. Set GOOGLE_APPLICATION_CREDENTIALS to a service-account\n" +
      "key with Firestore write and Storage admin access, or run\n" +
      "`gcloud auth application-default login`.\n",
  );
  process.exit(1);
}

admin.initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET });
const db = admin.firestore();
const bucket = admin.storage().bucket();

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
    const [files] = await bucket.getFiles({ prefix });
    for (const file of files) {
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

/** Rows already migrated, so a second run is a no-op rather than a duplicate. */
async function readMigratedPaths() {
  const snap = await db
    .collection("debugInbox")
    .where("product", "==", "recipeprinter")
    .select("storagePath")
    .get();
  return new Set(snap.docs.map((d) => d.get("storagePath")).filter(Boolean));
}

async function main() {
  console.log(
    `debugInbox backfill — project ${PROJECT_ID}, bucket ${BUCKET}\n` +
      `mode: ${APPLY ? (DELETE ? "APPLY + DELETE" : "APPLY (no deletes)") : "DRY RUN"}\n`,
  );

  const folders = await readFolders();
  const migrated = await readMigratedPaths();
  console.log(`${folders.length} capture folders found, ${migrated.size} already migrated.\n`);

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
      const [buf] = await payload.download();
      text = buf.toString("utf8");
      const [metadata] = await payload.getMetadata();
      meta = metadata.metadata ?? {};
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
      createdAt: capturedAt
        ? admin.firestore.Timestamp.fromDate(capturedAt)
        : admin.firestore.FieldValue.serverTimestamp(),
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
      await db.collection("debugInbox").add(row);
      stats.moved += 1;
      if (images.length > 0) stats.copied += 1;
      if (DELETE) {
        // Only ever the payload object. The image files in this folder are
        // deliberately untouched.
        await payload.delete();
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
