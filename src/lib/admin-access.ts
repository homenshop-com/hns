import "server-only";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

/**
 * Admin-area access model.
 *
 * Two kinds of operators may enter /admin:
 *  - "admin"   — a full platform admin (User.role === "ADMIN"). Sees everything.
 *  - "reseller"— a white-label reseller operator (the User that owns a
 *                Reseller via Reseller.ownerUserId). Sees ONLY the members,
 *                prospects, sites and orders attributed to their reseller
 *                (User.resellerId). Excluded from system settings and reseller
 *                management.
 *
 * Authoritative signal for reseller access is `ownedReseller` (DB), not the
 * RESELLER role — the role is kept in sync for the middleware page-gate but
 * ownership is what actually scopes the data.
 */
export type AdminAccess =
  | { kind: "admin"; userId: string }
  | { kind: "reseller"; userId: string; resellerId: string };

export async function getAdminAccess(): Promise<AdminAccess | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, ownedReseller: { select: { id: true } } },
  });
  if (!user) return null;
  if (user.role === "ADMIN") return { kind: "admin", userId: session.user.id };
  if (user.ownedReseller) {
    return {
      kind: "reseller",
      userId: session.user.id,
      resellerId: user.ownedReseller.id,
    };
  }
  return null;
}

/** Pages both admins and reseller operators may view. Redirects out otherwise. */
export async function requireAdminAccess(): Promise<AdminAccess> {
  const access = await getAdminAccess();
  if (!access) redirect("/dashboard");
  return access;
}

/** Admin-only pages (system settings, reseller management). Reseller operators
 *  are bounced to the admin home. */
export async function requireFullAdmin(): Promise<AdminAccess> {
  const access = await getAdminAccess();
  if (!access) redirect("/dashboard");
  if (access.kind !== "admin") redirect("/admin");
  return access;
}

/** resellerId to scope queries by, or null for a full admin (no filter). */
export function scopeResellerId(access: AdminAccess): string | null {
  return access.kind === "reseller" ? access.resellerId : null;
}
