import { describe, expect, it } from "vitest";
import { FIELD_SWITCH_IDS, fieldSwitchOffered } from "./recipeFields";

describe("Show on recipes", () => {
  // Cards synced to a cookbook copy the book's line choices once, when they
  // are made. A line the book had off (Source, by default) could then never
  // be shown on those cards, because their switches were hidden.
  it("offers a switch for every field, on cards and cookbooks, synced or not", () => {
    for (const cookbook of [false, true]) {
      for (const synced of [false, true]) {
        for (const id of FIELD_SWITCH_IDS) {
          expect(fieldSwitchOffered(id, { cookbook, synced }), `${id} cookbook=${cookbook} synced=${synced}`).toBe(true);
        }
      }
    }
  });
});
