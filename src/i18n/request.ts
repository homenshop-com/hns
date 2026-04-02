import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { locales, defaultLocale, type Locale } from "./routing";

export default getRequestConfig(async () => {
  // 1. Check NEXT_LOCALE cookie
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;

  let locale: Locale = defaultLocale;

  if (cookieLocale && locales.includes(cookieLocale as Locale)) {
    locale = cookieLocale as Locale;
  } else {
    // 2. Fallback to Accept-Language header
    const headerStore = await headers();
    const acceptLanguage = headerStore.get("accept-language");
    if (acceptLanguage) {
      // Parse Accept-Language header, e.g. "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7"
      const preferred = acceptLanguage
        .split(",")
        .map((part) => {
          const [lang, q] = part.trim().split(";q=");
          return { lang: lang.trim().toLowerCase(), q: q ? parseFloat(q) : 1 };
        })
        .sort((a, b) => b.q - a.q);

      for (const { lang } of preferred) {
        // Exact match
        if (locales.includes(lang as Locale)) {
          locale = lang as Locale;
          break;
        }
        // Prefix match (e.g. "ko-kr" -> "ko", "zh-cn" exact, "zh-tw" exact)
        const prefix = lang.split("-")[0];
        if (locales.includes(prefix as Locale)) {
          locale = prefix as Locale;
          break;
        }
        // Handle zh variants: zh-hans -> zh-cn, zh-hant -> zh-tw
        if (lang === "zh-hans" || lang === "zh") {
          locale = "zh-cn";
          break;
        }
        if (lang === "zh-hant") {
          locale = "zh-tw";
          break;
        }
      }
    }
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
