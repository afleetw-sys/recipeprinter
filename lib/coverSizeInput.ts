/** Millimetres or centimetres to an inch. */
const PER_INCH = { mm: 25.4, cm: 2.54 } as const;

/**
 * A cover measurement typed or pasted by the cook, in inches, or null.
 *
 * Read the way people actually enter it, not as a bare number. These fields
 * were read with `Number()`, so a size copied off Lulu's REQUIREMENTS with its
 * inch mark (`19.25"`), typed with a comma decimal (`17,25`), or written with
 * its unit left Download cover disabled while every box looked filled in, and
 * nothing said why. Millimetres and centimetres convert, since a printer
 * outside the US states them. Two numbers in one box ("17.25 x 11.25") still
 * read as nothing rather than as the first of them.
 */
export function parseCoverInches(raw: string): number | null {
  const match = raw
    .trim()
    .toLowerCase()
    .match(/^(\d+(?:[.,]\d+)?|[.,]\d+)\s*("|″|”|''|in|inch|inches|mm|cm)?\.?$/);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  const unit = match[2] as keyof typeof PER_INCH | undefined;
  const inches = unit && unit in PER_INCH ? value / PER_INCH[unit] : value;
  return Number.isFinite(inches) && inches > 0 ? inches : null;
}

/** Keep one positive decimal-shaped value while someone types or pastes a
    dimension. Units, multiplication signs and other copy from the printer's
    requirements block never enter state. A comma is a decimal point, as most
    of the world writes one: dropped, it turned 17,25 into 1725. */
export function sanitizeDecimal(value: string): string {
  const numeric = value.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const [whole = "", ...fraction] = numeric.split(".");
  return fraction.length > 0 ? `${whole}.${fraction.join("")}` : whole;
}

/** Inches as a box shows them: no unit, at most four decimals. */
export function formatInches(inches: number): string {
  return String(Number(inches.toFixed(4)));
}

/**
 * A printer's whole cover requirements pasted into one box, split into the
 * three it holds: Lulu's REQUIREMENTS gives "Dimensions 19.25" x 12.25"
 * (488.95mm x 311.15mm)" and "Spine Width 0.4823" (12.25mm)" together, and
 * copying it all is quicker than copying three numbers one at a time. The
 * first width-by-height pair is the sheet (in millimetres or centimetres if
 * that is the unit it is given in, converted); a number after "spine" is the
 * spine. Null when the paste is not one of these, so it pastes as usual.
 */
export function parseCoverPaste(text: string): { w?: string; h?: string; spine?: string } | null {
  const NUMBER = String.raw`(\d+(?:[.,]\d+)?|[.,]\d+)`;
  const UNIT = String.raw`\s*("|″|”|''|in(?:ch(?:es)?)?|mm|cm)?`;
  const normal = text.toLowerCase();
  const read = (value: string, unit: string | undefined) => parseCoverInches(`${value}${unit ? ` ${unit}` : ""}`);

  const fields: { w?: string; h?: string; spine?: string } = {};
  const pair = normal.match(new RegExp(`${NUMBER}${UNIT}\\s*[x×]\\s*${NUMBER}${UNIT}`));
  if (pair) {
    // A unit written only after the second number applies to both.
    const unit = pair[2] ?? pair[4];
    const w = read(pair[1], unit);
    const h = read(pair[3], pair[4] ?? unit);
    if (w && h) {
      fields.w = formatInches(w);
      fields.h = formatInches(h);
    }
  }
  const spine = normal.match(new RegExp(`spine[^\\d.,]*${NUMBER}${UNIT}`));
  if (spine) {
    const inches = read(spine[1], spine[2]);
    if (inches) fields.spine = formatInches(inches);
  }
  return Object.keys(fields).length > 0 ? fields : null;
}
