import type { Metadata } from "next";
import { locales, defaultLocale, type Locale } from "@/i18n/routing";

/**
 * SEO locale URL strategy
 * -----------------------
 * The default locale (ko) lives at unprefixed URLs (`/about`); every other
 * locale is served from a path prefix (`/en/about`, `/ja/about`, …). Crawlers
 * with no cookie / Accept-Language fall back to ko, so the unprefixed URL is a
 * stable ko canonical, while each prefixed URL renders its language
 * deterministically via setRequestLocale(). That lets us emit valid hreflang.
 *
 * Shared by page generateMetadata() and the sitemap so the cluster never drifts.
 */

export const BASE_URL = "https://homenshop.com";

/** Locales that get a URL prefix (everything except the default). */
export const PREFIXED_LOCALES = locales.filter(
  (l) => l !== defaultLocale,
) as Exclude<Locale, typeof defaultLocale>[];

/** Build the public URL for a given path + locale (home has no trailing slash). */
export function localeUrl(path: string, locale: Locale): string {
  const clean = path === "/" ? "" : path;
  return locale === defaultLocale
    ? `${BASE_URL}${clean}`
    : `${BASE_URL}/${locale}${clean}`;
}

/**
 * hreflang language map for a path: every locale + x-default (-> default
 * locale's unprefixed URL).
 */
export function hreflangLanguages(path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const l of locales) languages[l] = localeUrl(path, l);
  languages["x-default"] = localeUrl(path, defaultLocale);
  return languages;
}

/**
 * `alternates` block for a page rendered in `current` locale: self-referencing
 * canonical + the full hreflang cluster.
 */
export function alternatesFor(
  path: string,
  current: Locale,
): Metadata["alternates"] {
  return {
    canonical: localeUrl(path, current),
    languages: hreflangLanguages(path),
  };
}
