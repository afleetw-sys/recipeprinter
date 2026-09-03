function formatMinutes(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return "";

  const rounded = Math.round(totalMinutes);
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  const parts: string[] = [];

  if (hours > 0) parts.push(`${hours} hr`);
  if (minutes > 0) parts.push(`${minutes} min`);

  return parts.join(" ") || `${rounded} min`;
}

export function parseIsoDuration(
  value: string,
): { days: number; hours: number; minutes: number } | null {
  const match = value.match(/^P(?:(\d+(?:\.\d+)?)D)?T?(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?$/i);
  if (!match) return null;

  return {
    days: match[1] ? Number(match[1]) : 0,
    hours: match[2] ? Number(match[2]) : 0,
    minutes: match[3] ? Number(match[3]) : 0,
  };
}

function minutesFromRecipeTime(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = parseIsoDuration(trimmed);
  if (iso) {
    const total = iso.days * 24 * 60 + iso.hours * 60 + iso.minutes;
    return total > 0 ? total : null;
  }

  const minuteOnly = trimmed.match(/^(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)$/i);
  if (minuteOnly) return Number(minuteOnly[1]);

  const hours = trimmed.match(/(\d+(?:\.\d+)?)\s*(?:hrs?|hours?|h)/i);
  const minutes = trimmed.match(/(\d+(?:\.\d+)?)\s*(?:mins?|minutes?|m)/i);
  if (hours || minutes) {
    return (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0);
  }

  return null;
}

/**
 * A time somebody WROTE a qualifier into: a range, an open end, an
 * approximation, a fraction.
 *
 * These must survive to the page untouched. `minutesFromRecipeTime` searches
 * for the first number that has a unit after it, which on "12 to 24 hrs."
 * finds the 24 and answers 1440 — so a card that says a roast can be done in
 * twelve hours printed "24 hr", telling the cook to run a crock pot for a day.
 * Off a pre-printed recipe card ("Cooking time ____") a range is the norm, not
 * an edge case.
 *
 * Collapsing is only safe for a duration stated as ONE quantity. Anything the
 * cook qualified says something a single number cannot, so it is passed
 * through verbatim rather than approximated. A compound like "1 hour 30
 * minutes" is still one duration and still normalizes.
 */
const AUTHORED_QUALIFIER =
  /\d\s*(?:to|or)\b|\d\s*[-–—+/]|\b(?:at least|up to|or more|or so|about|around|roughly)\b|~/i;

export function formatRecipeTime(value?: string | number | null): string | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    return formatMinutes(value) || null;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (AUTHORED_QUALIFIER.test(trimmed)) return trimmed;

  const minutes = minutesFromRecipeTime(trimmed);
  return minutes === null ? trimmed : formatMinutes(minutes) || trimmed;
}
