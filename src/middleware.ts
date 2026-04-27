import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { locales, defaultLocale, type Locale } from "@/i18n/routing";

/**
 * Locale resolution per request, in priority order:
 *
 *   1. Logged-in user's preferredLanguage (DB-backed via JWT) — once a
 *      user picks a language while logged in, it follows them across
 *      devices and overrides any local cookie state.
 *   2. NEXT_LOCALE cookie — explicit choice or earlier auto-detection.
 *   3. Accept-Language header (first visit) — auto-detected, then
 *      written to the cookie so detection is one-shot.
 *
 * On every authenticated page load we cheaply (JWT only, no DB) compare
 * the user's preferredLanguage against the cookie; if they diverge we
 * update the cookie. This handles cross-device sync without a per-request
 * DB hit and without a redirect.
 *
 * Pattern reference: Stripe / Vercel / Notion all do detect-once + cookie.
 */

function pickFromAcceptLanguage(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return defaultLocale;
  const preferred = acceptLanguage
    .split(",")
    .map((part) => {
      const [lang, q] = part.trim().split(";q=");
      return { lang: lang.trim().toLowerCase(), q: q ? parseFloat(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { lang } of preferred) {
    if (locales.includes(lang as Locale)) return lang as Locale;
    const prefix = lang.split("-")[0];
    if (locales.includes(prefix as Locale)) return prefix as Locale;
    if (lang === "zh-hans" || lang === "zh") return "zh-cn";
    if (lang === "zh-hant") return "zh-tw";
  }
  return defaultLocale;
}

const COOKIE_OPTS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365, // 1 year
  sameSite: "lax" as const,
  httpOnly: false,
};

export async function middleware(request: NextRequest) {
  const cookieLocale = request.cookies.get("NEXT_LOCALE")?.value;

  // 1. Logged-in user with a saved preference wins. Cheap because the
  //    JWT is signed/decoded locally — no DB call.
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  });
  const userLocale = token?.preferredLanguage as Locale | undefined;
  if (userLocale && locales.includes(userLocale)) {
    if (cookieLocale !== userLocale) {
      const response = NextResponse.next();
      response.cookies.set("NEXT_LOCALE", userLocale, COOKIE_OPTS);
      return response;
    }
    return NextResponse.next();
  }

  // 2. Cookie already set (explicit user choice or earlier auto-detect).
  if (cookieLocale) return NextResponse.next();

  // 3. First visit — detect from Accept-Language and persist.
  const detected = pickFromAcceptLanguage(request.headers.get("accept-language"));
  const response = NextResponse.next();
  response.cookies.set("NEXT_LOCALE", detected, COOKIE_OPTS);
  // Surface the auto-detected locale to the page so we can show a "switch
  // to detected language?" banner on first visit (Phase 4).
  response.headers.set("x-locale-auto-detected", detected);
  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next|favicon.ico|robots.txt|sitemap.xml|indexnow-key.txt|.*\\..*).*)",
  ],
};
