import sharp from "sharp";

const MAX_PX = 2560;
// Keep in sync with MAX_PARALLEL_NORMALIZATIONS in functions-pdf/src/printImages.ts.
const MAX_PARALLEL = Number(process.env.DIAG_MAX_PARALLEL ?? 6);

/** Local mirror of functions-pdf/src/printImages.ts. Production owns the
    implementation; this keeps the stress harness representative. */
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
        const response = await fetch(request.url(), {signal: AbortSignal.timeout(30_000)});
        if (!response.ok) {
          await request.continue();
          return;
        }
        const source = Buffer.from(await response.arrayBuffer());
        const normalized = await sharp(source, {failOn: "none"})
          .rotate()
          .resize({width: MAX_PX, height: MAX_PX, fit: "inside", withoutEnlargement: true})
          .jpeg({quality: 82, mozjpeg: true})
          .toBuffer();
        const body = normalized.length < source.length ? normalized : source;
        await request.respond({
          status: 200,
          contentType: "image/jpeg",
          headers: {"cache-control": "private, max-age=3600"},
          body,
        });
      } catch {
        if (!request.isInterceptResolutionHandled()) await request.continue();
      } finally {
        release();
      }
    })();
  });
}
