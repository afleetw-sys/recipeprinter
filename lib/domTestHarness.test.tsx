// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

// Proves the opt-in DOM path works (jsdom + renderHook) so hook tests written
// for the app/print/page.tsx extraction have something real to stand on. If
// this fails, the tooling is broken, not the app.
describe("dom test harness", () => {
  it("runs a hook and applies a state update", () => {
    const { result } = renderHook(() => useState(0));
    act(() => result.current[1](3));
    expect(result.current[0]).toBe(3);
  });

  it("has a document", () => {
    expect(typeof document.createElement).toBe("function");
  });
});
