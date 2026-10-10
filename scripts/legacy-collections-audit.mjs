/**
 * Legacy collection audit — READ ONLY.
 *
 * RecipePrinter's data moved under `products/recipePrinter/...`, but the app
 * still reads three pre-namespace locations as a fallback
 * (docs/firebase-inventory.md, blocker 4). This counts what is left in each and
 * how much of it has NO counterpart in the namespaced location, which is the
 * only number that decides whether the fallbacks can be removed:
 *
 *   1. `users/{uid}/printProjects/{id}`
 *        vs `products/recipePrinter/users/{uid}/printProjects/{id}`
 *   2. `users/{uid}/cookbookUnlocks/{id}`   (a purchase record)
 *        vs `products/recipePrinter/users/{uid}/cookbookUnlocks/{id}`
 *   3. `sharedRecipeCards/{slug}`
 *        vs `products/recipePrinter/sharedRecipeCards/{slug}`
 *   4. Whether top-level `feedback-printer` still exists. No code reads or
 *      writes it; this only reports its size beside the namespaced `feedback`.
 *
 * "Legacy-only" means the same uid + document id (or slug) is absent from the
 * namespaced location. Where a document is in both, the app already prefers the
 * namespaced copy, so the legacy one is dead weight.
 *
 * This script never writes. It calls only `get`, `count`, `listCollections`
 * and Auth `getUsers`; there is no `set`, `update`, `delete`, batch or
 * transaction anywhere in it. Run it as often as you like.
 *
 * Usage — needs admin credentials, which it does not manage for you:
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json npm run audit:legacy
 *
 * `firebase-admin` is resolved at runtime on purpose, like the other audits.
 *
 * Optional: RP_AUDIT_PROJECT (defaults to cookpilot-bbecb); RP_AUDIT_VERBOSE=1
 * to list every legacy-only document path (contains full uids, so don't paste
 * that output anywhere public).
 */

const PROJECT_ID = process.env.RP_AUDIT_PROJECT ?? "cookpilot-bbecb";
const VERBOSE = process.env.RP_AUDIT_VERBOSE === "1";

const NAMESPACE = "products/recipePrinter";

let admin;
try {
  admin = (await import("firebase-admin")).default;
} catch {
  console.error(
    "firebase-admin is not resolvable. Run this via:\n\n" +
      "  GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json npm run audit:legacy\n",
  );
  process.exit(1);
}

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error(
    "No credentials found. Set GOOGLE_APPLICATION_CREDENTIALS to a service-account\n" +
      "key for cookpilot-bbecb (Firebase console > Project settings > Service accounts\n" +
      "> Generate new private key). Keep the file outside the repo.\n",
  );
  process.exit(1);
}

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();

/** Short, non-identifying handle for an account, so output is safe to paste. */
const shortUid = (uid) => `${uid.slice(0, 6)}…`;

const millis = (value) =>
  typeof value === "number" ? value : typeof value?.toMillis === "function" ? value.toMillis() : 0;

const day = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : "unknown");

/**
 * Every document of a per-user subcollection, split by which home it is in.
 * One collection-group read finds both homes; `fields` keeps saved projects
 * (up to a megabyte each when written before the content split) from being
 * downloaded whole just to be counted.
 */
async function readUserSubcollection(name, fields) {
  const snap = await db.collectionGroup(name).select(...fields).get();
  const legacy = [];
  const namespaced = new Map();
  let elsewhere = 0;
  for (const doc of snap.docs) {
    const segments = doc.ref.path.split("/");
    if (segments.length === 4 && segments[0] === "users") {
      legacy.push({ uid: segments[1], id: doc.id, path: doc.ref.path, data: doc.data() });
    } else if (segments.length === 6 && doc.ref.path.startsWith(`${NAMESPACE}/users/`)) {
      namespaced.set(`${segments[3]}/${doc.id}`, doc.data());
    } else {
      elsewhere += 1;
    }
  }
  return { legacy, namespaced, elsewhere };
}

/** Which of these uids still have a Firebase Auth account. Null if Auth can't be asked. */
async function existingAccounts(uids) {
  const found = new Set();
  try {
    for (let start = 0; start < uids.length; start += 100) {
      const result = await admin.auth().getUsers(uids.slice(start, start + 100).map((uid) => ({ uid })));
      result.users.forEach((user) => found.add(user.uid));
    }
    return found;
  } catch (error) {
    console.warn(`  (could not ask Auth which accounts still exist: ${error.message})`);
    return null;
  }
}

function reportSplit(label, { legacy, namespaced, elsewhere }, accounts) {
  const only = legacy.filter((entry) => !namespaced.has(`${entry.uid}/${entry.id}`));
  const uids = new Set(legacy.map((entry) => entry.uid));
  const onlyUids = new Set(only.map((entry) => entry.uid));
  console.log(`\n${label}`);
  console.log(`  namespaced documents      ${namespaced.size}`);
  console.log(`  legacy documents          ${legacy.length}  (${uids.size} accounts)`);
  console.log(`  legacy, also namespaced   ${legacy.length - only.length}`);
  console.log(`  LEGACY-ONLY               ${only.length}  (${onlyUids.size} accounts)`);
  if (accounts) {
    const deleted = only.filter((entry) => !accounts.has(entry.uid));
    console.log(`    of those, account deleted from Auth   ${deleted.length}`);
    console.log(`    of those, account still exists        ${only.length - deleted.length}`);
  }
  if (elsewhere) console.log(`  under an unexpected path  ${elsewhere}`);
  return only;
}

function listPaths(entries, describe) {
  if (!entries.length) return;
  if (!VERBOSE) {
    const perAccount = new Map();
    entries.forEach((entry) => perAccount.set(entry.uid, (perAccount.get(entry.uid) ?? 0) + 1));
    const worst = [...perAccount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    console.log(`    largest accounts: ${worst.map(([uid, n]) => `${shortUid(uid)} ×${n}`).join(", ")}`);
    console.log("    (RP_AUDIT_VERBOSE=1 lists every path)");
    return;
  }
  entries.forEach((entry) => console.log(`    ${entry.path}  ${describe(entry)}`));
}

console.log(`Legacy collection audit — project ${PROJECT_ID} — read only`);

// ── 1. Saved projects ──────────────────────────────────────────────────────
const projects = await readUserSubcollection("printProjects", ["updatedAt", "revision", "kind"]);
// ── 2. Cookbook unlocks ────────────────────────────────────────────────────
const unlocks = await readUserSubcollection("cookbookUnlocks", ["source", "unlockedAt"]);

const accounts = await existingAccounts([
  ...new Set([...projects.legacy, ...unlocks.legacy].map((entry) => entry.uid)),
]);

const projectsOnly = reportSplit("1. Saved projects (printProjects)", projects, accounts);
if (projectsOnly.length) {
  const stamps = projectsOnly.map((entry) => millis(entry.data.updatedAt)).filter(Boolean);
  if (stamps.length) {
    console.log(`    last updated between ${day(Math.min(...stamps))} and ${day(Math.max(...stamps))}`);
  }
}
// A legacy copy newer than its namespaced twin would mean something still
// writes the legacy path, which is the assumption everything else rests on.
const legacyNewer = projects.legacy.filter((entry) => {
  const twin = projects.namespaced.get(`${entry.uid}/${entry.id}`);
  return twin && millis(entry.data.updatedAt) > millis(twin.updatedAt);
});
console.log(`  in both, legacy copy NEWER than namespaced   ${legacyNewer.length}`);
const newestLegacy = Math.max(0, ...projects.legacy.map((entry) => millis(entry.data.updatedAt)));
console.log(`  newest legacy updatedAt   ${day(newestLegacy)}`);
listPaths(projectsOnly, (entry) => `updated ${day(millis(entry.data.updatedAt))}`);
if (VERBOSE) legacyNewer.forEach((entry) => console.log(`    NEWER IN LEGACY  ${entry.path}`));

const unlocksOnly = reportSplit("2. Cookbook unlocks (cookbookUnlocks) — purchase records", unlocks, accounts);
if (unlocksOnly.length) {
  // Access follows the project id, so an unlock whose project is gone from
  // both homes unlocks nothing — but it is still a record that someone paid.
  const projectKeys = new Set([
    ...projects.namespaced.keys(),
    ...projects.legacy.map((entry) => `${entry.uid}/${entry.id}`),
  ]);
  const withProject = unlocksOnly.filter((entry) => projectKeys.has(`${entry.uid}/${entry.id}`));
  console.log(`    of those, project still saved   ${withProject.length}`);
  console.log(`    of those, project gone          ${unlocksOnly.length - withProject.length}`);
  console.log(
    `    of those, written by webhook    ${unlocksOnly.filter((entry) => entry.data.source === "revenuecat").length}`,
  );
}
listPaths(unlocksOnly, (entry) => `unlocked ${day(millis(entry.data.unlockedAt))}`);

// ── 3. Shared cards ────────────────────────────────────────────────────────
const [legacyCards, namespacedCards] = await Promise.all([
  db.collection("sharedRecipeCards").select("published", "createdAt").get(),
  db.collection(`${NAMESPACE}/sharedRecipeCards`).select("published").get(),
]);
const namespacedSlugs = new Set(namespacedCards.docs.map((doc) => doc.id));
const cardsOnly = legacyCards.docs.filter((doc) => !namespacedSlugs.has(doc.id));
const published = (docs) => docs.filter((doc) => doc.get("published") === true).length;
console.log("\n3. Shared cards (sharedRecipeCards)");
console.log(`  namespaced documents      ${namespacedCards.size}  (${published(namespacedCards.docs)} published)`);
console.log(`  legacy documents          ${legacyCards.size}  (${published(legacyCards.docs)} published)`);
console.log(`  legacy, also namespaced   ${legacyCards.size - cardsOnly.length}`);
console.log(`  LEGACY-ONLY               ${cardsOnly.length}  (${published(cardsOnly)} published, i.e. live links)`);
if (VERBOSE) {
  cardsOnly.forEach((doc) =>
    console.log(`    ${doc.ref.path}  published=${doc.get("published") === true}  created ${day(millis(doc.get("createdAt")))}`),
  );
}

// ── 4. Feedback ────────────────────────────────────────────────────────────
const [legacyFeedback, namespacedFeedback, topLevel] = await Promise.all([
  db.collection("feedback-printer").count().get(),
  db.collection(`${NAMESPACE}/feedback`).count().get(),
  db.listCollections(),
]);
console.log("\n4. Feedback");
console.log(`  feedback-printer (legacy, unread by any code)   ${legacyFeedback.data().count}`);
console.log(`  ${NAMESPACE}/feedback                 ${namespacedFeedback.data().count}`);
console.log(`\nTop-level collections present: ${topLevel.map((ref) => ref.id).sort().join(", ")}`);

// ── Verdict ────────────────────────────────────────────────────────────────
const blocking = projectsOnly.length + unlocksOnly.length + cardsOnly.length;
console.log(
  blocking === 0
    ? "\nNothing is legacy-only. The fallback reads return nothing the namespaced reads don't."
    : `\n${blocking} legacy-only documents. These need a backfill before the fallback reads are removed.`,
);
if (legacyNewer.length) {
  console.log(`WARNING: ${legacyNewer.length} projects are newer in the legacy home. Something may still write there.`);
}
