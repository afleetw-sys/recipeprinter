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

  // Autofill and password managers dispatch a "keydown" that is a plain Event:
  // no `key` at all. That used to throw on every such event.
  it.each([
    ["a keydown with no key", new Event("keydown")],
    ["a keydown whose key isn't a string", Object.assign(new Event("keydown"), { key: undefined, metaKey: true, shiftKey: true })],
  ])("ignores %s instead of throwing", (_name, event) => {
    for (const platform of ["MacIntel", "Win32", ""]) {
      expect(screenshotShortcutFrom(event as KeyboardEvent, platform)).toBeNull();
    }
  });
});
