/**
 * Cookbook unlock audit — READ ONLY.
 *
 * Answers the questions that decide how the purchase model gets consolidated,
 * before anything is changed or deleted:
 *
 *   1. How many unlock docs exist, over how many accounts, and how lopsided is
 *      the distribution? (One book bought once became dozens of unlocks for at
 *      least one account — see docs/cookbook-unlock-webhook.md.)
 *   2. How many were written by the SERVER vs by the old client path? A
 *      webhook-written doc carries `source: "revenuecat"` and a real Timestamp
 *      `unlockedAt`; the client wrote neither. This is the direct measure of
 *      whether the webhook has ever worked, and of the hole's blast radius.
 *   3. How many unlocks have no matching purchase in the `cookbookPurchases`
 *      ledger — i.e. access nobody can show was paid for.
 *   4. How many are orphans, pointing at a project that no longer exists.
 *      Those are the safe-to-delete set.
 *   5. How much still lives on the pre-namespace path, so the backfill is a
 *      known size rather than a surprise.
 *
 * This script never writes. It opens no transactions, calls no `set`/`update`/
 * `delete`, and touches nothing outside the collections named below. Run it as
 * often as you like.
 *
 * Usage — needs admin credentials, which it does not manage for you:
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json \
 *     npx --package firebase-admin -c "node scripts/cookbook-unlock-audit.mjs"
 *
 * `firebase-admin` is resolved at runtime on purpose — this is a one-off audit
 * and does not belong in the app's dependency list.
 *
 * Optional: RP_AUDIT_PROJECT (defaults to cookpilot-bbecb), RP_AUDIT_VERBOSE=1
 * to list the worst accounts individually.
 */

const PROJECT_ID = process.env.RP_AUDIT_PROJECT ?? "cookpilot-bbecb";
const VERBOSE = process.env.RP_AUDIT_VERBOSE === "1";

const NAMESPACED_USERS = ["products", "recipePrinter", "users"];
const PURCHASES = "products/recipePrinter/cookbookPurchases";

let admin;
try {
  admin = (await import("firebase-admin")).default;
} catch {
  console.error(
    "firebase-admin is not resolvable. Run this via:\n\n" +
      "  GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json \\\n" +
      '    npx --package firebase-admin -c "node scripts/cookbook-unlock-audit.mjs"\n',
  );
  process.exit(1);
}

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIREBASE_CONFIG) {
  console.error(
    "No credentials found. Set GOOGLE_APPLICATION_CREDENTIALS to a service-account\n" +
      "key with Firestore read access, or run `gcloud auth application-default login`.\n",
  );
  process.exit(1);
}

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();

/** Short, non-identifying handle for an account, so output is safe to paste. */
const shortUid = (uid) => `${uid.slice(0, 6)}…`;

/** A doc the webhook wrote carries `source` AND a Timestamp `unlockedAt`; the
    old client path wrote a bare `Date.now()` number and no `source`. */
function writtenByServer(data) {
  return data?.source === "revenuecat" && typeof data?.unlockedAt?.toDate === "function";
}

async function readUnlocks() {
  // One collection-group read beats walking every account. Falls back to a
  // per-account walk if the group index isn't available.
  try {
    const snap = await db.collectionGroup("cookbookUnlocks").get();
    return snap.docs.map((d) => ({
      uid: d.ref.parent.parent?.id ?? "unknown",
      // `products/recipePrinter/users/{uid}/…` vs the pre-namespace `users/{uid}/…`
      legacy: !d.ref.path.startsWith("products/recipePrinter/"),
      projectId: d.id,
      data: d.data(),
    }));
  } catch (error) {
    console.warn(`  (collection-group read unavailable: ${error.message}; walking accounts)`);
    const out = [];
    const users = await db.collection(NAMESPACED_USERS.join("/")).listDocuments();
    for (const user of users) {
      const snap = await user.collection("cookbookUnlocks").get();
      snap.docs.forEach((d) =>
        out.push({ uid: user.id, legacy: false, projectId: d.id, data: d.data() }),
      );
    }
    return out;
  }
}

async function main() {
  console.log(`\nCookbook unlock audit — ${PROJECT_ID} (read only)\n${"─".repeat(58)}`);

  const unlocks = await readUnlocks();
  if (unlocks.length === 0) {
    console.log("No unlock documents found. Nothing to audit.\n");
    return;
  }

  // ── Ledger: the only record of a purchase the server itself observed ──────
  const purchases = await db.collection(PURCHASES).get().catch(() => null);
  const paidProjectIds = new Set();
  purchases?.docs.forEach((d) => {
    const projectId = d.data()?.projectId;
    if (projectId) paidProjectIds.add(projectId);
  });

  const byUid = new Map();
  for (const unlock of unlocks) {
    if (!byUid.has(unlock.uid)) byUid.set(unlock.uid, []);
    byUid.get(unlock.uid).push(unlock);
  }

  const serverWritten = unlocks.filter((u) => writtenByServer(u.data));
  const legacyPath = unlocks.filter((u) => u.legacy);
  const unledgered = unlocks.filter((u) => !paidProjectIds.has(u.projectId));

  // ── Orphans: an unlock whose project no longer exists ────────────────────
  // Checked per account so one missing project can't be confused for another's.
  let orphans = 0;
  for (const [uid, list] of byUid) {
    const projects = await db
      .collection([...NAMESPACED_USERS, uid, "printProjects"].join("/"))
      .listDocuments()
      .catch(() => []);
    const live = new Set(projects.map((p) => p.id));
    orphans += list.filter((u) => !live.has(u.projectId)).length;
  }

  const counts = [...byUid.values()].map((l) => l.length).sort((a, b) => b - a);
  const median = counts[Math.floor(counts.length / 2)];

  console.log(`Unlock documents      ${unlocks.length}`);
  console.log(`Accounts holding them ${byUid.size}`);
  console.log(`Per account           max ${counts[0]}, median ${median}`);
  console.log("");
  console.log(`Written by the server ${serverWritten.length}   ← has source:"revenuecat"`);
  console.log(`Written by the client ${unlocks.length - serverWritten.length}   ← the old path`);
  console.log("");
  console.log(
    `Purchase ledger       ${purchases ? `${purchases.size} record(s)` : "MISSING — the webhook has never written one"}`,
  );
  console.log(`Unlocks with no ledger entry  ${unledgered.length}   ← access with no server-side proof of payment`);
  console.log(`Orphaned (project deleted)    ${orphans}   ← safe-to-delete set`);
  console.log(`On the pre-namespace path     ${legacyPath.length}   ← backfill size`);

  if (VERBOSE) {
    console.log(`\nAccounts with the most unlocks:`);
    [...byUid.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 15)
      .forEach(([uid, list]) => {
        const server = list.filter((u) => writtenByServer(u.data)).length;
        console.log(`  ${shortUid(uid)}  ${String(list.length).padStart(4)} unlocks  (${server} server-written)`);
      });
  }

  console.log("");
  if (serverWritten.length === 0) {
    console.log("⚠  No server-written unlock exists. Either the webhook has never fired for a");
    console.log("   cookbook purchase, or RevenueCat is not delivering events to it.\n");
  }
  if (byUid.size > 0 && counts[0] > 5) {
    console.log("⚠  At least one account holds far more unlocks than anyone buys. Expect the");
    console.log("   autosave fork bug + the old reconcile mirror (see duplicateProjects.ts).\n");
  }
}

await main();
await admin.app().delete();
