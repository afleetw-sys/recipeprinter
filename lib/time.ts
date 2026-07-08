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

function minutesFromRecipeTime(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = trimmed.match(
    /^P(?:(\d+(?:\.\d+)?)D)?T?(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?$/i,
  );
  if (iso) {
    const days = iso[1] ? Number(iso[1]) : 0;
    const hours = iso[2] ? Number(iso[2]) : 0;
    const minutes = iso[3] ? Number(iso[3]) : 0;
    const total = days * 24 * 60 + hours * 60 + minutes;
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
