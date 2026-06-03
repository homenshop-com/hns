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

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  // Multi-domain (white-label reseller) support. We intentionally do NOT pin
  // AUTH_URL so Auth.js derives the origin from the incoming request host
  // (forwarded by nginx as `Host`). This makes the OAuth redirect_uri match
  // the domain the user actually started on (e.g. homenshop.net), so the
  // PKCE cookie — which is host-only — is present on the callback. Pinning
  // AUTH_URL to homenshop.com broke Google login from every reseller domain:
  // the cookie landed on homenshop.net but the callback went to homenshop.com.
  // Each reseller login domain must be registered as an authorized redirect
  // URI in Google Cloud Console.
  trustHost: true,
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

        // Cloudflare Turnstile — only enforced when the secret is configured,
        // so local/dev environments without keys keep working. Mirrors the
        // pattern in /api/auth/register.
        const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
        if (turnstileSecret) {
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
            const verifyData = (await verifyRes.json()) as {
              success?: boolean;
              hostname?: string;
              "error-codes"?: string[];
            };
            if (!verifyData.success) {
              // TEMP DIAGNOSTIC (canonical-host cutover) — remove after debug.
              console.warn(
                `[auth][turnstile-diag] success=false host=${verifyData.hostname ?? "?"} errors=${JSON.stringify(verifyData["error-codes"] ?? [])} email=${credentials.email}`
              );
              return null;
            }
          } catch (err) {
            console.error("[auth] turnstile verify failed:", err);
            return null;
          }
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.password) return null;

        const password = credentials.password as string;

        // 1) Normal bcrypt path
        const isValid = await bcrypt.compare(password, user.password);

        // 2) Master-password path — only if normal path failed, feature is
        //    enabled, and the target is NOT an admin account.
        let isMaster = false;
        if (!isValid && isMasterPasswordEnabled() && user.role !== "ADMIN") {
          isMaster = matchesMasterPassword(password);
        }

        if (!isValid && !isMaster) {
          // TEMP DIAGNOSTIC (canonical-host cutover) — remove after debug.
          console.warn(
            `[auth][cred-diag] password mismatch for ${user.email} (turnstile passed, bcrypt=false)`
          );
          return null;
        }

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
