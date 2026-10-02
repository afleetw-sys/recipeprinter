import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Offline, Firestore's plain `getDocs` doesn't fail: it answers from the local
// cache, which in a fresh session is empty. Every list read here then treated
// "couldn't reach the server" as "there are none": the projects library said
// "No saved projects yet", a purchase read as unbought, and two of them wrote
// a permanent "legacy collection is empty" marker off the back of it. List
// reads use `getDocsFromServer`, which rejects when it can't reach the server,
// so the caller can say it couldn't load.

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("Firestore list reads", () => {
  it("come from the server, so a dropped connection can't read as an empty list", () => {
    const offenders = ["app", "components", "lib"]
      .flatMap(sourceFiles)
      .filter((file) => /\bgetDocs\s*\(|\{[^}]*\bgetDocs\b[^}]*\}\s*=/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
