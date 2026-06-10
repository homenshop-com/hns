/**
 * footer-flow — normalize footer objects to relative document flow.
 *
 * The footer (`#hns_footer`) is a site-wide band that must sit AFTER the body
 * on every page. Its DIRECT `.dragable` children, however, are often pinned with
 * an absolute `top`/`position` inline style (legacy authoring, or an editor drag
 * that writes `position:absolute !important; top:NNNNpx !important`). Because
 * `#hns_footer` is `position:static`, that absolute `top` is resolved against
 * the WHOLE page container (`#v_home_dft`), not the footer — so the footer lands
 * at a fixed Y. On a page whose body is taller/shorter than where the footer was
 * pinned, it overlaps the body or leaves a gap.
 *
 * Both the editor canvas and the published route carry a CSS rule
 *   `#hns_footer > .dragable { top:auto !important; position:relative !important }`
 * to force flow, but an INLINE `!important` declaration beats a stylesheet
 * `!important` one, so the rule never wins. The only fix is to strip the inline
 * `top`/`position` so the rule governs and the object flows right below the
 * body — identical in editor and published (WYSIWYG).
 *
 * SCOPE — direct children of `#hns_footer` ONLY (matching the CSS rule's
 * `>` combinator). The `footerHtml` we receive is the INNER html of
 * `#hns_footer`, so its top-level (depth-0) elements ARE those direct children.
 * Objects NESTED inside a `#hns_footer_content` wrapper keep their absolute
 * inline geometry — that wrapper is itself relative+top:0 and lays its children
 * out absolutely (logo-left / text-right designs). Stripping those would collapse
 * such footers into a vertical stack. See memory `feedback_footer_css.md`.
 *
 * We keep `left`/`width`/`height`/`text-align` etc. so horizontal placement and
 * sizing are preserved (with `position:relative`, the kept `left` acts as a
 * relative offset, matching the published rule which only overrides top+position).
 *
 * Applied at RENDER time in both paths, so legacy/stale absolute `top` values in
 * the DB are simply ignored (self-healing) — no migration needed.
 */

const VOID_TAG =
  /^<(?:img|br|hr|input|meta|link|source|area|base|col|embed|param|track|wbr)\b/i;

function stripTopAndPosition(openingTag: string): string {
  if (!/\bclass\s*=\s*"(?:[^"]*\s)?dragable(?:\s[^"]*)?"/i.test(openingTag)) {
    return openingTag;
  }
  return openingTag.replace(/\bstyle\s*=\s*"([^"]*)"/i, (_m, style: string) => {
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
}

export function stripFooterPinnedTop(footerHtml: string): string {
  if (!footerHtml) return footerHtml;
  const tagRe = /<\/?[a-zA-Z][^>]*?>/g;
  let depth = 0;
  let out = "";
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(footerHtml)) !== null) {
    const tag = m[0];
    out += footerHtml.slice(lastIndex, m.index);
    lastIndex = m.index + tag.length;
    if (tag.startsWith("</")) {
      depth = Math.max(0, depth - 1);
      out += tag;
      continue;
    }
    const isVoid = /\/>\s*$/.test(tag) || VOID_TAG.test(tag);
    // Only direct children of #hns_footer (depth 0) flow; deeper objects (e.g.
    // inside #hns_footer_content) keep their absolute inline geometry.
    out += depth === 0 ? stripTopAndPosition(tag) : tag;
    if (!isVoid) depth += 1;
  }
  out += footerHtml.slice(lastIndex);
  return out;
}
