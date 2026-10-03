import sharp from "sharp";

/* Local mirror of CookPilot's functions-pdf/src/printImages.ts. Production
   owns the implementation; this keeps `npm run pdf:dev` and the stress harness
   representative. CookPilot is a separate repo, so the logic is copied rather
   than imported: keep `skipReason`, `normalizePrintImage` and the respond /
   continue decisions in `installPrintImageNormalization` line-for-line
   equivalent to production. Production's metrics bookkeeping is left out.
   scripts/pdf-print-image-normalizer.test.mjs pins the rules that matter:
   SVG is handed back to Chromium, alpha stays PNG, and every response is
   labelled with the type of the bytes actually sent. */

// Keep in sync with PRINT_IMAGE_MAX_PX in functions-pdf/src/printImages.ts.
const PRINT_IMAGE_MAX_PX = 2560;
const JPEG_QUALITY = 82;
// Keep in sync with MAX_PARALLEL_NORMALIZATIONS in functions-pdf/src/printImages.ts.
const MAX_PARALLEL = Number(process.env.DIAG_MAX_PARALLEL ?? 6);

/** Why `normalizePrintImage` would skip this image, or null if it would not. */
function skipReason(metadata) {
  if (!metadata.width || !metadata.height) return "no width/height in metadata";
  if (metadata.format === "svg") return "svg";
  if ((metadata.pages ?? 1) > 1) return `multi-page/animated (pages=${metadata.pages})`;
  return null;
}

/** Same contract as production: null means "let Chromium load the original". */
export async function normalizePrintImage(source) {
  const input = sharp(source, {failOn: "none"}).rotate();
  const metadata = await input.metadata();
  if (skipReason(metadata)) {
    return null;
  }

  let pipeline = input.resize({
    width: PRINT_IMAGE_MAX_PX,
    height: PRINT_IMAGE_MAX_PX,
    fit: "inside",
    withoutEnlargement: true,
  });
  let contentType = "image/jpeg";
  if (metadata.hasAlpha) {
    pipeline = pipeline.png({compressionLevel: 8});
    contentType = "image/png";
  } else {
    pipeline = pipeline.jpeg({quality: JPEG_QUALITY, mozjpeg: true});
  }

  const normalized = await pipeline.toBuffer();
  return {body: normalized.length < source.length ? normalized : source, contentType};
}

export async function installPrintImageNormalization(page) {
  let active = 0;
  const waiting = [];
  const acquire = async () => {
    if (active >= MAX_PARALLEL) await new Promise((resolve) => waiting.push(resolve));
    active += 1;
  };
  const release = () => {
    active -= 1;
    waiting.shift()?.();
  };

  await page.setRequestInterception(true);
  page.on("request", (request) => {
    void (async () => {
      if (request.resourceType() !== "image" || !/^https?:/i.test(request.url())) {
        await request.continue();
        return;
      }
      await acquire();
      try {
        const response = await fetch(request.url(), {
          headers: {
            accept: request.headers().accept ?? "image/avif,image/webp,image/*,*/*;q=0.8",
            "user-agent": request.headers()["user-agent"] ?? "RecipePrinter PDF renderer",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) {
          await request.continue();
          return;
        }
        const source = Buffer.from(await response.arrayBuffer());
        const normalized = await normalizePrintImage(source);
        if (!normalized) {
          await request.continue();
          return;
        }
        const originalType = response.headers.get("content-type")?.split(";", 1)[0];
        await request.respond({
          status: 200,
          contentType: normalized.body === source && originalType ? originalType : normalized.contentType,
          headers: {"cache-control": "private, max-age=3600"},
          body: normalized.body,
        });
      } catch (error) {
        console.warn("pdf:dev: image normalization failed", error);
        if (!request.isInterceptResolutionHandled()) await request.continue().catch(() => undefined);
      } finally {
        release();
      }
    })();
  });
}
