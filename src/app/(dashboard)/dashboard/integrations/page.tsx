import { redirect } from "next/navigation";

/**
 * Legacy route — kept as a redirect so old bookmarks and the OAuth
 * callback's redirect target still resolve. The integrations UI is now
 * inlined into /dashboard/sites (each site card shows its connected
 * marketplace accounts directly).
 */
export default async function IntegrationsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string; connected?: string }>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  if (sp.siteId) params.set("siteId", sp.siteId);
  if (sp.connected) params.set("connected", sp.connected);
  const qs = params.toString();
  redirect(`/dashboard/sites${qs ? `?${qs}` : ""}`);
}
