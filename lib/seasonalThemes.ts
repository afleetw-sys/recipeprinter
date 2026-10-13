/**
 * Seasonal themes: themes with a time of year.
 *
 * Every theme is always in the picker. A seasonal theme's dates are only when
 * it is featured: tagged and moved to the top of the Pro themes. Outside them
 * it sits with the rest of the Pro themes in its listed place.
 *
 * Pure date logic, no React, so the picker's ordering can be tested directly.
 */

/** A yearly window, inclusive at both ends, as "MM-DD". A window whose end
    comes before its start (e.g. "12-15" to "01-05") wraps over New Year. */
export interface ThemeSeason {
  from: string;
  to: string;
}

function monthDay(value: string): number {
  const [month, day] = value.split("-").map(Number);
  return month * 100 + day;
}

export function isInSeason(season: ThemeSeason, date: Date): boolean {
  const today = (date.getMonth() + 1) * 100 + date.getDate();
  const from = monthDay(season.from);
  const to = monthDay(season.to);
  return from <= to ? today >= from && today <= to : today >= from || today <= to;
}

interface ArrangeableTheme {
  /** The yearly window the theme is featured. */
  featured?: ThemeSeason;
}

/** In its featured window: tagged and led with in the picker. */
export function isFeatured(theme: ArrangeableTheme, date: Date): boolean {
  return theme.featured !== undefined && isInSeason(theme.featured, date);
}

/** The picker's grid: free themes, then featured themes, then the rest of the
    Pro themes, each group in its listed order. */
export function arrangeThemes<T extends ArrangeableTheme>(
  themes: readonly T[],
  isPremium: (theme: T) => boolean,
  date: Date,
): T[] {
  const free: T[] = [];
  const featured: T[] = [];
  const pro: T[] = [];
  for (const theme of themes) {
    if (isFeatured(theme, date)) featured.push(theme);
    else (isPremium(theme) ? pro : free).push(theme);
  }
  return [...free, ...featured, ...pro];
}
