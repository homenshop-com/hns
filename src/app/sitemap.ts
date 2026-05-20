import type { MetadataRoute } from "next";
import { locales } from "@/i18n/routing";
import { BASE_URL, localeUrl, hreflangLanguages } from "@/lib/seo-locales";

// Localized marketing pages: one <url> per locale, each carrying the full
// hreflang cluster (Google reads alternates per entry). Default locale (ko)
// is unprefixed; others are path-prefixed (/en/about, /ja/about, …).
const LOCALIZED: { path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/about", changeFrequency: "monthly", priority: 0.8 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.8 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
];

// Single-locale entries (auth pages — not part of the localized URL scheme).
const SINGLE: { path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }[] = [
  { path: "/login", changeFrequency: "yearly", priority: 0.5 },
  { path: "/register", changeFrequency: "yearly", priority: 0.6 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  for (const { path, changeFrequency, priority } of LOCALIZED) {
    const languages = hreflangLanguages(path);
    for (const locale of locales) {
      entries.push({
        url: localeUrl(path, locale),
        lastModified: now,
        changeFrequency,
        priority,
        alternates: { languages },
      });
    }
  }

  for (const { path, changeFrequency, priority } of SINGLE) {
    entries.push({
      url: `${BASE_URL}${path}`,
      lastModified: now,
      changeFrequency,
      priority,
    });
  }

  return entries;
}
