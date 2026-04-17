import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/admin/master-password
 *
 * Returns the env-stored master password to ADMIN sessions only.
 * Used by /login to auto-fill the password field when an admin clicks
 * "Login" (or opens the copied URL) to impersonate a customer.
 *
 * Security:
 * - Only ADMIN role can fetch; others get 403 / 401.
 * - Compromising an ADMIN session already grants more than this value,
 *   so returning the master password to admin sessions is not a
 *   meaningful escalation.
 * - The master password itself still cannot sign in to ADMIN accounts
 *   (auth.ts defense-in-depth) and cannot change passwords
 *   (user/password/route.ts requires the real current password).
 */
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const masterPassword = process.env.MASTER_PASSWORD;
  if (!masterPassword) {
    return NextResponse.json(
      { error: "Master password not configured on server" },
      { status: 404 }
    );
  }

  return NextResponse.json({ masterPassword });
}
