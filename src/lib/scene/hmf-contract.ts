/**
 * hmf-contract — the HEADER/MENU/FOOTER compatibility contract, as runnable
 * checks. The published page + the V2 editor share a set of invariants that
 * EVERY site must satisfy, regardless of how it was created (new template,
 * AI generation, or legacy migration). This module encodes those invariants
 * so any pipeline (or a migration audit script) can validate a site's HMF in
 * one call and surface violations BEFORE they reach the editor/published page.
 *
 * See memory `hmf-compatibility-contract.md` for the full contract + rationale.
 *
 * The 7 invariants (severity in parentheses):
 *  1. (error) HMF object ids are UNIQUE site-wide — never reused in a page body.
 *     (Same id in shared header + page body → top-left ghost + scene id clash.)
 *  2. (error) Header/footer object GEOMETRY lives in the shared header/footer
 *     inline style — NEVER in per-page `Page.css`. (Page-css header rules make
 *     the editor render the header differently on each page; the publisher
 *     strips them so live ≠ editor.)
 *  3. (warn)  Footer DIRECT `.dragable` children flow after the body — no inline
 *     `position:absolute` / `top` (else the site-wide footer pins to a fixed Y
 *     and overlaps taller pages). Render-time `stripFooterPinnedTop` mitigates,
 *     but clean data is preferred.
 *  4. (warn)  `menuHtml` is a bare wrapper (`<div id="hns_menu"></div>`); the
 *     nav lives in `headerHtml`'s `<nav>`. A populated menuHtml duplicates the
 *     nav. (Legacy templates with a real `<ul class="mainmenu">` are exempt —
 *     reported as info.)
 *  5. (warn)  z-index on HMF objects is a non-negative integer.
 *  6. (info)  Asset URLs use absolute hosts (`https://homenshop.net/api/img`,
 *     or the site/reseller host) — relative `/api/img` 404s off-platform.
 *  7. (info)  Header/footer objects are top-level `.dragable` (so they appear
 *     in the 헤더/푸터 섹션 panel and round-trip through legacyHmfToScene).
 */

export type HmfSeverity = "error" | "warn" | "info";

export interface HmfIssue {
  severity: HmfSeverity;
  code: string;
  message: string;
  ids?: string[];
  where?: string;
}

export interface HmfValidateInput {
  headerHtml?: string | null;
  menuHtml?: string | null;
  footerHtml?: string | null;
  /** Per-page body + css (the per-page Page.content.html + Page.css). */
  pages?: Array<{ slug?: string; html?: string | null; css?: string | null }>;
}

export interface HmfValidateResult {
  ok: boolean; // no `error`-severity issues
  issues: HmfIssue[];
}

/** Collect ids of elements carrying the `dragable` class (HMF objects). */
function dragableIds(html: string): string[] {
  const ids: string[] = [];
  const tagRe = /<[a-zA-Z][^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const tag = m[0];
    if (!/\bclass\s*=\s*"(?:[^"]*\s)?dragable(?:\s[^"]*)?"/i.test(tag)) continue;
    const idm = /\bid\s*=\s*"([^"]+)"/i.exec(tag);
    if (idm) ids.push(idm[1]);
  }
  return ids;
}

/** Any `id="X"` reference in arbitrary html (used for body-collision scan). */
function hasIdRef(html: string, id: string): boolean {
  return new RegExp(`\\bid\\s*=\\s*"${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).test(html);
}

const GEOM_PROP_RE = /(?:^|;|\{|\s)(left|top|width|height|position|z-index)\s*:/i;

export function validateHmf(input: HmfValidateInput): HmfValidateResult {
  const issues: HmfIssue[] = [];
  const header = input.headerHtml || "";
  const menu = input.menuHtml || "";
  const footer = input.footerHtml || "";
  const pages = input.pages || [];

  const headerIds = dragableIds(header);
  const footerIds = dragableIds(footer);
  const hmfIds = Array.from(new Set([...headerIds, ...footerIds, ...dragableIds(menu)]));

  // (1) id uniqueness vs page bodies
  for (const p of pages) {
    const body = p.html || "";
    const clash = hmfIds.filter((id) => hasIdRef(body, id));
    if (clash.length) {
      issues.push({
        severity: "error",
        code: "DUP_ID_IN_BODY",
        message: `페이지 본문이 공용 HMF 객체 id를 중복 보유 (좌상단 유령/씬 충돌)`,
        ids: clash,
        where: p.slug || "(page)",
      });
    }
  }

  // (2) header/footer object geometry leaking into Page.css
  for (const p of pages) {
    const css = p.css || "";
    if (!css) continue;
    const leaks: string[] = [];
    for (const id of [...headerIds, ...footerIds]) {
      const rule = new RegExp(`#${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b[^{}]*\\{([^}]*)\\}`, "g");
      let mm: RegExpExecArray | null;
      while ((mm = rule.exec(css)) !== null) {
        if (GEOM_PROP_RE.test(mm[1])) {
          leaks.push(id);
          break;
        }
      }
    }
    if (leaks.length) {
      issues.push({
        severity: "error",
        code: "HEADER_GEOM_IN_PAGECSS",
        message: `헤더/푸터 객체 geometry가 Page.css에 존재 → 페이지별 헤더 불일치(에디터≠퍼블리시). 공용 헤더 인라인으로 baking 필요`,
        ids: Array.from(new Set(leaks)),
        where: p.slug || "(page)",
      });
    }
  }

  // (3) footer direct-child absolute positioning
  if (footer) {
    const directAbs = footerDirectAbsoluteIds(footer);
    if (directAbs.length) {
      issues.push({
        severity: "warn",
        code: "FOOTER_ABSOLUTE",
        message: `푸터 직계 객체가 absolute/top 고정 → body 다음 relative flow 권장 (stripFooterPinnedTop이 렌더 시 보정하나 데이터는 정리 권장)`,
        ids: directAbs,
      });
    }
  }

  // (4) menuHtml dedup
  if (menu) {
    const hasNav = /<nav[\s>]/i.test(menu);
    const hasList = /<(ul|li|a)[\s>]/i.test(menu);
    if (hasNav || hasList) {
      // a real legacy `<ul class="mainmenu">` is the exception — info, not warn
      const legacyMainmenu = /<ul[^>]*class="[^"]*mainmenu/i.test(menu);
      issues.push({
        severity: legacyMainmenu ? "info" : "warn",
        code: "MENU_NOT_BARE",
        message: legacyMainmenu
          ? `menuHtml에 레거시 <ul class="mainmenu"> 존재 (허용 — 동적 메뉴 스킵)`
          : `menuHtml은 빈 래퍼(<div id="hns_menu"></div>)여야 함. nav는 headerHtml의 <nav>에. 중복 메뉴 위험`,
      });
    }
  }

  // (5) z-index sanity on HMF objects
  for (const [html, where] of [[header, "header"], [footer, "footer"]] as const) {
    for (const z of html.matchAll(/z-index\s*:\s*(-?\d+(?:\.\d+)?)/gi)) {
      const n = Number(z[1]);
      if (!Number.isInteger(n) || n < 0) {
        issues.push({
          severity: "warn",
          code: "BAD_ZINDEX",
          message: `HMF z-index는 0 이상 정수 권장 (받은 값: ${z[1]})`,
          where,
        });
        break;
      }
    }
  }

  // (6) relative /api/img URLs (off-platform 404 risk)
  for (const [html, where] of [[header, "header"], [footer, "footer"]] as const) {
    if (/(?:src|href)\s*=\s*"\/api\/img/i.test(html)) {
      issues.push({
        severity: "info",
        code: "RELATIVE_API_IMG",
        message: `상대 /api/img URL은 커스텀/리셀러 호스트에서 404. 절대 https://homenshop.net/api/img 권장`,
        where,
      });
    }
  }

  return { ok: !issues.some((i) => i.severity === "error"), issues };
}

/** Depth-0 (direct child of the footer fragment) dragables with inline
 *  `position:absolute` or a `top` declaration. Mirrors stripFooterPinnedTop. */
function footerDirectAbsoluteIds(footerHtml: string): string[] {
  const out: string[] = [];
  const tagRe = /<\/?[a-zA-Z][^>]*?>/g;
  let depth = 0;
  let m: RegExpExecArray | null;
  const VOID = /\/>\s*$/;
  while ((m = tagRe.exec(footerHtml)) !== null) {
    const tag = m[0];
    if (tag.startsWith("</")) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0 && /\bclass\s*=\s*"(?:[^"]*\s)?dragable(?:\s[^"]*)?"/i.test(tag)) {
      const style = /\bstyle\s*=\s*"([^"]*)"/i.exec(tag)?.[1] || "";
      // Only `position:absolute` pins a direct footer child to a fixed Y. A
      // `position:relative; top:0` wrapper (#hns_footer_content) is the intended
      // flow container — not a violation.
      if (/(?:^|;)\s*position\s*:\s*absolute/i.test(style)) {
        const idm = /\bid\s*=\s*"([^"]+)"/i.exec(tag);
        out.push(idm ? idm[1] : "(no-id)");
      }
    }
    if (!VOID.test(tag) && !/^<(?:img|br|hr|input|meta|link|source)\b/i.test(tag)) depth += 1;
  }
  return out;
}

/** Convenience: throw on any `error`-severity issue. Pipelines that want to
 *  HARD-FAIL on contract violations call this; default flows just warn. */
export function assertHmfContract(input: HmfValidateInput): void {
  const { ok, issues } = validateHmf(input);
  if (!ok) {
    const errs = issues.filter((i) => i.severity === "error");
    throw new Error(
      "HMF contract violation:\n" +
        errs.map((e) => `  [${e.code}] ${e.where ?? ""} ${e.message} ${e.ids?.join(",") ?? ""}`).join("\n"),
    );
  }
}
