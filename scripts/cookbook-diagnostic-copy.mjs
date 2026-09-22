/**
 * Cookbook diagnostic copy — writes ONLY to the target account.
 *
 * Reads its source data from a local snapshot FILE on disk (written earlier by
 * cookbook-diagnostic-snapshot.mjs), not from Firestore. That means this
 * script makes zero reads and zero writes against the original customer's
 * account or project — the only Firestore path it ever touches, for read or
 * write, is under DIAG_TARGET_UID.
 *
 * Refuses to run if DIAG_TARGET_UID matches the uid recorded in the snapshot,
 * as a second, independent guard against ever writing back to the source
 * account.
 *
 * Writes three documents, all under the target uid only:
 *   - printProjects/{newId}            (parent)
 *   - printProjects/{newId}/content/main  (the real recipe content)
 *   - cookbookUnlocks/{newId}          (so the paywall doesn't block export)
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json \
 *   DIAG_SNAPSHOT_IN=/path/to/customer-snapshot.json \
 *   DIAG_TARGET_UID=<your own uid> \
 *     node cookbook-diagnostic-copy.mjs
 */

const PROJECT_ID = process.env.RP_AUDIT_PROJECT ?? "cookpilot-bbecb";
const SNAPSHOT_IN = process.env.DIAG_SNAPSHOT_IN;
const TARGET_UID = process.env.DIAG_TARGET_UID;

if (!SNAPSHOT_IN || !TARGET_UID) {
  console.error("Set DIAG_SNAPSHOT_IN and DIAG_TARGET_UID.");
  process.exit(1);
}

let admin;
try {
  admin = (await import("firebase-admin")).default;
} catch {
  console.error("firebase-admin is not resolvable in this environment.");
  process.exit(1);
}

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIREBASE_CONFIG) {
  console.error("No credentials found. Set GOOGLE_APPLICATION_CREDENTIALS to a service-account key.\n");
  process.exit(1);
}

const { readFile } = await import("node:fs/promises");
const { resolve } = await import("node:path");

const snapshot = JSON.parse(await readFile(resolve(SNAPSHOT_IN), "utf8"));

if (!snapshot.parent || !snapshot.content) {
  console.error("Snapshot file is missing parent/content data. Nothing written.");
  process.exit(1);
}

if (snapshot.uid === TARGET_UID) {
  console.error(
    `Refusing to run: DIAG_TARGET_UID (${TARGET_UID}) matches the source account's uid ` +
      `recorded in the snapshot (${snapshot.uid}). This script only ever writes to the ` +
      "target account, and the target must not be the source.",
  );
  process.exit(1);
}

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();

const newId = crypto.randomUUID();

const newParent = {
  ...snapshot.parent,
  id: newId,
  ownerUid: TARGET_UID,
  title: `[DIAGNOSTIC COPY] ${snapshot.parent.title ?? ""}`.trim(),
  sourceProjectId: snapshot.projectId,
};

const newContent = { ...snapshot.content };

async function main() {
  console.log(`\nCookbook diagnostic copy — writes ONLY to ${TARGET_UID}\n${"─".repeat(58)}`);
  console.log(`source (read from local file only): ${snapshot.path}`);
  console.log(`new project id:  ${newId}`);
  console.log(`target uid:      ${TARGET_UID}\n`);

  const parentRef = db.doc(
    ["products", "recipePrinter", "users", TARGET_UID, "printProjects", newId].join("/"),
  );
  const contentRef = db.doc(
    ["products", "recipePrinter", "users", TARGET_UID, "printProjects", newId, "content", "main"].join(
      "/",
    ),
  );
  const unlockRef = db.doc(
    ["products", "recipePrinter", "users", TARGET_UID, "cookbookUnlocks", newId].join("/"),
  );

  await parentRef.set(newParent);
  console.log(`written: ${parentRef.path}`);

  await contentRef.set(newContent);
  console.log(`written: ${contentRef.path}`);

  await unlockRef.set({
    source: "revenuecat",
    unlockedAt: admin.firestore.Timestamp.now(),
    note: "diagnostic copy — not a real purchase",
  });
  console.log(`written: ${unlockRef.path}`);

  console.log(`\nOpen it at: /print?project=${newId}  (signed in as the target account)\n`);
}

await main();
await admin.app().delete();
