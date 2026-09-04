import { describe, expect, it } from "vitest";
import { composeNote, splitNote } from "./recipeNote";

const BLURB = "A cosy weeknight favourite the whole family asks for.";
const OWN = "Nana used half the butter.";

describe("composeNote", () => {
  it("stacks the website blurb above the cook's own note", () => {
    expect(composeNote(BLURB, OWN, true)).toBe(`${BLURB}\n${OWN}`);
  });

  it("shows only the cook's own words when the box is unticked", () => {
    expect(composeNote(BLURB, OWN, false)).toBe(OWN);
  });

  it("empties completely when the box is unticked and they wrote nothing", () => {
    expect(composeNote(BLURB, undefined, false)).toBe("");
  });

  it("does not leave a stray blank line when one half is missing", () => {
    expect(composeNote(BLURB, undefined, true)).toBe(BLURB);
    expect(composeNote(undefined, OWN, true)).toBe(OWN);
    expect(composeNote("   ", OWN, true)).toBe(OWN);
  });
});

describe("splitNote", () => {
  it("keeps the blurb and takes the rest as the cook's, when it is on", () => {
    expect(splitNote(`${BLURB}\n${OWN}`, BLURB, true)).toEqual({
      description: BLURB,
      note: OWN,
    });
  });

  it("treats everything as the cook's when the blurb is switched off", () => {
    // The blurb is not on screen, so an edit cannot have touched it — and it
    // must survive to come back when the box is ticked again.
    expect(splitNote("Just mine now.", BLURB, false)).toEqual({
      description: BLURB,
      note: "Just mine now.",
    });
  });

  it("hands the words over when the cook rewrites the blurb itself", () => {
    expect(splitNote("My own version entirely.", BLURB, true)).toEqual({
      description: undefined,
      note: "My own version entirely.",
    });
  });

  it("round-trips: compose then split gives back what went in", () => {
    const composed = composeNote(BLURB, OWN, true);
    expect(splitNote(composed, BLURB, true)).toEqual({ description: BLURB, note: OWN });
  });

  it("survives a toggle off and back on without losing either half", () => {
    const off = composeNote(BLURB, OWN, false);
    const afterOff = splitNote(off, BLURB, false);
    expect(composeNote(afterOff.description, afterOff.note, true)).toBe(`${BLURB}\n${OWN}`);
  });

  it("clearing the field leaves nothing of the cook's, blurb intact", () => {
    expect(splitNote("", BLURB, false)).toEqual({ description: BLURB, note: undefined });
    expect(splitNote("   ", BLURB, false)).toEqual({ description: BLURB, note: undefined });
  });

  it("deleting everything while it is on drops both", () => {
    expect(splitNote("", BLURB, true)).toEqual({ description: undefined, note: undefined });
  });
});
