// Checks the deployed import meter from the command line (docs/import-meter.md, section 4).
//
//   node scripts/check-import-meter.mjs
//
// Reads the public web config and the local-dev App Check debug token from .env.local, exchanges
// the debug token for an App Check token the way the browser SDK does, then asks the meter to
// reserve and settle one made-up import. It never imports a recipe, so it costs nothing, and it
// prints the meter's answers only: no token or key is ever written to the terminal.
//
// Expect `mode: "off"` until recipePrinterConfig/importMeter says otherwise. In `measure` mode the
// check settles its reservation as a failure, so it is never counted.

import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map(([, key, value]) => [key, value.trim().replace(/^["']|["']$/g, "")]),
);

function need(name) {
  if (!env[name]) {
    console.error(`FAIL: ${name} is missing from .env.local`);
    process.exit(1);
  }
  return env[name];
}

const apiKey = need("NEXT_PUBLIC_FIREBASE_API_KEY");
const projectId = need("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
const appId = need("NEXT_PUBLIC_FIREBASE_APP_ID");
const debugToken = need("NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN");
const region = env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || "us-central1";
// The web key may be restricted to the site, so say where we come from.
const referer = "http://localhost:3000/";

const exchange = await fetch(
  `https://firebaseappcheck.googleapis.com/v1/projects/${projectId}/apps/${appId}:exchangeDebugToken?key=${encodeURIComponent(apiKey)}`,
  { method: "POST", headers: { "content-type": "application/json", referer }, body: JSON.stringify({ debugToken }) },
);
if (!exchange.ok) {
  console.error(`FAIL: App Check refused the debug token (HTTP ${exchange.status})`);
  process.exit(1);
}
const { token } = await exchange.json();

const importId = `runbook-check-${Date.now()}`;
async function meter(data) {
  const startedAt = Date.now();
  const response = await fetch(`https://${region}-${projectId}.cloudfunctions.net/recipePrinterImportMeter`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-firebase-appcheck": token },
    body: JSON.stringify({ data: { ...data, importId, rpAnonId: "runbook-check-0000000001" } }),
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, ms: Date.now() - startedAt, result: body?.result, error: body?.error };
}

const reserve = await meter({ op: "reserve", method: "text" });
console.log("reserve:", JSON.stringify(reserve));
const settle = await meter({ op: "settle", outcome: "failure" });
console.log("settle: ", JSON.stringify(settle));

const ok =
  reserve.status === 200 &&
  reserve.result?.allowed === true &&
  (reserve.result?.mode === "off" || reserve.result?.mode === "measure") &&
  settle.status === 200 &&
  settle.result?.ok === true;
console.log(ok ? `PASS: the meter answers, mode "${reserve.result.mode}"` : "FAIL: see the answers above");
process.exit(ok ? 0 : 1);
