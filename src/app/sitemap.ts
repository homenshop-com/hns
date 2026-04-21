import type { MetadataRoute } from "next";

const LOCALES = ["ko", "en", "ja", "zh-cn", "zh-tw", "es"];

function alternates(path: string) {
  const languages: Record<string, string> = {};
  for (const l of LOCALES) {
    languages[l] = `https://homenshop.com${path}?lang=${l}`;
  }
  languages["x-default"] = `https://homenshop.com${path}`;
  return { languages };
}

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://homenshop.com";
  const now = new Date();

  return [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
      alternates: alternates("/"),
    },
    {
      url: `${baseUrl}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
      alternates: alternates("/about"),
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
      alternates: alternates("/pricing"),
    },
    {
      url: `${baseUrl}/login`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/register`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
