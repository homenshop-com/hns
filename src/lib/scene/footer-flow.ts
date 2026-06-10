/**
 * footer-flow — normalize footer objects to relative document flow.
 *
 * The footer (`#hns_footer`) is a site-wide band that must sit AFTER the body
 * on every page. Its `.dragable` objects, however, are often pinned with an
 * absolute `top`/`position` inline style (legacy authoring, or an editor drag
 * that writes `position:absolute !important; top:NNNNpx !important`). Because
 * `#hns_footer` is `position:static`, that absolute `top` is resolved against
 * the WHOLE page container (`#v_home_dft`), not the footer — so the footer
 * lands at a fixed Y. On a page whose body is taller/shorter than where the
 * footer was pinned, it overlaps the body or leaves a gap.
 *
 * Both the editor canvas and the published route carry a CSS rule
 *   `#hns_footer > .dragable { top:auto !important; position:relative !important }`
 * to force flow, but an INLINE `!important` declaration beats a stylesheet
 * `!important` one, so the rule never wins. The only fix is to strip the inline
 * `top`/`position` so the rule governs and the object flows right below the
 * body — identical in editor and published (WYSIWYG).
 *
 * We keep `left`/`width`/`height`/`text-align` etc. so horizontal placement and
 * sizing are preserved (with `position:relative`, the kept `left` acts as a
 * relative offset, matching the published rule which only overrides top+position).
 *
 * Applied at RENDER time in both paths, so legacy/stale absolute `top` values in
 * the DB are simply ignored (self-healing) — no migration needed.
 */
export function stripFooterPinnedTop(footerHtml: string): string {
  if (!footerHtml) return footerHtml;
  // Walk every opening tag; for ones carrying the `dragable` class, drop the
  // `top` and `position` declarations from their inline style (order-agnostic).
  return footerHtml.replace(/<[a-zA-Z][^>]*>/g, (tag) => {
    if (!/\bclass\s*=\s*"(?:[^"]*\s)?dragable(?:\s[^"]*)?"/i.test(tag)) return tag;
    return tag.replace(/\bstyle\s*=\s*"([^"]*)"/i, (_m, style: string) => {
      const cleaned = style
        // `(?:^|;)` anchors to a declaration boundary so `border-top` /
        // `margin-top` / `background-position` are NOT matched.
        .replace(/(?:^|;)\s*top\s*:[^;]*/gi, ";")
        .replace(/(?:^|;)\s*position\s*:[^;]*/gi, ";")
        .replace(/;{2,}/g, ";")
        .replace(/^\s*;\s*/, "")
        .replace(/\s*;\s*$/, "")
        .trim();
      return `style="${cleaned}"`;
    });
  });
}
