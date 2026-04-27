import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { locales, type Locale } from "@/i18n/routing";

/**
 * POST /api/user/language
 * Body: { locale: "ko" | "en" | ... }
 *
 * Updates User.preferredLanguage AND sets the NEXT_LOCALE cookie so the
 * change takes effect immediately on the current device. The cookie
 * carries the choice across devices via login (see /lib/auth-locale.ts).
 *
 * Anonymous calls are allowed too — they just set the cookie. This lets
 * the in-page LanguageSwitcher fall back gracefully when the user isn't
 * logged in yet.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { locale?: string };
  const locale = body.locale;
  if (!locale || !locales.includes(locale as Locale)) {
    return NextResponse.json({ error: "invalid locale" }, { status: 400 });
  }

  const session = await auth();
  if (session?.user?.id) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { preferredLanguage: locale },
    });
    // The next dashboard render will see the updated cookie + DB value.
    // The JWT is refreshed lazily on the next request via the jwt
    // callback's `trigger === "update"` branch (the client calls
    // session.update() after this). For users who don't trigger an
    // update, the JWT will refresh on its natural rotation.
  }

  const response = NextResponse.json({ ok: true, locale });
  response.cookies.set("NEXT_LOCALE", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: "lax",
    httpOnly: false,
  });
  return response;
}
