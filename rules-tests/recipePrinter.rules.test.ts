import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { afterAll, beforeAll, describe, test } from "vitest";

let environment: RulesTestEnvironment;

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: "recipeprinter-rules-test",
    firestore: {
      rules: readFileSync(resolve("firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8088,
    },
    storage: {
      rules: readFileSync(resolve("storage.rules"), "utf8"),
      host: "127.0.0.1",
      port: 9198,
    },
  });
});

afterAll(async () => {
  await environment.cleanup();
});

describe("Recipe Printer Firestore namespace", () => {
  test("owners can create revisioned projects and other users cannot read them", async () => {
    const owner = environment.authenticatedContext("owner").firestore();
    const stranger = environment.authenticatedContext("stranger").firestore();
    const path = "products/recipePrinter/users/owner/printProjects/book-1";
    await assertSucceeds(
      setDoc(doc(owner, path), {
        id: "book-1",
        ownerUid: "owner",
        revision: 1,
        kind: "cookbook",
        sections: [],
        settings: {},
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    await assertFails(getDoc(doc(stranger, path)));
  });

  test("owners can bootstrap harmless account metadata and refresh lastSeenAt", async () => {
    const owner = environment.authenticatedContext("account-owner").firestore();
    const account = doc(owner, "products/recipePrinter/users/account-owner");
    await assertSucceeds(
      setDoc(account, {
        createdAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
        email: "owner@example.com",
        displayName: "Recipe Owner",
        photoURL: "https://example.com/photo.jpg",
        providerIds: ["password"],
      }),
    );
    await assertSucceeds(
      updateDoc(account, {
        displayName: "Updated Owner",
        lastSeenAt: serverTimestamp(),
      }),
    );
  });

  test("clients cannot write sensitive account fields", async () => {
    const owner = environment.authenticatedContext("owner").firestore();
    await assertFails(
      setDoc(doc(owner, "products/recipePrinter/users/owner"), {
        recipePrinterAdmin: true,
      }),
    );

    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "products/recipePrinter/users/existing-owner"), {
        createdAt: new Date(),
        lastSeenAt: new Date(),
        entitlement: "server-owned",
      });
    });
    const existingOwner = environment.authenticatedContext("existing-owner").firestore();
    await assertFails(
      updateDoc(doc(existingOwner, "products/recipePrinter/users/existing-owner"), {
        entitlement: "premium",
      }),
    );
  });

  test("public users can read published shared cards only", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "products/recipePrinter/sharedRecipeCards/live"), {
        published: true,
      });
      await setDoc(doc(context.firestore(), "products/recipePrinter/sharedRecipeCards/draft"), {
        published: false,
      });
    });
    const publicDb = environment.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(publicDb, "products/recipePrinter/sharedRecipeCards/live")));
    await assertFails(getDoc(doc(publicDb, "products/recipePrinter/sharedRecipeCards/draft")));
  });

  test("feedback can be created but not read", async () => {
    const publicDb = environment.unauthenticatedContext().firestore();
    const feedback = doc(publicDb, "products/recipePrinter/feedback/feedback-1");
    await assertSucceeds(
      setDoc(feedback, {
        type: "idea",
        message: "A useful idea",
        email: null,
        pageUrl: "https://recipeprinter.com",
        pagePath: "/",
        userAgent: "test",
        language: "en",
        viewport: "100x100",
        referrer: "",
        status: "new",
        source: "recipeprinter-footer",
        createdAt: new Date(),
      }),
    );
    await assertFails(getDoc(feedback));
  });

  // The cookbook unlock IS the $19.99 purchase record. Access is granted on the
  // mere existence of this document, so "can a client write one?" is the whole
  // paywall. It used to be yes. These lock that answer down, on both the
  // namespaced path and the legacy one, while proving the reads the product
  // actually depends on still work.
  describe("cookbook unlocks are server-owned", () => {
    const unlockPath = (uid: string, projectId: string) =>
      `products/recipePrinter/users/${uid}/cookbookUnlocks/${projectId}`;

    /** Writes an unlock the way the RevenueCat webhook does — admin SDK, rules
        bypassed — so the read tests have something real to read. */
    async function seedUnlock(path: string) {
      await environment.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), path), {
          projectId: "book-1",
          unlockedAt: 1,
          source: "revenuecat",
        });
      });
    }

    test("a signed-in user cannot grant themselves the paid unlock", async () => {
      const owner = environment.authenticatedContext("buyer").firestore();
      await assertFails(
        setDoc(doc(owner, unlockPath("buyer", "book-1")), { projectId: "book-1", unlockedAt: 1 }),
      );
    });

    test("an existing unlock cannot be altered or deleted by its owner", async () => {
      await seedUnlock(unlockPath("buyer2", "book-1"));
      const owner = environment.authenticatedContext("buyer2").firestore();
      const ref = doc(owner, unlockPath("buyer2", "book-1"));
      // A refund revokes by deleting this doc, so a client that could delete it
      // could also un-revoke itself by re-creating one.
      await assertFails(updateDoc(ref, { projectId: "book-2" }));
      await assertFails(deleteDoc(ref));
    });

    test("the owner can still read one unlock and list them all", async () => {
      await seedUnlock(unlockPath("buyer3", "book-1"));
      const owner = environment.authenticatedContext("buyer3").firestore();
      await assertSucceeds(getDoc(doc(owner, unlockPath("buyer3", "book-1"))));
      // The projects list reads the whole collection in one query rather than a
      // point lookup per project — `read` has to cover `list`, not just `get`.
      await assertSucceeds(
        getDocs(collection(owner, "products/recipePrinter/users/buyer3/cookbookUnlocks")),
      );
    });

    test("nobody else can read someone's unlocks", async () => {
      await seedUnlock(unlockPath("buyer4", "book-1"));
      const stranger = environment.authenticatedContext("stranger").firestore();
      await assertFails(getDoc(doc(stranger, unlockPath("buyer4", "book-1"))));
    });

    test("the legacy path is closed to writes but still readable", async () => {
      const legacy = "users/buyer5/cookbookUnlocks/book-1";
      await environment.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), legacy), { projectId: "book-1", unlockedAt: 1 });
      });
      const owner = environment.authenticatedContext("buyer5").firestore();
      // Readable so long-standing owners keep their books with no backfill…
      await assertSucceeds(getDoc(doc(owner, legacy)));
      // …but this path was looser than the namespaced one, so it closes too.
      await assertFails(setDoc(doc(owner, "users/buyer5/cookbookUnlocks/book-2"), {
        projectId: "book-2",
      }));
    });
  });
});

describe("debugInbox drop box", () => {
  const row = {
    product: "recipeprinter",
    source: "url",
    category: "no_recipe",
    reason: "no recipe found",
    payload: "https://example.org/soup",
    payloadTruncated: false,
    payloadLength: 24,
    imagePath: null,
    imageCount: 0,
    user: "",
    userAgent: "test",
    createdAt: serverTimestamp(),
  };

  // The whole point: the visitor we most need to hear from has no account.
  test("a signed-out visitor can file a failed import", async () => {
    const guest = environment.unauthenticatedContext().firestore();
    await assertSucceeds(setDoc(doc(guest, "debugInbox/guest-row"), row));
  });

  test("nothing filed here can be read, changed or removed by a client", async () => {
    await environment.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(admin.firestore(), "debugInbox/existing"), row);
    });
    const guest = environment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(guest, "debugInbox/existing")));
    await assertFails(updateDoc(doc(guest, "debugInbox/existing"), { reason: "changed" }));
    await assertFails(deleteDoc(doc(guest, "debugInbox/existing")));
  });

  // Free document storage is the failure mode a create-only rule invites.
  test("it will not take a row that is the wrong shape", async () => {
    const guest = environment.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(guest, "debugInbox/extra-field"), { ...row, smuggled: "anything" }),
    );
    await assertFails(
      setDoc(doc(guest, "debugInbox/huge"), { ...row, payload: "x".repeat(20_001) }),
    );
    await assertFails(
      setDoc(doc(guest, "debugInbox/wrong-product"), { ...row, product: "somethingelse" }),
    );
    await assertFails(
      setDoc(doc(guest, "debugInbox/no-category"), {
        product: "recipeprinter",
        source: "url",
        createdAt: serverTimestamp(),
      }),
    );
  });
});

describe("Recipe Printer Storage namespace", () => {
  test("existing CookPilot recipe images remain owner-only", async () => {
    const ownerStorage = environment.authenticatedContext("owner").storage();
    const strangerStorage = environment.authenticatedContext("stranger").storage();
    const path = "recipe-images/owner/photo.jpg";
    await assertSucceeds(
      Promise.resolve(ownerStorage.ref(path).putString("image", "raw", { contentType: "image/jpeg" })),
    );
    await assertFails(
      Promise.resolve(strangerStorage.ref(path).putString("image", "raw", { contentType: "image/jpeg" })),
    );
  });

  test("users write only to their own photo prefix", async () => {
    const ownerStorage = environment.authenticatedContext("owner").storage();
    await assertSucceeds(
      Promise.resolve(ownerStorage.ref("recipeprinter/photos/users/owner/photo.jpg").putString(
        "image",
        "raw",
        { contentType: "image/jpeg" },
      )),
    );
    await assertFails(
      Promise.resolve(ownerStorage.ref("recipeprinter/photos/users/stranger/photo.jpg").putString(
        "image",
        "raw",
        { contentType: "image/jpeg" },
      )),
    );
  });

  test("the legacy photo root is read-only, and still can't reach the reserved prefixes", async () => {
    // This test used to assert the opposite — that an unauthenticated write to
    // the legacy root SUCCEEDS — which is exactly the hole it was encoding as an
    // expectation. `allow write` there meant create AND update AND delete, with
    // no auth check, for any first segment that wasn't reserved. Anyone holding
    // a photo URL could overwrite the picture behind it in someone else's
    // cookbook, including one that had been paid for.
    const anonymousStorage = environment.unauthenticatedContext().storage();
    const strangerStorage = environment.authenticatedContext("stranger").storage();

    await assertFails(
      Promise.resolve(anonymousStorage.ref("recipeprinter/photos/anon/photo.jpg").putString(
        "image",
        "raw",
        { contentType: "image/jpeg" },
      )),
    );
    // Being signed in as somebody is no help either — the root is closed to
    // writes outright, not merely to strangers.
    await assertFails(
      Promise.resolve(strangerStorage.ref("recipeprinter/photos/anon/someone-elses.jpg").putString(
        "image",
        "raw",
        { contentType: "image/jpeg" },
      )),
    );
    // The reserved-prefix guard still holds: overlapping Storage matches are
    // ORed, so the legacy rule must never become a way around the owner checks.
    await assertFails(
      Promise.resolve(anonymousStorage.ref("recipeprinter/photos/users/owner/bypass.jpg").putString(
        "image",
        "raw",
        { contentType: "image/jpeg" },
      )),
    );
  });

  test("debug captures can be dropped but never overwritten or removed", async () => {
    const anonymousStorage = environment.unauthenticatedContext().storage();
    // The pre-namespace location allowed `write`, so a capture already
    // collected could be replaced or deleted by anyone. Create only.
    const legacyDebug = anonymousStorage.ref("debug/failed-imports/case/payload.txt");
    await assertSucceeds(
      Promise.resolve(legacyDebug.putString("failed input", "raw", { contentType: "text/plain" })),
    );
    await assertFails(legacyDebug.getDownloadURL());
    await assertFails(Promise.resolve(legacyDebug.delete()));
  });

  test("anonymous uploads are write-only by capability prefix and debug captures are private", async () => {
    const anonymousStorage = environment.unauthenticatedContext().storage();
    await assertSucceeds(
      Promise.resolve(anonymousStorage.ref("recipeprinter/photos/anonymous/abcdefghijklmnopqrst/photo.jpg").putString(
        "image",
        "raw",
        { contentType: "image/jpeg" },
      )),
    );
    const debugRef = anonymousStorage.ref("recipeprinter/debug/failed-imports/no-recipe/payload.txt");
    await assertSucceeds(
      Promise.resolve(debugRef.putString("failed input", "raw", { contentType: "text/plain" })),
    );
    await assertFails(debugRef.getDownloadURL());
  });
});

describe("server-owned fields on the shared CookPilot user document", () => {
  // `recipePrinterAdmin()` ORs a namespaced check with a legacy one that reads
  // `users/{uid}.recipePrinterAdmin`. The namespaced account document pins its
  // keys to a harmless allowlist, so the flag cannot be set there — but the
  // legacy CookPilot document it falls back to was `allow write: if owns(uid)`
  // with no field validation at all, which let any signed-in user grant
  // themselves the flag and then publish or overwrite shared recipe cards on
  // the public site. The same document carries the CookPilot membership and
  // free-template claim fields, which are server-owned for the same reason.
  test("a signed-in user cannot grant themselves the admin role", async () => {
    const user = environment.authenticatedContext("escalator").firestore();
    await assertFails(
      setDoc(doc(user, "users/escalator"), { recipePrinterAdmin: true }, { merge: true }),
    );
  });

  test("a signed-in user cannot fake membership or a free-template grant", async () => {
    const user = environment.authenticatedContext("faker").firestore();
    await assertFails(
      setDoc(doc(user, "users/faker"), { plusExpiresAt: new Date(4102444800000) }, { merge: true }),
    );
    await assertFails(
      setDoc(
        doc(user, "users/faker"),
        { recipePrinterFreeTemplateGranted: "template_botanical" },
        { merge: true },
      ),
    );
    await assertFails(
      setDoc(doc(user, "users/faker"), { recipePrinterFreeTemplateGrantedAt: 1 }, { merge: true }),
    );
  });

  test("a server-owned field cannot be added on create either", async () => {
    const user = environment.authenticatedContext("creator").firestore();
    await assertFails(
      setDoc(doc(user, "users/creator"), { displayName: "Cook", recipePrinterAdmin: true }),
    );
  });

  test("the document still works for the CookPilot fields it owns", async () => {
    const user = environment.authenticatedContext("cookpilot-user").firestore();
    await assertSucceeds(
      setDoc(doc(user, "users/cookpilot-user"), { displayName: "Cook", theme: "dark" }),
    );
    await assertSucceeds(
      setDoc(doc(user, "users/cookpilot-user"), { theme: "light" }, { merge: true }),
    );
    await assertSucceeds(getDoc(doc(user, "users/cookpilot-user")));
  });

  test("an existing subscriber can still edit unrelated fields", async () => {
    // A real subscriber has `plusExpiresAt` set by the CookPilot backend. A
    // merge write that leaves it alone must still pass, or this rule would
    // lock every paying CookPilot user out of their own profile.
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users/subscriber"), {
        plusExpiresAt: new Date(4102444800000),
        displayName: "Before",
      });
    });
    const subscriber = environment.authenticatedContext("subscriber").firestore();
    await assertSucceeds(
      setDoc(doc(subscriber, "users/subscriber"), { displayName: "After" }, { merge: true }),
    );
    await assertFails(
      setDoc(doc(subscriber, "users/subscriber"), { plusExpiresAt: new Date(4102444800001) }, { merge: true }),
    );
  });

  test("an admin planted by the server still administers shared cards", async () => {
    // The legacy admin read stays in place until the backfill is verified, so
    // a flag written with the admin SDK must keep working. Only the client
    // write path is closed.
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users/planted-admin"), {
        recipePrinterAdmin: true,
      });
    });
    const planted = environment.authenticatedContext("planted-admin").firestore();
    await assertSucceeds(
      setDoc(doc(planted, "products/recipePrinter/sharedRecipeCards/from-planted"), {
        published: true,
        createdBy: "planted-admin",
        title: "Legitimate",
      }),
    );
  });
});
