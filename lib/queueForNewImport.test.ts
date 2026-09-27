import { describe, expect, it } from "vitest";
import { queueForNewImport } from "@/lib/queue";
import type { QueueItem } from "@/types/recipe";

const item = (id: string, status: QueueItem["status"]): QueueItem =>
  ({ id, method: "url", source: "example.com", status, title: id }) as QueueItem;

describe("queueForNewImport", () => {
  const queue = [item("failed", "error"), item("ready", "ready"), item("busy", "parsing")];

  it("drops failed imports for an account that can hold one recipe", () => {
    expect(queueForNewImport(queue, true).map((entry) => entry.id)).toEqual(["ready", "busy"]);
  });

  it("keeps every failed import for Pro and cookbooks", () => {
    expect(queueForNewImport(queue, false)).toBe(queue);
  });
});
