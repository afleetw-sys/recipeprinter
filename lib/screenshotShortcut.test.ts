// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { screenshotShortcutFrom } from "./screenshotShortcut";

function key(keyValue: string, options: KeyboardEventInit = {}) {
  return new KeyboardEvent("keydown", { key: keyValue, ...options });
}

describe("screenshotShortcutFrom", () => {
  it.each([
    ["3", "macos_full_screen"],
    ["4", "macos_selection"],
    ["5", "macos_screenshot_app"],
  ] as const)("recognizes Cmd-Shift-%s", (keyValue, shortcut) => {
    expect(screenshotShortcutFrom(key(keyValue, { metaKey: true, shiftKey: true }), "MacIntel")).toBe(shortcut);
  });

  it("recognizes Print Screen", () => {
    expect(screenshotShortcutFrom(key("PrintScreen"), "Win32")).toBe("print_screen");
  });

  it("recognizes Win-Shift-S when it reaches the page", () => {
    expect(screenshotShortcutFrom(key("s", { metaKey: true, shiftKey: true }), "Win32")).toBe(
      "windows_snipping_tool",
    );
  });

  it("ignores ordinary and repeated key presses", () => {
    expect(screenshotShortcutFrom(key("s", { ctrlKey: true }), "Win32")).toBeNull();
    expect(
      screenshotShortcutFrom(key("4", { metaKey: true, shiftKey: true, repeat: true }), "MacIntel"),
    ).toBeNull();
  });
});
