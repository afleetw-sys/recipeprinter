/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import type { Metadata } from "next";

// Pages that are per-person, per-session or internal tooling. Each must opt
// out of the index in its own layout: the root layout says `index: true`, so a
// route with no layout of its own (as /projects and /account once were)
// silently inherits it and gets indexed as an empty signed-out shell.
const PRIVATE_ROUTES = ["print", "export", "print-check", "projects", "account"];

// A glob rather than imports, so a route with no layout fails the assertion
// below instead of failing to load.
const layouts = import.meta.glob<{ metadata?: Metadata }>("../app/*/layout.tsx");

describe("private routes are noindex", () => {
  it.each(PRIVATE_ROUTES)("/%s", async (route) => {
    const load = layouts[`../app/${route}/layout.tsx`];
    const robots = load ? (await load()).metadata?.robots : undefined;
    expect(robots && typeof robots === "object" ? robots.index : "inherits index: true").toBe(false);
  });
});
