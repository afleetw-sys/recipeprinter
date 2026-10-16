// Local preview of the referral program: `npm run preview:referrals`, then
// open http://localhost:3105.
//
// Starts three things and stops them together on Ctrl-C:
//   - the Firebase Auth and Firestore emulators (throwaway accounts, nothing real),
//   - stub.mjs on :3212 (not the browser tests' :3211), standing in for CookPilot's callables,
//   - this checkout's dev server on :3105, pointed at both, with every real
//     key from .env.local blanked (no real Firebase, RevenueCat or PostHog).
//
// Sign up with any made-up email. The email picks what the stand-in plays:
//   verify…   a password account that must confirm its email first
//   earned…   a referrer with 6 days banked from two friends
//   paid…     a subscriber whose friend joined
//   expired…  referral Pro has run out (Subscribe / Invite choice)
//   capped…   15 of 15 days earned
//   used…     9 of 10 free imports used (the meter enforces 10 per 30 days)
//   anything else: a fresh account.
// Open /invite/AB3CD4EF in a signed-out window to arrive as an invited friend.
// Importing a link works: any link gives the same sample recipe (photos and
// pasted text don't, here).
// Verification links land in the Auth emulator: GET
// http://127.0.0.1:9198/emulator/v1/projects/demo-recipeprinter/oobCodes
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const env = { ...process.env };
if (existsSync(".env.local")) {
  for (const name of readFileSync(".env.local", "utf8").match(/^[A-Z0-9_]+(?==)/gm) ?? []) env[name] = "";
}
Object.assign(env, {
  NEXT_PUBLIC_FIREBASE_EMULATORS: "1",
  NEXT_PUBLIC_FIREBASE_API_KEY: "e2e-fake-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "127.0.0.1",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-recipeprinter",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "demo-recipeprinter.appspot.com",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "000000000000",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:000000000000:web:e2e",
  NEXT_PUBLIC_REFERRALS_PREVIEW: "1",
  NEXT_PUBLIC_FIREBASE_FUNCTIONS_PORT: "3212",
  // Its own emulator ports (firebase.referral-preview.json), not the browser tests'.
  NEXT_PUBLIC_FIREBASE_AUTH_PORT: "9198",
  NEXT_PUBLIC_FIREBASE_FIRESTORE_PORT: "8181",
  NEXT_PUBLIC_FIREBASE_STORAGE_PORT: "9298",
  // Link imports go to the stand-in, which answers every link with a sample recipe.
  COOKPILOT_RECIPE_PARSER_URL: "http://127.0.0.1:3212/parse-url",
  COOKPILOT_SUPPLIED_HTML_PARSER_URL: "http://127.0.0.1:3212/parse-html",
  RECIPEPRINTER_PARSER_SECRET: "referral-preview",
  NEXT_DIST_DIR: ".next-referral",
});

const children = [
  spawn("npx", ["-y", "firebase-tools@14.27.0", "emulators:start", "--config", "firebase.referral-preview.json",
    "--only", "auth,firestore", "--project", "demo-recipeprinter"], { stdio: "inherit" }),
  spawn("node", ["scripts/referral-preview/stub.mjs"], { stdio: "inherit" }),
  spawn("npx", ["next", "dev", "-p", "3105"], { env, stdio: "inherit" }),
];
const stop = () => {
  for (const child of children) child.kill("SIGINT");
  setTimeout(() => process.exit(0), 3000);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
