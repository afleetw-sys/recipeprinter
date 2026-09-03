/**
 * `libheif-js` ships no types at its package root (only inside the wasm build),
 * and we use exactly three calls from it — so this declares the shape we
 * actually touch rather than pulling in the generated Emscripten surface.
 *
 * `libheif-js/wasm-bundle` is the browser entry: it inlines the `.wasm` into the
 * JavaScript, which is what makes it survive a bundler without a separate asset
 * to serve. Its `module.exports` is already the FACTORY'S RESULT — a promise —
 * so callers await the import and then await the value.
 */
declare module "libheif-js/wasm-bundle" {
  interface HeifImage {
    get_width(): number;
    get_height(): number;
    /** Renders into `target`, calling back with it, or with null on failure. */
    display(
      target: { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number },
      done: (result: { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number } | null) => void,
    ): void;
  }

  interface HeifDecoder {
    /** Every image in the container; `[0]` is the primary one. */
    decode(data: Uint8Array): HeifImage[];
  }

  interface LibheifModule {
    HeifDecoder: new () => HeifDecoder;
  }

  const libheif: Promise<LibheifModule>;
  export default libheif;
}
