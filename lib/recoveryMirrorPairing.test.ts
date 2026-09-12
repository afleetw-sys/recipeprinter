import { beforeEach, describe, expect, it } from "vitest";
import {
  META_RECOVERY_OWNER_KEY,
  QUEUE_RECOVERY_OWNER_KEY,
  recoveryMirrorsAgree,
  recoveryOwnerId,
  stampRecoveryOwner,
} from "@/lib/recoveryMirror";
import { PROJECT_META_STORAGE_KEY, readMeta } from "@/lib/project";

/* The working copy is mirrored to localStorage in two independent places — the
   recipes and the metadata around them — on two unrelated throttles. With two
   tabs open, what sits in storage is simply the last write to each key, and the
   pair can be from different books. Recovering them together hands one book's
   recipes to another book's `projectId`, which the reattach check then matches
   to a saved document and the autosave writes over.

   These assert the pairing rule and, through `readMeta`, that a disagreement
   costs the identity rather than the recipes. */

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  get length() { return this.values.size; }
}

const local = new MemoryStorage();
const session = new MemoryStorage();

const META_RECOVERY_KEY = "recipeprinter:project-meta:recovery:v1";

/** A book's worth of metadata, as the mirror holds it. */
function meta(projectId: string, coverTitle: string) {
  return JSON.stringify({
    projectId,
    cookbookMode: true,
    cover: { title: coverTitle, template: "heirloom" },
    sections: [{ id: "s1", title: "Breads", itemIds: ["r1", "r2"] }],
  });
}

/** Puts a different tab behind the next stamp: the owner id is per-tab and
    lives in sessionStorage, so clearing it is what a second tab looks like. */
function asAnotherTab(write: () => void) {
  const mine = session.getItem("recipeprinter:recovery-owner:v1");
  session.removeItem("recipeprinter:recovery-owner:v1");
  write();
  if (mine !== null) session.setItem("recipeprinter:recovery-owner:v1", mine);
}

beforeEach(() => {
  local.clear();
  session.clear();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: local, sessionStorage: session },
  });
});

describe("pairing the two recovery mirrors", () => {
  it("treats an unstamped pair as one tab's, so an existing mirror still recovers", () => {
    expect(recoveryMirrorsAgree()).toBe(true);
  });

  it("agrees when one tab wrote both", () => {
    stampRecoveryOwner(QUEUE_RECOVERY_OWNER_KEY);
    stampRecoveryOwner(META_RECOVERY_OWNER_KEY);
    expect(recoveryMirrorsAgree()).toBe(true);
  });

  it("disagrees when the two mirrors came from different tabs", () => {
    stampRecoveryOwner(META_RECOVERY_OWNER_KEY);
    asAnotherTab(() => stampRecoveryOwner(QUEUE_RECOVERY_OWNER_KEY));
    expect(recoveryMirrorsAgree()).toBe(false);
  });

  it("disagrees when only one mirror has been rewritten since the stamp shipped", () => {
    stampRecoveryOwner(META_RECOVERY_OWNER_KEY);
    expect(recoveryMirrorsAgree()).toBe(false);
  });

  it("keeps one identity per tab across a navigation inside it", () => {
    expect(recoveryOwnerId()).toBe(recoveryOwnerId());
  });
});

describe("recovering a reopened tab", () => {
  it("restores the book when both mirrors are its own", () => {
    local.setItem(META_RECOVERY_KEY, meta("book-a", "Nana’s Kitchen"));
    stampRecoveryOwner(META_RECOVERY_OWNER_KEY);
    stampRecoveryOwner(QUEUE_RECOVERY_OWNER_KEY);

    const recovered = readMeta();
    expect(recovered.projectId).toBe("book-a");
    expect(recovered.cover?.title).toBe("Nana’s Kitchen");
    expect(recovered.sections[0]?.itemIds).toEqual(["r1", "r2"]);
  });

  it("drops an identity that belongs to another tab's recipes", () => {
    local.setItem(META_RECOVERY_KEY, meta("book-b", "Somebody Else’s Book"));
    stampRecoveryOwner(META_RECOVERY_OWNER_KEY);
    // The recipes in storage were left by a different tab.
    asAnotherTab(() => stampRecoveryOwner(QUEUE_RECOVERY_OWNER_KEY));

    const recovered = readMeta();
    // A fresh identity, so nothing autosaves over the book those chapters name.
    expect(recovered.projectId).not.toBe("book-b");
    expect(recovered.cover).toBeUndefined();
    expect(recovered.sections).toEqual([]);
    // And the mismatched mirror was not promoted into this tab's session copy.
    expect(session.getItem(PROJECT_META_STORAGE_KEY)).toBeNull();
  });
});
