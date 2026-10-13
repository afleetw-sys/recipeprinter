/**
 * Seasonal themes: themes with a time of year (Fall, Halloween, Christmas).
 *
 * During its featured dates a seasonal theme is tagged and leads the Pro
 * themes. The rest of the year it isn't hidden, only moved into a collapsed
 * "Seasonal themes" group under the main grid: nobody wants Christmas cards
 * offered in July, but a cook making a year-round cookbook still needs the
 * Christmas page.
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
  /** The yearly window the theme is featured. Set only on seasonal themes. */
  featured?: ThemeSeason;
}

/** A theme with a time of year: featured in it, in the seasonal group out of it. */
export function isSeasonal(theme: ArrangeableTheme): boolean {
  return theme.featured !== undefined;
}

/** In its featured window: tagged and led with in the picker. */
export function isFeatured(theme: ArrangeableTheme, date: Date): boolean {
  return theme.featured !== undefined && isInSeason(theme.featured, date);
}

export interface ArrangedThemes<T> {
  /** The main grid: free themes, then featured themes, then the rest of the
      Pro themes, each group in its listed order. */
  main: T[];
  /** Seasonal themes outside their featured dates, for the collapsed group. */
  seasonal: T[];
}

export function arrangeThemes<T extends ArrangeableTheme>(
  themes: readonly T[],
  isPremium: (theme: T) => boolean,
  date: Date,
): ArrangedThemes<T> {
  const free: T[] = [];
  const featured: T[] = [];
  const pro: T[] = [];
  const seasonal: T[] = [];
  for (const theme of themes) {
    if (isFeatured(theme, date)) featured.push(theme);
    else if (isSeasonal(theme)) seasonal.push(theme);
    else (isPremium(theme) ? pro : free).push(theme);
  }
  return { main: [...free, ...featured, ...pro], seasonal };
}
