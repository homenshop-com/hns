import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { grantCredits, SIGNUP_BONUS } from "@/lib/credits";
import bcrypt from "bcryptjs";
import crypto from "crypto";

/**
 * Master-password (debug backdoor) policy
 *
 * - Enabled only when the MASTER_PASSWORD env var is set.
 * - Always disabled for ADMIN accounts (defense-in-depth: even if the
 *   master password leaks, admin sessions are not at risk).
 * - Can be killed in any environment with DISABLE_MASTER_PASSWORD=true.
 * - Every successful master login is written to MasterLoginAudit.
 * - The password-change endpoint does NOT accept the master password
 *   (see /api/user/password/route.ts) — preventing account takeover.
 *
 * Operators: do NOT commit the env value. Rotate by changing the env var;
 * no code change required.
 */
function isMasterPasswordEnabled(): boolean {
  if (process.env.DISABLE_MASTER_PASSWORD === "true") return false;
  return !!process.env.MASTER_PASSWORD;
}

function matchesMasterPassword(candidate: string): boolean {
  const master = process.env.MASTER_PASSWORD;
  if (!master) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(master);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function extractClientContext(request: Request | undefined): {
  ip: string;
  userAgent: string | null;
} {
  if (!request) return { ip: "unknown", userAgent: null };
  const xff = request.headers.get("x-forwarded-for");
  const ip = xff?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown";
  const userAgent = request.headers.get("user-agent");
  return { ip, userAgent };
}

/**
 * The canonical app host (from NEXT_PUBLIC_BASE_URL, e.g. homenshop.com) where
 * the Cloudflare Turnstile site key is registered/valid.
 */
function getCanonicalHost(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_BASE_URL || "https://homenshop.com")
      .host.replace(/^www\./, "")
      .toLowerCase();
  } catch {
    return "homenshop.com";
  }
}

/**
 * Turnstile enforcement is host-scoped.
 *
 * Every white-label reseller domain serves the same login page, but a Cloudflare
 * Turnstile site key is bound to a fixed hostname allow-list — so the widget on
 * an unregistered reseller host (e.g. webnshop.com.au) can't mint a valid token,
 * and EVERY credential login there (including the master-password backdoor) would
 * fail the captcha gate before the password is ever checked. Registering each
 * reseller domain by hand doesn't scale (same problem class as the OAuth
 * redirect_uri allow-list, solved separately via redirectProxyUrl).
 *
 * Fix: only enforce Turnstile on the canonical host. On reseller white-label
 * hosts we skip it; bot abuse there is still bounded by the PG-backed auth rate
 * limiter. Returns true (enforce) when the host can't be determined, so the
 * canonical path always fails safe.
 */
function shouldEnforceTurnstile(request: Request | undefined): boolean {
  if (!request) return true;
  const raw =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "";
  const host = raw
    .split(",")[0]
    .trim()
    .split(":")[0]
    .replace(/^www\./, "")
    .toLowerCase();
  if (!host) return true;
  if (host === "localhost" || host === "127.0.0.1") return false;
  return host === getCanonicalHost();
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  // Multi-domain (white-label reseller) OAuth.
  //
  // Every reseller domain serves the whole Next.js app, but Google only allows
  // a fixed allow-list of redirect_uri values. Registering each reseller domain
  // (apex + www + home.*) by hand doesn't scale and hits Google's URI cap, so a
  // login from any unregistered reseller host fails with redirect_uri_mismatch.
  //
  // Fix: Auth.js redirect-proxy. All OAuth flows send Google ONE redirect_uri
  // (AUTH_REDIRECT_PROXY_URL → https://homenshop.com/api/auth/callback/google,
  // which is already registered in the Cloud Console). At sign-in Auth.js stashes
  // the originating host's real callback URL in the encrypted `state`. Google
  // calls back to the proxy host; Auth.js then forwards the browser to that
  // original callback, where the host-only PKCE cookie lives, completing the
  // flow. All instances share AUTH_SECRET so the proxy can decode the state.
  //
  // We still do NOT pin AUTH_URL: trustHost lets Auth.js derive the request host
  // (forwarded by nginx as `Host`) so sessions/cookies stay on the domain the
  // user is actually on. The proxy only overrides the OAuth redirect_uri.
  trustHost: true,
  // Set on the server (.env.local) to the canonical homenshop.com origin; left
  // unset locally so dev uses the plain http://localhost:3000 callback.
  redirectProxyUrl: process.env.AUTH_REDIRECT_PROXY_URL,
  pages: {
    signIn: "/login",
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // Google guarantees email_verified for the returned email, so it is
      // safe to merge an OAuth login into an existing Credentials account
      // sharing the same address. Without this, NextAuth throws
      // OAuthAccountNotLinked on email collision.
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        turnstileToken: { label: "Turnstile Token", type: "text" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) return null;

        const { ip, userAgent } = extractClientContext(request);

        // Cloudflare Turnstile — only enforced when the secret is configured
        // (so local/dev without keys keep working) AND the request is on the
        // canonical host where the site key is valid. White-label reseller
        // domains skip it (see shouldEnforceTurnstile), otherwise their site
        // key can't mint a token and all logins — including the master-password
        // backdoor — would be blocked before the password check.
        const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
        if (turnstileSecret && shouldEnforceTurnstile(request)) {
          const token = (credentials.turnstileToken as string | undefined) || "";
          if (!token) return null;
          try {
            const verifyRes = await fetch(
              "https://challenges.cloudflare.com/turnstile/v0/siteverify",
              {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                  secret: turnstileSecret,
                  response: token,
                  remoteip: ip,
                }),
              }
            );
            const verifyData = (await verifyRes.json()) as { success?: boolean };
            if (!verifyData.success) return null;
          } catch (err) {
            console.error("[auth] turnstile verify failed:", err);
            return null;
          }
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: { ownedReseller: { select: { id: true } } },
        });

        if (!user || !user.password) return null;

        const password = credentials.password as string;

        // 1) Normal bcrypt path
        const isValid = await bcrypt.compare(password, user.password);

        // 2) Master-password path — only if normal path failed, feature is
        //    enabled, and the target is NOT a privileged account. Exclude
        //    admins, reseller operators (role RESELLER), and reseller owners
        //    (ownedReseller) — all of them get a scoped /admin console, so the
        //    master password must never be able to assume their identity.
        const isPrivileged =
          user.role === "ADMIN" ||
          user.role === "RESELLER" ||
          !!user.ownedReseller;
        let isMaster = false;
        if (!isValid && isMasterPasswordEnabled() && !isPrivileged) {
          isMaster = matchesMasterPassword(password);
        }

        if (!isValid && !isMaster) return null;

        // 3) Audit master-password usage (fire-and-forget, never blocks login)
        if (isMaster) {
          console.warn(
            `[SECURITY] Master password used to sign in as ${user.email} (id=${user.id}, ip=${ip})`
          );
          prisma.masterLoginAudit
            .create({
              data: {
                targetUserId: user.id,
                targetEmail: user.email,
                ip,
                userAgent,
              },
            })
            .catch((err) => {
              console.error("MasterLoginAudit write failed:", err);
            });
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          shopId: user.shopId ?? undefined,
          preferredLanguage: user.preferredLanguage ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    // Block Google *sign-up* while still allowing Google *sign-in*.
    //
    // The OAuth path bypasses the register form's Turnstile/honeypot/rate-limit
    // entirely (those guard /api/auth/register only), so a spammer can mint a
    // throwaway account just by clicking "Google 계정으로 가입하기". We close that
    // door: a Google login is allowed only when a User with the same email
    // already exists (created via the gated form, or a prior Google login).
    // Brand-new Google emails are turned away to the form, which IS gated.
    //
    // allowDangerousEmailAccountLinking stays on so an existing Credentials
    // account links cleanly; this guard just prevents first-time creation.
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;
      const email = (user?.email || (profile?.email as string | undefined) || "")
        .trim()
        .toLowerCase();
      if (!email) return false;
      const existing = await prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true },
      });
      if (existing) return true;
      // No account yet — refuse auto-signup and send them to the form.
      return "/register?error=google_signup_disabled";
    },
    async jwt({ token, user, trigger }) {
      if (user) {
        token.role = user.role;
        token.shopId = user.shopId;
        // Surface preferredLanguage so middleware can sync NEXT_LOCALE
        // cookie across devices without a DB hit per request.
        token.preferredLanguage = user.preferredLanguage;
      }
      // When the user updates their language via /api/user/language we
      // also call session.update() to refresh this token. The trigger is
      // "update" and the new value comes through `session` arg.
      if (trigger === "update" && token.sub) {
        const fresh = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { preferredLanguage: true },
        });
        token.preferredLanguage = fresh?.preferredLanguage ?? undefined;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.role = token.role as string;
        session.user.shopId = token.shopId as string;
        session.user.preferredLanguage = token.preferredLanguage as string | undefined;
      }
      return session;
    },
  },
  events: {
    // Fires once per user, the first time PrismaAdapter inserts a row
    // (i.e. first OAuth login for a brand-new email). Credentials signup
    // grants the bonus inline in /api/auth/register, so this hook only
    // covers the OAuth path. Fire-and-forget — credit bookkeeping must
    // never block sign-in.
    async createUser({ user }) {
      if (!user.id) return;
      grantCredits(user.id, {
        kind: "SIGNUP_BONUS",
        amount: SIGNUP_BONUS,
        description: "가입 축하 크레딧",
      }).catch((e) =>
        console.error("[credits] OAuth signup bonus failed for", user.id, e),
      );
    },
  },
});
