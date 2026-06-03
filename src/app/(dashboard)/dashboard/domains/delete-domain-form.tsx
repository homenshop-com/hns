import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getManageScope, manageableSiteWhere } from "@/lib/site-access";
import { getTranslations } from "next-intl/server";

/**
 * Thin server-component wrapper for the per-row delete action.
 * Kept in its own file so the enclosing page can stay clean and
 * so the server action boundary is obvious.
 */
export default async function DeleteDomainForm({ domainId }: { domainId: string }) {
  const t = await getTranslations("domainsDash");
  return (
    <form
      action={async () => {
        "use server";
        const session = await auth();
        if (!session) return;
        // Owner OR a reseller operator for the attributed customer site may
        // delete the domain connection. Scope the delete by the domain's site.
        const scope = await getManageScope();
        if (!scope) return;
        await prisma.domain.deleteMany({
          where: { id: domainId, site: manageableSiteWhere(scope) },
        });
        const { revalidatePath } = await import("next/cache");
        revalidatePath("/dashboard/domains");
      }}
    >
      <button type="submit" className="dm2-act danger" title={t("disconnectDomain")}>
        <svg width={11} height={11}><use href="#i-trash" /></svg>
        {t("delete")}
      </button>
    </form>
  );
}
