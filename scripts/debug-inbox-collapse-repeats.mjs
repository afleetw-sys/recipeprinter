/**
 * Collapse repeated RecipePrinter rows in Firestore `debugInbox` into one row
 * each, carrying the summed count.
 *
 * Until `recordFailedImport` filed URL and text failures under an id derived
 * from what failed, every retry of the same broken page added a row. The app
 * now counts a repeat on the row already there (`occurrenceCount`); this
 * folds the rows collected before that into the same shape.
 *
 * WHAT COUNTS AS A REPEAT
 *
 * RecipePrinter rows only (CookPilot's are never touched), source `url` or
 * `text`, with the same source, the same `user` and the same payload. Photo
 * rows each have their own photos and are left alone.
 *
 * WHERE THE SURVIVOR LIVES
 *
 * A guest group is written to the id the app now uses for it, so the next
 * guest failure on that input counts on it rather than starting a new row.
 * A signed-in group keeps its oldest row: old rows carry the email, while the
 * app's id is built from the uid, so its next repeat will open one fresh row.
 * So does a group whose payload was truncated, since the full text is gone.
 *
 * The survivor keeps the oldest `createdAt` and payload, takes the newest
 * failure's reason and category as `lastFailedAt`, and gets the summed
 * `occurrenceCount`. The rest are deleted in the same commit.
 *
 * DRY RUN BY DEFAULT:
 *
 *   node scripts/debug-inbox-collapse-repeats.mjs --use-cli-login
 *   node scripts/debug-inbox-collapse-repeats.mjs --use-cli-login --apply
 *
 * Optional: RP_INBOX_PROJECT (defaults to cookpilot-bbecb).
 */

import { createHash } from "node:crypto";
import { inboxAccessToken } from "./debug-inbox-auth.mjs";

const PROJECT_ID = process.env.RP_INBOX_PROJECT ?? "cookpilot-bbecb";
const COLLECTION = "debugInbox";
const APPLY = process.argv.includes("--apply");

const accessToken = await inboxAccessToken("scripts/debug-inbox-collapse-repeats.mjs");
const headers = { Authorization: `Bearer ${accessToken}` };
const DATABASE = `projects/${PROJECT_ID}/databases/(default)`;
const API = "https://firestore.googleapis.com/v1";

/** Kept in step with `repeatableRowId` in lib/failedImportCapture.ts. */
function repeatableRowId(source, identity, payload) {
  return createHash("sha256").update(`recipeprinter\n${source}\n${identity}\n${payload}`).digest("hex");
}

async function readRows() {
  const rows = [];
  let pageToken;
  do {
    const url = new URL(`${API}/${DATABASE}/documents/${COLLECTION}`);
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Read failed (${response.status} ${(await response.text()).slice(0, 200)})`);
    }
    const body = await response.json();
    for (const doc of body.documents ?? []) {
      const f = doc.fields ?? {};
      rows.push({
        name: doc.name,
        id: doc.name.split("/").pop(),
        fields: f,
        product: f.product?.stringValue ?? "",
        source: f.source?.stringValue ?? "",
        user: f.user?.stringValue ?? "",
        payload: f.payload?.stringValue ?? "",
        truncated: f.payloadTruncated?.booleanValue === true,
        imagePath: f.imagePath?.stringValue ?? null,
        count: Number(f.occurrenceCount?.integerValue ?? 1),
        firstAt: f.createdAt?.timestampValue ?? "",
        lastAt: f.lastFailedAt?.timestampValue ?? f.createdAt?.timestampValue ?? "",
      });
    }
    pageToken = body.nextPageToken;
  } while (pageToken);
  return rows;
}

const rows = await readRows();
const groups = new Map();
for (const row of rows) {
  if (row.product !== "recipeprinter") continue;
  if (row.source !== "url" && row.source !== "text") continue;
  if (row.imagePath || !row.payload) continue;
  const key = JSON.stringify([row.source, row.user, row.payload]);
  groups.set(key, [...(groups.get(key) ?? []), row]);
}

const plans = [];
for (const group of groups.values()) {
  const guestId = !group[0].user && !group[0].truncated
    ? repeatableRowId(group[0].source, "", group[0].payload)
    : null;
  // A guest group already sitting at its id with nothing else beside it is done.
  if (group.length < 2 && (!guestId || group[0].id === guestId)) continue;
  const byFirst = [...group].sort((a, b) => a.firstAt.localeCompare(b.firstAt));
  const byLast = [...group].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  const oldest = byFirst[0];
  const newest = byLast[0];
  const targetId = guestId ?? oldest.id;
  const fields = {
    ...oldest.fields,
    reason: newest.fields.reason ?? oldest.fields.reason,
    category: newest.fields.category ?? oldest.fields.category,
    occurrenceCount: { integerValue: String(group.reduce((sum, row) => sum + row.count, 0)) },
    lastFailedAt: { timestampValue: newest.lastAt },
  };
  plans.push({
    targetId,
    fields,
    deletes: group.filter((row) => row.id !== targetId),
    group,
  });
}

console.log(`${COLLECTION}: ${rows.length} rows, ${groups.size} RecipePrinter url/text inputs, ${plans.length} to collapse.\n`);
for (const plan of plans) {
  const sample = plan.group[0];
  console.log(
    `  ${plan.group.length} row(s) -> ${plan.targetId}  count ${plan.fields.occurrenceCount.integerValue}` +
      `  ${sample.source}  ${sample.user || "signed out"}\n    ${sample.payload.slice(0, 120).replace(/\s+/g, " ")}\n`,
  );
}

if (!plans.length) {
  console.log("Nothing to collapse.");
  process.exit(0);
}
if (!APPLY) {
  console.log(`Dry run. Re-run with --apply to collapse these ${plans.length} input(s).`);
  process.exit(0);
}

// One commit per input: the survivor is written and its repeats deleted
// together, so a failure part-way never leaves a count beside its duplicates.
let done = 0;
for (const plan of plans) {
  const writes = [
    { update: { name: `${DATABASE}/documents/${COLLECTION}/${plan.targetId}`, fields: plan.fields } },
    ...plan.deletes.map((row) => ({ delete: row.name })),
  ];
  const response = await fetch(`${API}/${DATABASE}/documents:commit`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ writes }),
  });
  if (response.ok) done += 1;
  else console.error(`  failed: ${plan.targetId} (${response.status} ${(await response.text()).slice(0, 200)})`);
}
console.log(`Collapsed ${done} of ${plans.length}.`);
