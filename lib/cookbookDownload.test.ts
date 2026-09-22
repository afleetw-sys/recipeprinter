// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadPreparedCookbook } from "@/lib/cookbookPdfExport";
import { strFromU8, unzipSync } from "fflate";
import { Blob as NodeBlob } from "node:buffer";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("automatic cookbook download", () => {
  it("starts exactly one browser download for a two-PDF hardcover package", async () => {
    let downloaded: Blob | undefined;
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn((blob: Blob) => {
        downloaded = blob;
        return "blob:test-download";
      }),
      revokeObjectURL: vi.fn(),
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const name = await downloadPreparedCookbook([
      { name: "Family-Hardcover-8x10.pdf", blob: new NodeBlob(["%PDF-pages"]) as Blob, role: "pages" },
      { name: "Family-Cover-Hardcover-8x10.pdf", blob: new NodeBlob(["%PDF-cover"]) as Blob, role: "cover" },
    ]);

    expect(click).toHaveBeenCalledOnce();
    expect(name).toBe("Family-Hardcover-8x10-Print-Files.zip");
    const archive = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(downloaded!);
    });
    const files = unzipSync(new Uint8Array(archive));
    expect(strFromU8(files["Family-Hardcover-8x10.pdf"]!)).toBe("%PDF-pages");
    expect(strFromU8(files["Family-Cover-Hardcover-8x10.pdf"]!)).toBe("%PDF-cover");
  });
});
