#!/usr/bin/env node
/**
 * CSS fix for unionled 주요 설치 사례 grid cards rendering as empty boxes.
 *
 * The template CSS targets `.ul-case-card` directly as grid children of
 * `.ul-case-grid` (with `.large { grid-row: 1/3 }`). But after atomic-
 * layering rebuild, each card is wrapped in `<div class="dragable de-group">`,
 * so the actual grid children are the .dragable wrappers, not the cards.
 *
 * Consequences of the mismatch:
 *   1. `.ul-case-card.large { grid-row: 1/3 }` doesn't match — large card
 *      doesn't span 2 rows (stays 1fr × 1fr like the small ones)
 *   2. `.ul-case-card` has no height because its parent `.dragable` is the
 *      grid item that gets sized by the grid, but the card inside has
 *      `position:relative` + only absolutely-positioned children
 *      (img/grad/info/link) → collapses to height:0 → invisible
 *
 * This script appends CSS that targets the `.dragable` wrapper as the real
 * grid item and makes the inner card fill it:
 *
 *   .ul-case-grid > .dragable            (grid item; min-height:0)
 *   .ul-case-grid > .dragable:first-child (large: grid-row 1/3)
 *   .ul-case-grid > .dragable > .ul-case-card (100% of wrapper)
 *
 * Idempotent via marker `HNS-UNIONLED-CASES-WRAPPER-FIX`.
 */

import pg from "pg";
const { Client } = pg;

const SITE_ID = "cmoavtq8x001taa67vlpq1agk";
const TEMPLATE_ID = "tpl_user_unionled_moavph1v";

const MARKER = "/* HNS-UNIONLED-CASES-WRAPPER-FIX */";
const RULES = `${MARKER}
.ul-case-grid > .dragable {
  position: relative;
  min-height: 0;
  min-width: 0;
}
.ul-case-grid > .dragable:first-child {
  grid-row: 1 / 3;
}
.ul-case-grid > .dragable > .ul-case-card {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  cursor: pointer;
  transition: all 0.3s;
  display: block;
}
.ul-case-grid > .dragable > .ul-case-card:hover {
  transform: translateY(-2px);
  border-color: rgba(255,181,71,0.3);
}
@media (max-width: 1100px) {
  .ul-case-grid > .dragable:first-child {
    grid-row: 1 / 2;
    grid-column: 1 / -1;
    aspect-ratio: 16/9;
  }
  .ul-case-grid > .dragable:not(:first-child) {
    aspect-ratio: 1;
  }
}
@media (max-width: 640px) {
  .ul-case-grid > .dragable:not(:first-child) {
    aspect-ratio: 4/3;
  }
}
`;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  for (const [table, id] of [["Site", SITE_ID], ["Template", TEMPLATE_ID]]) {
    const r = await client.query(`SELECT "cssText" FROM "${table}" WHERE id=$1`, [id]);
    if (r.rowCount === 0) continue;
    const css = r.rows[0].cssText || "";
    if (css.includes(MARKER)) {
      console.log(`· ${table} already patched`);
      continue;
    }
    const next = css + "\n" + RULES + "\n";
    await client.query(`UPDATE "${table}" SET "cssText"=$1 WHERE id=$2`, [next, id]);
    console.log(`✓ ${table} patched (+${RULES.length} chars)`);
  }
  await client.end();
  console.log("\n✓ done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
