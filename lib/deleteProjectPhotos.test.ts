import { describe, expect, it } from "vitest";
import { selectPhotosToDelete } from "@/lib/printProjects";

// Deleting a project deletes its photos, but a photo is only the project's to
// delete when it is this account's own upload and nothing else uses it: books
// copied from one another share photos, and so can this browser's open work.

const storageUrl = (path: string) =>
  `https://firebasestorage.googleapis.com/v0/b/bucket/o/${encodeURIComponent(path)}?alt=media&token=t`;

const own = storageUrl("recipeprinter/photos/users/u1/1-cover.jpg");
const ownChapter = storageUrl("recipeprinter/photos/users/u1/2-chapter.jpg");
const adopted = storageUrl("recipeprinter/photos/users/u1/adopted/book-1/a.jpg");
const someoneElse = storageUrl("recipeprinter/photos/users/u2/1.jpg");
const recipeSite = "https://www.example-recipes.com/wp-content/uploads/lasagna.jpg";

describe("selectPhotosToDelete", () => {
  it("deletes the account's own uploads that nothing else uses", () => {
    expect(selectPhotosToDelete("u1", [own, ownChapter], [])).toEqual([own, ownChapter]);
  });

  it("keeps a photo another project or this browser still uses", () => {
    expect(selectPhotosToDelete("u1", [own, ownChapter], [ownChapter])).toEqual([own]);
  });

  it("never touches recipe-site images, other accounts, or adopted copies", () => {
    expect(selectPhotosToDelete("u1", [recipeSite, someoneElse, adopted], [])).toEqual([]);
  });

  it("lists a photo once however many places in the book use it", () => {
    expect(selectPhotosToDelete("u1", [own, own, own], [])).toEqual([own]);
  });
});
