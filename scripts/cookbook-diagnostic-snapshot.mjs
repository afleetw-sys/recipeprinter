/**
 * Cookbook diagnostic snapshot — READ ONLY.
 *
 * One-off support diagnostic: a specific customer's cookbook repeatedly fails
 * to export. This script does exactly one thing — read her project document
 * once and save the raw JSON to a local file — so we have an independent,
 * immutable backup of her exact data before anything else touches it.
 *
 * This script contains NO write, update, or delete call anywhere. It opens no
 * transactions and touches no collection other than the single document named
 * below. Run it as many times as you like; it cannot change anything.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json \
 *   DIAG_UID=<owner uid> \
 *   DIAG_PROJECT_ID=<project id> \
 *     npx --yes --package firebase-admin -c "node scripts/cookbook-diagnostic-snapshot.mjs"
 *
 * Optional: RP_AUDIT_PROJECT (defaults to cookpilot-bbecb), DIAG_SNAPSHOT_OUT
 * (defaults under tmp/diagnostics/).
 */

const PROJECT_ID = process.env.RP_AUDIT_PROJECT ?? "cookpilot-bbecb";
const UID = process.env.DIAG_UID;
const BOOK_ID = process.env.DIAG_PROJECT_ID;

if (!UID || !BOOK_ID) {
  console.error("Set DIAG_UID and DIAG_PROJECT_ID.");
  process.exit(1);
}

let admin;
try {
  admin = (await import("firebase-admin")).default;
} catch {
  console.error(
    "firebase-admin is not resolvable. Run this via:\n\n" +
      "  GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json \\\n" +
      "  DIAG_UID=... DIAG_PROJECT_ID=... \\\n" +
      '    npx --yes --package firebase-admin -c "node scripts/cookbook-diagnostic-snapshot.mjs"\n',
  );
  process.exit(1);
}

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIREBASE_CONFIG) {
  console.error("No credentials found. Set GOOGLE_APPLICATION_CREDENTIALS to a service-account key.\n");
  process.exit(1);
}

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();

const NAMESPACED_PATH = ["products", "recipePrinter", "users", UID, "printProjects", BOOK_ID];
const LEGACY_PATH = ["users", UID, "printProjects", BOOK_ID];
const CONTENT_SUFFIX = ["content", "main"];

async function readOnce(segments) {
  const ref = db.doc(segments.join("/"));
  const snap = await ref.get(); // READ ONLY — the only Firestore call this script makes on her data.
  return snap.exists ? { path: segments.join("/"), data: snap.data() } : null;
}

async function main() {
  console.log(`\nCookbook diagnostic snapshot — READ ONLY — ${PROJECT_ID}\n${"─".repeat(58)}`);
  console.log(`uid:        ${UID}`);
  console.log(`project id: ${BOOK_ID}\n`);

  let found = await readOnce(NAMESPACED_PATH);
  if (!found) {
    console.log("Not found at the namespaced path, trying the legacy path...");
    found = await readOnce(LEGACY_PATH);
  }

  if (!found) {
    console.log("\nNo document found at either path. Nothing was read, nothing was written.\n");
    return;
  }

  const { path, data } = found;
  const json = JSON.stringify(data, null, 2);
  const sections = Array.isArray(data.sections) ? data.sections : [];

  console.log(`Found at:        ${path}`);
  console.log(`kind:            ${data.kind ?? "(none)"}`);
  console.log(`title:           ${data.title ?? "(none)"}`);
  console.log(`sections:        ${sections.length}`);
  console.log(`recipeCount field: ${data.recipeCount ?? "(none)"}`);
  console.log(`parent doc size: ${(json.length / 1024).toFixed(1)} KB`);
  console.log(`updatedAt:       ${data.updatedAt ?? "(none)"}`);
  console.log(`contentVersion:  ${data.contentVersion ?? "(none, inline doc)"}`);
  console.log(`settings.template: ${data.settings?.template ?? "(none)"}`);
  console.log(`settings.cardSize: ${data.settings?.cardSize ?? "(none)"}`);

  // The split-storage model (lib/printProjects.ts): a large book's real recipe
  // content lives in a subdocument, not the parent. READ ONLY, same as above.
  let content = null;
  if (data.contentVersion === 2) {
    const contentPath = [...path.split("/"), ...CONTENT_SUFFIX];
    const contentSnap = await db.doc(contentPath.join("/")).get();
    if (contentSnap.exists) {
      content = contentSnap.data();
      const contentJson = JSON.stringify(content);
      const contentSections = Array.isArray(content.sections) ? content.sections : [];
      const realRecipeCount = contentSections.reduce(
        (sum, s) => sum + (Array.isArray(s.items) ? s.items.length : 0),
        0,
      );
      console.log(`\ncontent/main doc found: yes`);
      console.log(`content doc size: ${(contentJson.length / 1024).toFixed(1)} KB (${(contentJson.length / 1_048_576 * 100).toFixed(1)}% of Firestore's 1 MiB doc cap)`);
      console.log(`real recipe count (content/main): ${realRecipeCount}`);
    } else {
      console.log(`\ncontent/main doc found: NO — parent says contentVersion 2 but the content subdocument is missing.`);
    }
  }

  const out =
    process.env.DIAG_SNAPSHOT_OUT ??
    `tmp/diagnostics/${BOOK_ID}-snapshot-${Date.now()}.json`;
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { dirname, resolve } = await import("node:path");
  const outPath = resolve(out);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(
    outPath,
    JSON.stringify({ path, uid: UID, projectId: BOOK_ID, parent: data, content }, null, 2),
  );
  console.log(`\nSnapshot written to: ${outPath}`);
  console.log("This file is the independent backup — nothing else was touched.\n");
}

await main();
await admin.app().delete();
