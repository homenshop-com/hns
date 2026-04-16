import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
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
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) return null;

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

        if (!isValid && !isMaster) return null;

        // 3) Audit master-password usage (fire-and-forget, never blocks login)
        if (isMaster) {
          const { ip, userAgent } = extractClientContext(request);
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
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.shopId = user.shopId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.role = token.role as string;
        session.user.shopId = token.shopId as string;
      }
      return session;
    },
  },
});
