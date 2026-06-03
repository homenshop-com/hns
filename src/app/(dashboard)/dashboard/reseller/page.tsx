import { redirect } from "next/navigation";

// Settlement moved into the reseller admin console (/admin/settlement) so the
// scoped admin sidebar stays put. Keep this route as a permanent redirect for
// any existing bookmarks or in-app links.
export default function ResellerSettlementRedirect() {
  redirect("/admin/settlement");
}
