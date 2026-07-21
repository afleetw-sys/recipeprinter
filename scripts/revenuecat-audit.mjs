/**
 * READ-ONLY audit of RevenueCat customers.
 *
 * Answers "which of these are real people and which are me testing?" before
 * anything gets deleted. Deliberately contains no delete code: RevenueCat
 * customer deletion wipes production purchase history and is irreversible,
 * so classification and destruction stay in separate scripts.
 *
 * Usage:
 *   REVENUECAT_SECRET_KEY=sk_... REVENUECAT_PROJECT_ID=proj... \
 *     node scripts/revenuecat-audit.mjs
 *
 * Writes revenuecat-audit.csv next to wherever you run it, and prints a
 * summary. The secret key is read from the environment and never logged.
 */

const SECRET_KEY = process.env.REVENUECAT_SECRET_KEY;
const PROJECT_ID = process.env.REVENUECAT_PROJECT_ID;

if (!SECRET_KEY || !PROJECT_ID) {
  console.error(
    "Missing REVENUECAT_SECRET_KEY and/or REVENUECAT_PROJECT_ID.\n" +
      "Get a v2 secret key at RevenueCat → Project Settings → API keys.\n" +
      "Read-only ('customer_information:customers:read') is enough for this.",
  );
  process.exit(1);
}

const API = "https://api.revenuecat.com";

async function getPage(path) {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${SECRET_KEY}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(
      `${res.status} ${res.statusText} — ${await res.text().catch(() => "")}`,
    );
  }
  return res.json();
}

/** active_entitlements comes back either as a list object or a bare array. */
function entitlementIds(customer) {
  const raw = customer.active_entitlements;
  const items = Array.isArray(raw) ? raw : (raw?.items ?? []);
  return items.map((e) => e.entitlement_id ?? e.id ?? "?").filter(Boolean);
}

function iso(ms) {
  return ms ? new Date(Number(ms)).toISOString().slice(0, 10) : "";
}

async function main() {
  const customers = [];
  let path = `/v2/projects/${PROJECT_ID}/customers?limit=100&expand=active_entitlements`;

  while (path) {
    const page = await getPage(path);
    customers.push(...(page.items ?? []));
    // v2 hands back a ready-made relative URL for the next page, or nothing.
    path = page.next_page ?? null;
    process.stderr.write(`\rfetched ${customers.length}…`);
  }
  process.stderr.write("\n");

  const rows = customers.map((c) => {
    const ents = entitlementIds(c);
    const id = c.id ?? "";
    // Anything holding an entitlement is treated as untouchable regardless of
    // how it looks — a false "that's just me" here costs a paying customer
    // the thing they bought.
    const classification = ents.length
      ? "HAS-ENTITLEMENT — do not delete"
      : id.startsWith("devtest_")
        ? "known dev id"
        : "no entitlement — needs review";

    return {
      id,
      classification,
      entitlements: ents.join("|"),
      first_seen: iso(c.first_seen_at),
      last_seen: iso(c.last_seen_at),
      country: c.last_seen_country ?? "",
      platform: c.last_seen_platform ?? "",
    };
  });

  const headers = Object.keys(rows[0] ?? { id: "" });
  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","),
    ),
  ].join("\n");

  const { writeFileSync } = await import("node:fs");
  writeFileSync("revenuecat-audit.csv", csv);

  const tally = rows.reduce((acc, r) => {
    acc[r.classification] = (acc[r.classification] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`\n${rows.length} customers\n`);
  for (const [label, n] of Object.entries(tally)) {
    console.log(`  ${String(n).padStart(4)}  ${label}`);
  }

  // The tell for "this is me": a handful of countries and a burst of
  // first_seen dates on days you were building. Real users spread out.
  const byCountry = rows.reduce((acc, r) => {
    acc[r.country || "unknown"] = (acc[r.country || "unknown"] ?? 0) + 1;
    return acc;
  }, {});
  console.log("\nby country:");
  for (const [country, n] of Object.entries(byCountry).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${country}`);
  }

  console.log("\nby first-seen date:");
  const byDate = rows.reduce((acc, r) => {
    acc[r.first_seen] = (acc[r.first_seen] ?? 0) + 1;
    return acc;
  }, {});
  for (const [date, n] of Object.entries(byDate).sort()) {
    console.log(`  ${String(n).padStart(4)}  ${date}`);
  }

  console.log("\nWrote revenuecat-audit.csv — nothing was modified.");
}

main().catch((err) => {
  console.error(`\nAudit failed: ${err.message}`);
  process.exit(1);
});
