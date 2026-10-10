/**
 * Copy pre-namespace share links into their namespaced home.
 *
 *   sharedRecipeCards/{slug}  ->  products/recipePrinter/sharedRecipeCards/{slug}
 *
 * The 2026-10-10 audit (scripts/legacy-collections-audit.mjs) found these to be
 * the only documents left in any pre-namespace location. Once they are copied
 * and verified, the legacy fallback in lib/sharedRecipeCards.server.ts has
 * nothing left to find.
 *
 * DRY RUN BY DEFAULT. It prints what it would copy and changes nothing.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json npm run backfill:shared-cards
 *   RP_BACKFILL_APPLY=1 GOOGLE_APPLICATION_CREDENTIALS=… npm run backfill:shared-cards
 *
 * Applying copies with `create()`, which fails rather than overwrite, so a
 * namespaced document is never replaced. Every copy is read back and compared
 * field for field with its source. It NEVER deletes: the legacy documents stay
 * exactly where they are. Re-running is safe; a slug already copied is only
 * re-verified.
 *
 * Optional: RP_BACKFILL_PROJECT (defaults to cookpilot-bbecb).
 */

import { createRequire } from "node:module";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

const PROJECT_ID = process.env.RP_BACKFILL_PROJECT ?? "cookpilot-bbecb";
const APPLY = process.env.RP_BACKFILL_APPLY === "1";

const LEGACY = "sharedRecipeCards";
const NAMESPACED = "products/recipePrinter/sharedRecipeCards";

/** `npx --package` puts the package's `.bin` on PATH but nowhere a bare
    `import` looks, so resolve from those directories when the import misses. */
function requireFromNpx(name) {
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir.endsWith(path.join("node_modules", ".bin"))) continue;
    try {
      return createRequire(path.join(dir, "..", "noop.js"))(name);
    } catch {
      // Not in this one; keep looking.
    }
  }
  throw new Error(`${name} not found`);
}

let admin;
try {
  try {
    admin = (await import("firebase-admin")).default;
  } catch {
    admin = requireFromNpx("firebase-admin");
  }
} catch {
  console.error("firebase-admin is not resolvable. Run this via `npm run backfill:shared-cards`.");
  process.exit(1);
}

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("No credentials found. Set GOOGLE_APPLICATION_CREDENTIALS to a service-account key.");
  process.exit(1);
}

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();

console.log(`Shared card backfill — project ${PROJECT_ID} — ${APPLY ? "APPLY (copy, never delete)" : "dry run"}`);

const legacy = await db.collection(LEGACY).get();
let copied = 0;
let alreadyThere = 0;
let wouldCopy = 0;
const problems = [];

for (const source of legacy.docs) {
  const target = db.collection(NAMESPACED).doc(source.id);
  let existing = await target.get();
  if (!existing.exists) {
    if (!APPLY) {
      wouldCopy += 1;
      console.log(`  would copy  ${source.id}  (published=${source.get("published") === true})`);
      continue;
    }
    await target.create(source.data());
    copied += 1;
    existing = await target.get();
  } else {
    alreadyThere += 1;
  }
  // Timestamps compare by value, so this is a true field-for-field check.
  if (isDeepStrictEqual(existing.data(), source.data())) {
    console.log(`  verified    ${source.id}`);
  } else {
    problems.push(source.id);
    console.log(`  DIFFERS     ${source.id}  (namespaced copy does not match the legacy document)`);
  }
}

console.log(
  `\n${legacy.size} legacy documents: ${copied} copied, ${alreadyThere} already namespaced, ` +
    `${wouldCopy} still to copy, ${problems.length} differing.`,
);
if (problems.length) process.exitCode = 1;
else if (!APPLY && wouldCopy) console.log("Nothing was changed. Re-run with RP_BACKFILL_APPLY=1 to copy.");
else if (!wouldCopy) console.log("Every legacy share link has an identical namespaced copy.");
