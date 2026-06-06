/**
 * One-time backfill of Site.editorMode from the legacy three-signal
 * heuristic. After this runs, the editor routes on the explicit column
 * instead of recomputing the heuristic per request (and admins can
 * override a misclassified site by editing the column).
 *
 * Heuristic (matches edit/page.tsx, mirrored here):
 *   editorMode = "flow"  when sourceTemplate.isResponsive
 *                          OR Site.cssText includes "/* HNS-MODERN-TEMPLATE *\/"
 *              = "absolute" otherwise
 *
 * Idempotent: only fills rows where editorMode IS NULL. Re-running never
 * clobbers a manual override. Pass `--force` to recompute ALL rows.
 *
 * Run on server (Prisma 7 generates a TypeScript-only client, so use tsx):
 *   npx tsx scripts/backfill-editor-mode.ts
 *   npx tsx scripts/backfill-editor-mode.ts --force
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const force = process.argv.includes("--force");
const MODERN_MARKER = "/* HNS-MODERN-TEMPLATE */";

async function main() {
  const sites = await prisma.site.findMany({
    select: { id: true, shopId: true, templateId: true, cssText: true, editorMode: true },
  });

  // Cache template.isResponsive lookups.
  const tplResponsive = new Map<string, boolean>();
  async function isResponsiveTemplate(templateId: string | null): Promise<boolean> {
    if (!templateId) return false;
    if (tplResponsive.has(templateId)) return tplResponsive.get(templateId)!;
    const tpl = await prisma.template.findUnique({
      where: { id: templateId },
      select: { isResponsive: true },
    });
    const v = !!tpl?.isResponsive;
    tplResponsive.set(templateId, v);
    return v;
  }

  let updated = 0;
  let skipped = 0;
  const tally: Record<string, number> = { flow: 0, absolute: 0 };

  for (const site of sites) {
    if (!force && (site.editorMode === "flow" || site.editorMode === "absolute")) {
      skipped++;
      continue;
    }
    const responsive =
      (await isResponsiveTemplate(site.templateId)) ||
      (site.cssText ?? "").includes(MODERN_MARKER);
    const mode = responsive ? "flow" : "absolute";
    tally[mode]++;
    await prisma.site.update({ where: { id: site.id }, data: { editorMode: mode } });
    updated++;
    console.log(`  ${site.shopId.padEnd(24)} → ${mode}`);
  }

  console.log(
    `\nBackfill done. updated=${updated} skipped(existing)=${skipped} ` +
      `flow=${tally.flow} absolute=${tally.absolute} total=${sites.length}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
