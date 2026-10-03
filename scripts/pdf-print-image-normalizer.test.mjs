import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { installPrintImageNormalization } from "./pdf-print-image-normalizer.mjs";

// The local renderer must make the same skip/encode decisions as production's
// functions-pdf/src/printImages.ts, or `npm run pdf:dev` fails exports that
// production prints fine (theme SVGs relabelled image/jpeg never decode).

const fixtures = {};
let server;
let origin;

beforeAll(async () => {
  fixtures["/garden-tomatoes.svg"] = {
    type: "image/svg+xml",
    body: readFileSync(new URL("../public/images/garden-tomatoes.svg", import.meta.url)),
  };
  fixtures["/utensil-fork.svg"] = {
    type: "image/svg+xml",
    body: readFileSync(new URL("../public/images/utensil-fork.svg", import.meta.url)),
  };
  fixtures["/alpha.png"] = {
    type: "image/png",
    body: await sharp({
      create: { width: 600, height: 400, channels: 4, background: { r: 120, g: 80, b: 40, alpha: 0.4 } },
    }).png().toBuffer(),
  };
  fixtures["/photo.jpg"] = {
    type: "image/jpeg",
    body: await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: "#8a5d3b" },
    }).jpeg({ quality: 95 }).toBuffer(),
  };
  // Already tiny: re-encoding cannot beat it, so the original is kept.
  fixtures["/tiny.webp"] = {
    type: "image/webp",
    body: await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } })
      .webp({ quality: 10 })
      .toBuffer(),
  };

  server = createServer((req, res) => {
    const fixture = fixtures[req.url];
    if (!fixture) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": fixture.type }).end(fixture.body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

/** Drives the interception handler the way puppeteer would and reports how
    the request was resolved. */
async function intercept(path) {
  let handler;
  const page = {
    setRequestInterception: async () => {},
    on: (event, fn) => {
      if (event === "request") handler = fn;
    },
  };
  await installPrintImageNormalization(page);
  return new Promise((resolve) => {
    let handled = false;
    handler({
      resourceType: () => "image",
      url: () => `${origin}${path}`,
      headers: () => ({}),
      isInterceptResolutionHandled: () => handled,
      continue: async () => {
        handled = true;
        resolve({ kind: "continue" });
      },
      respond: async (response) => {
        handled = true;
        resolve({ kind: "respond", ...response });
      },
    });
  });
}

const SHARP_FORMAT_TO_TYPE = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

describe("installPrintImageNormalization (local mirror of production)", () => {
  it.each(["/garden-tomatoes.svg", "/utensil-fork.svg"])(
    "hands %s back to Chromium untouched instead of rasterizing it",
    async (path) => {
      expect((await intercept(path)).kind).toBe("continue");
    },
  );

  it("keeps an image with alpha as PNG, transparency intact", async () => {
    const result = await intercept("/alpha.png");
    expect(result.kind).toBe("respond");
    expect(result.contentType).toBe("image/png");
    const metadata = await sharp(result.body).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.hasAlpha).toBe(true);
  });

  it.each(["/alpha.png", "/photo.jpg", "/tiny.webp"])(
    "labels the bytes it responds with for %s as what they really are",
    async (path) => {
      const result = await intercept(path);
      expect(result.kind).toBe("respond");
      const { format } = await sharp(result.body).metadata();
      expect(result.contentType).toBe(SHARP_FORMAT_TO_TYPE[format]);
    },
  );

  it("caps an oversized photograph at the print ceiling", async () => {
    const result = await intercept("/photo.jpg");
    const metadata = await sharp(result.body).metadata();
    expect(Math.max(metadata.width, metadata.height)).toBe(2560);
  });
});
