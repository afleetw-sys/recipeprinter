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

export function formatRecipeTime(value?: string | number | null): string | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    return formatMinutes(value) || null;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  const minutes = minutesFromRecipeTime(trimmed);
  return minutes === null ? trimmed : formatMinutes(minutes) || trimmed;
}
