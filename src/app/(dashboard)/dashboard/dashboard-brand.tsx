import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import { getResellerForHost } from "@/lib/reseller";

/**
 * Dashboard sidebar brand. On a white-label reseller host (Host header matches
 * an ACTIVE non-canonical reseller row) it renders that reseller's configured
 * logo + site name so both the reseller AND their end-users see white-label
 * branding instead of the stock "homeNshop" mark. The canonical host and any
 * unmatched host fall back to the default homeNshop brand.
 *
 * Server component — getResellerForHost() reads headers() and Prisma.
 */
export default async function DashboardBrand() {
  const reseller = await getResellerForHost();
  const isWhiteLabel = !!reseller && !reseller.isCanonical;

  if (isWhiteLabel) {
    return (
      <Link href="/dashboard" className="dv2-brand" title="대시보드로">
        {reseller.logoUrl ? (
          <BrandMark
            logoUrl={reseller.logoUrl}
            label={reseller.siteName}
            imgClassName="dv2-brand-logo"
            textClassName="dv2-brand-name"
          />
        ) : (
          <>
            <div className="dv2-brand-mark">
              {reseller.siteName.slice(0, 1).toUpperCase()}
            </div>
            <div className="dv2-brand-name">{reseller.siteName}</div>
          </>
        )}
      </Link>
    );
  }

  return (
    <Link href="/dashboard" className="dv2-brand" title="대시보드로">
      <div className="dv2-brand-mark">h</div>
      <div className="dv2-brand-name">
        home<span className="ns">Nshop</span>
      </div>
    </Link>
  );
}
