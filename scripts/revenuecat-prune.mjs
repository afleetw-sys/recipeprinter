/**
 * Deletes RevenueCat customers that have never bought anything.
 *
 * DESTRUCTIVE. Deleting a customer permanently removes their purchase history
 * — production included — and RevenueCat provides no undo. Everything here is
 * built so that a mistake fails closed rather than open:
 *
 *   - Dry run by default. Deletes only with --confirm.
 *   - A customer is kept if ANY of active entitlements, purchases, or
 *     subscriptions is non-empty. Three independent signals, not just one.
 *   - If a lookup for a customer errors, that customer is KEPT. Uncertainty
 *     never results in deletion.
 *   - If the scan finds zero customers worth keeping, it aborts: that almost
 *     certainly means the lookups are broken, not that nobody ever paid.
 *   - --max N caps how many get deleted in one run, so you can do five, check
 *     the dashboard, and continue.
 *
 * Usage:
 *   REVENUECAT_SECRET_KEY=sk_... REVENUECAT_PROJECT_ID=proj... \
 *     node scripts/revenuecat-prune.mjs               # dry run
 *
 *   REVENUECAT_SECRET_KEY=sk_... REVENUECAT_PROJECT_ID=proj... \
 *     node scripts/revenuecat-prune.mjs --confirm --max 5
 *
 * Run the dry run first and read revenuecat-prune-plan.csv before confirming.
 */

import { writeFileSync } from "node:fs";

const SECRET_KEY = process.env.REVENUECAT_SECRET_KEY;
const PROJECT_ID = process.env.REVENUECAT_PROJECT_ID;

const args = process.argv.slice(2);
const CONFIRM = args.includes("--confirm");
const maxFlagIndex = args.indexOf("--max");
const MAX_DELETIONS =
  maxFlagIndex !== -1 ? Number(args[maxFlagIndex + 1]) : Infinity;

if (!SECRET_KEY || !PROJECT_ID) {
  console.error(
    "Missing REVENUECAT_SECRET_KEY and/or REVENUECAT_PROJECT_ID.\n" +
      "Deleting needs a v2 secret key with customer read_write permission.",
  );
  process.exit(1);
}

if (Number.isNaN(MAX_DELETIONS)) {
  console.error("--max needs a number, e.g. --max 5");
  process.exit(1);
}

const API = "https://api.revenuecat.com";

async function api(path, method = "GET") {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${SECRET_KEY}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} on ${method} ${path}`);
  }
  return res.json();
}

function listLength(value) {
  if (Array.isArray(value)) return value.length;
  return value?.items?.length ?? 0;
}

/** Gentle pacing so a few hundred calls don't trip RevenueCat's rate limits. */
function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Every reason this customer might be worth money. Any non-empty signal, or
 * any error at all, means keep.
 */
async function purchaseSignals(customer) {
  const id = encodeURIComponent(customer.id);
  const base = `/v2/projects/${PROJECT_ID}/customers/${id}`;

  try {
    const [purchases, subscriptions] = await Promise.all([
      api(`${base}/purchases`),
      api(`${base}/subscriptions`),
    ]);
    return {
      entitlements: listLength(customer.active_entitlements),
      purchases: listLength(purchases),
      subscriptions: listLength(subscriptions),
      errored: false,
    };
  } catch (err) {
    // Fail closed: an unreadable customer is never a deletable customer.
    return {
      entitlements: listLength(customer.active_entitlements),
      purchases: 0,
      subscriptions: 0,
      errored: true,
      error: err.message,
    };
  }
}

async function main() {
  console.log(
    CONFIRM
      ? "MODE: --confirm — customers WILL be deleted.\n"
      : "MODE: dry run — nothing will be deleted.\n",
  );

  const customers = [];
  let path = `/v2/projects/${PROJECT_ID}/customers?limit=100`;
  while (path) {
    const page = await api(path);
    customers.push(...(page.items ?? []));
    path = page.next_page ?? null;
    process.stderr.write(`\rfetched ${customers.length} customers…`);
  }
  process.stderr.write("\n");

  const keep = [];
  const remove = [];

  for (const [index, customer] of customers.entries()) {
    const signals = await purchaseSignals(customer);
    const worthKeeping =
      signals.errored ||
      signals.entitlements > 0 ||
      signals.purchases > 0 ||
      signals.subscriptions > 0;

    (worthKeeping ? keep : remove).push({ customer, signals });
    process.stderr.write(
      `\rchecked ${index + 1}/${customers.length} — keep ${keep.length}, prune ${remove.length}`,
    );
    await pause(60);
  }
  process.stderr.write("\n\n");

  // A run where nobody at all looks like a paying customer is far more likely
  // to be a broken lookup than a true result. Refuse rather than wipe.
  if (customers.length > 0 && keep.length === 0) {
    console.error(
      "ABORT: not one customer showed an entitlement, purchase or subscription.\n" +
        "That points at a permissions or endpoint problem, not at reality.\n" +
        "Nothing was deleted. Check the secret key's scopes and try the audit script.",
    );
    process.exit(1);
  }

  const rows = remove.map(({ customer }) => ({
    id: customer.id,
    first_seen: customer.first_seen_at
      ? new Date(Number(customer.first_seen_at)).toISOString().slice(0, 10)
      : "",
    country: customer.last_seen_country ?? "",
  }));

  const csv = [
    "id,first_seen,country",
    ...rows.map((r) => `"${r.id}","${r.first_seen}","${r.country}"`),
  ].join("\n");
  writeFileSync("revenuecat-prune-plan.csv", csv);

  console.log(`${customers.length} customers scanned`);
  console.log(`  ${keep.length} kept (entitlement, purchase, subscription, or unreadable)`);
  console.log(`  ${remove.length} have no purchase signal at all`);
  console.log(`\nPlan written to revenuecat-prune-plan.csv`);

  const errored = keep.filter(({ signals }) => signals.errored);
  if (errored.length) {
    console.log(
      `\n${errored.length} customer(s) were kept because their lookup failed:`,
    );
    for (const { customer, signals } of errored.slice(0, 5)) {
      console.log(`  ${customer.id} — ${signals.error}`);
    }
  }

  if (!CONFIRM) {
    console.log(
      "\nDry run only. Read the CSV, then re-run with --confirm (and ideally" +
        " --max 5 the first time) to delete.",
    );
    return;
  }

  const targets = remove.slice(0, MAX_DELETIONS);
  console.log(`\nDeleting ${targets.length} of ${remove.length}…`);

  const deleted = [];
  for (const [index, { customer }] of targets.entries()) {
    try {
      await api(
        `/v2/projects/${PROJECT_ID}/customers/${encodeURIComponent(customer.id)}`,
        "DELETE",
      );
      deleted.push(customer.id);
      console.log(`  [${index + 1}/${targets.length}] deleted ${customer.id}`);
    } catch (err) {
      console.error(`  [${index + 1}/${targets.length}] FAILED ${customer.id} — ${err.message}`);
    }
    await pause(120);
  }

  writeFileSync("revenuecat-prune-deleted.csv", ["id", ...deleted].join("\n"));
  console.log(
    `\nDeleted ${deleted.length}. Ids logged to revenuecat-prune-deleted.csv.` +
      "\nDashboard charts and Customer Lists can lag a few hours behind.",
  );
}

main().catch((err) => {
  console.error(`\nFailed: ${err.message}`);
  process.exit(1);
});
