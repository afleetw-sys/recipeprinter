/**
 * `npm run dev`: the app AND the local cookbook PDF renderer, together.
 *
 * Exporting a cookbook needs both — the app on :3000 hands the book to the
 * renderer on :8899 (scripts/pdf-renderer-dev.mjs), which opens it in Chrome
 * and saves the PDF. Starting the renderer was a separate step in a second
 * terminal, easy to forget, and forgetting it looked exactly like a broken
 * export: "The cookbook renderer didn't respond."
 *
 * If something is already listening on the renderer port (another checkout's
 * dev server, or a renderer started by hand) it is reused, not fought over.
 * A renderer that fails to start never takes the app down with it.
 *
 * `npm run dev:app` is plain `next dev`, for when the renderer isn't wanted.
 */
import { spawn } from "node:child_process";
import { createConnection } from "node:net";

const RENDERER_PORT = Number(process.env.PDF_DEV_PORT ?? 8899);
const nextArgs = process.argv.slice(2);
const portFlag = nextArgs.findIndex((a) => a === "-p" || a === "--port");
const appPort = portFlag >= 0 ? nextArgs[portFlag + 1] : (process.env.PORT ?? "3000");

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

const children = [];

if (await portInUse(RENDERER_PORT)) {
  console.log(`[dev] PDF renderer already running on :${RENDERER_PORT}, reusing it.`);
  if (appPort !== "3000") {
    console.log(`[dev]   note: it may be rendering from a different app port than :${appPort}.`);
  }
} else {
  const renderer = spawn(process.execPath, ["scripts/pdf-renderer-dev.mjs"], {
    stdio: "inherit",
    env: {
      ...process.env,
      RECIPEPRINTER_ORIGIN: process.env.RECIPEPRINTER_ORIGIN ?? `http://localhost:${appPort}`,
    },
  });
  renderer.on("exit", (code, signal) => {
    if (!shuttingDown) {
      console.warn(
        `[dev] PDF renderer stopped (${signal ?? `exit ${code}`}). Cookbook export won't work until \`npm run pdf:dev\` is running.`,
      );
    }
  });
  children.push(renderer);
}

// Next's own bin, not `npx next`: npx doesn't forward SIGTERM, so stopping
// this script left `next dev` running on its port.
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", ...nextArgs], {
  stdio: "inherit",
});
children.push(next);

let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
  process.exit(code);
}

next.on("exit", (code) => shutdown(code ?? 0));
process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));
