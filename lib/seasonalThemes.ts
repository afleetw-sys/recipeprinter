/**
 * Seasonal themes: themes that belong to part of the year.
 *
 * In season, a seasonal theme is featured at the top of the Pro themes. Out of
 * season it isn't hidden, only moved into a collapsed "Seasonal themes" group
 * at the end of the picker: nobody wants Christmas cards offered in July, but
 * a cook making a year-round cookbook still needs the Christmas page.
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
  season?: ThemeSeason;
  /** Part of the season in which the theme is featured. Without it, the
      whole season is; outside it (but in season) the theme sits with the
      rest of the Pro themes, untagged. */
  featured?: ThemeSeason;
}

/** In season and in its featured window: tagged and led with in the picker. */
export function isFeatured(theme: ArrangeableTheme, date: Date): boolean {
  return (
    theme.season !== undefined &&
    isInSeason(theme.season, date) &&
    (theme.featured === undefined || isInSeason(theme.featured, date))
  );
}

export interface ArrangedThemes<T> {
  /** The main grid: free themes, then featured seasonal themes, then the
      rest of the Pro themes (in-season ones outside their featured window
      among them), each group in its listed order. */
  main: T[];
  /** Seasonal themes out of season, for the collapsed group. */
  offSeason: T[];
}

export function arrangeThemes<T extends ArrangeableTheme>(
  themes: readonly T[],
  isPremium: (theme: T) => boolean,
  date: Date,
): ArrangedThemes<T> {
  const free: T[] = [];
  const featured: T[] = [];
  const pro: T[] = [];
  const offSeason: T[] = [];
  for (const theme of themes) {
    if (isFeatured(theme, date)) {
      featured.push(theme);
    } else if (theme.season && !isInSeason(theme.season, date)) {
      offSeason.push(theme);
    } else {
      (isPremium(theme) ? pro : free).push(theme);
    }
  }
  return { main: [...free, ...featured, ...pro], offSeason };
}
