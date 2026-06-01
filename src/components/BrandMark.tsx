"use client";

import { useState } from "react";

/**
 * Renders a reseller logo image, falling back to the brand-name text if no
 * logo is configured OR the image fails to load (legacy logo files are often
 * missing → a 404 would otherwise show a broken-image icon).
 */
export default function BrandMark({
  logoUrl,
  label,
  imgClassName,
  textClassName,
}: {
  logoUrl: string | null;
  label: string;
  imgClassName?: string;
  textClassName?: string;
}) {
  const [broken, setBroken] = useState(false);

  if (logoUrl && !broken) {
    // eslint-disable-next-line @next/next/no-img-element -- legacy asset on a
    // different path prefix (/upld/), not eligible for next/image optimization.
    return (
      <img
        src={logoUrl}
        alt={label}
        className={imgClassName}
        onError={() => setBroken(true)}
      />
    );
  }

  return <span className={textClassName}>{label}</span>;
}
