import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  markPostPrintDialogShown,
  POST_PRINT_DIALOG_STORAGE_KEY,
  resetPostPrintDialogForTest,
  shouldShowPostPrintDialog,
} from "@/lib/postPrintDialog";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

let memory: MemoryStorage;

beforeEach(() => {
  resetPostPrintDialogForTest();
  memory = new MemoryStorage();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: memory },
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

describe("post-print dialog", () => {
  it("shows the first time", () => {
    expect(shouldShowPostPrintDialog()).toBe(true);
  });

  it("stops showing once marked shown", () => {
    void markPostPrintDialogShown();
    expect(memory.getItem(POST_PRINT_DIALOG_STORAGE_KEY)).toBe("1");
    expect(shouldShowPostPrintDialog()).toBe(false);
  });

  it("shows once per page when storage is unreadable, rather than never", () => {
    Reflect.deleteProperty(globalThis, "window");
    expect(shouldShowPostPrintDialog()).toBe(true);
    void markPostPrintDialogShown();
    expect(shouldShowPostPrintDialog()).toBe(false);
  });
});
