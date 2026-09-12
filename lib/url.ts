export function hostnameOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/**
 * A hostname reduced to the form every comparison in this app uses: trimmed,
 * lowercased, `www.` dropped.
 *
 * Lived as identical private copies — doc comment included — in
 * lib/importUrl.ts (is this a search page?) and lib/friendlyErrors.ts (is this
 * a placeholder domain?). Both ask "is this host one of ours to special-case",
 * and both have to normalise the same way for their answer to mean anything.
 */
export function normalizeHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^www\./, "");
}
