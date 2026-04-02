/**
 * Import HMF (Header/Menu/Footer) data from legacy SQL dump into Template table.
 *
 * Usage: npx tsx scripts/import-hmf.ts
 *
 * Reads the legacy maindb SQL dump, extracts Templates_HMF entries,
 * matches them to templates by path, and updates PostgreSQL.
 */

import { PrismaClient } from "../src/generated/prisma";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

const SQL_DUMP_PATH = path.resolve(
  __dirname,
  "../../www.homenshop.net/htdocs/lib/class/db_bak/maindb_20220802.sql"
);

interface HMFEntry {
  templateCode: string;
  type: "h" | "m" | "f";
  contents: string;
}

function parseHMFFromDump(sqlPath: string): HMFEntry[] {
  const content = fs.readFileSync(sqlPath, "utf-8");
  const entries: HMFEntry[] = [];

  // Match Templates_HMF INSERT rows
  // Format: INSERT INTO `Templates_HMF` VALUES (uid,'template_code','hmf','contents'),...
  const insertRegex = /INSERT INTO `Templates_HMF` VALUES\s*(.*?);/gs;
  let insertMatch;

  while ((insertMatch = insertRegex.exec(content)) !== null) {
    const valuesStr = insertMatch[1];
    // Parse individual value tuples - handle escaped quotes in contents
    const tupleRegex = /\((\d+),'([^']*?)','([hmf])','((?:[^'\\]|\\.|'')*?)'\)/g;
    let tupleMatch;

    while ((tupleMatch = tupleRegex.exec(valuesStr)) !== null) {
      const templateCode = tupleMatch[2];
      const type = tupleMatch[3] as "h" | "m" | "f";
      let contents = tupleMatch[4];

      // Unescape MySQL escapes
      contents = contents
        .replace(/\\r\\n/g, "\r\n")
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, "\\")
        .replace(/''/g, "'");

      entries.push({ templateCode, type, contents });
    }
  }

  return entries;
}

async function main() {
  console.log("Reading SQL dump...");
  const hmfEntries = parseHMFFromDump(SQL_DUMP_PATH);
  console.log(`Found ${hmfEntries.length} HMF entries`);

  // Group by template_code
  const grouped = new Map<string, { h?: string; m?: string; f?: string }>();
  for (const entry of hmfEntries) {
    if (!grouped.has(entry.templateCode)) {
      grouped.set(entry.templateCode, {});
    }
    const g = grouped.get(entry.templateCode)!;
    g[entry.type] = entry.contents;
  }
  console.log(`Grouped into ${grouped.size} templates`);

  // Get all templates from DB
  const templates = await prisma.template.findMany();
  console.log(`Found ${templates.length} templates in DB`);

  let updated = 0;
  let notFound = 0;

  for (const template of templates) {
    // Template path in DB might have leading slash or not
    const pathVariants = [
      template.path,
      template.path.replace(/^\//, ""),
      "/" + template.path.replace(/^\//, ""),
    ];

    let hmf: { h?: string; m?: string; f?: string } | undefined;
    for (const p of pathVariants) {
      hmf = grouped.get(p);
      if (hmf) break;
    }

    if (hmf) {
      await prisma.template.update({
        where: { id: template.id },
        data: {
          headerHtml: hmf.h || null,
          menuHtml: hmf.m || null,
          footerHtml: hmf.f || null,
        },
      });
      updated++;
    } else {
      notFound++;
      console.log(`  No HMF for: ${template.path}`);
    }
  }

  console.log(`\nDone! Updated: ${updated}, No HMF found: ${notFound}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
