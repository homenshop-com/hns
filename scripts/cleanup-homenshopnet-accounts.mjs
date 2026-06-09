/**
 * cleanup-homenshopnet-accounts.mjs
 *
 * 특정 날짜에 생성된 @homenshop.net 유령계정을 정리합니다.
 * 사이트를 소유한 경우 삭제하지 않고 경고를 표시합니다.
 *
 * 실행:
 *   node scripts/cleanup-homenshopnet-accounts.mjs [--dry-run] [--date 2026-06-06]
 */

import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes("--dry-run");
const dateArg = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) || "2026-06-06";

if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(__dirname, "../.env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const m = line.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/);
      if (m) { process.env.DATABASE_URL = m[1].trim(); break; }
    }
  }
}
if (!process.env.DATABASE_URL) { console.error("❌ DATABASE_URL 없음"); process.exit(1); }

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

if (DRY_RUN) console.log("🔍 DRY-RUN 모드 — DB 변경 없음");
console.log(`📅 대상 날짜: ${dateArg}\n`);

async function run() {
  await client.connect();

  // 1. 대상 조회
  const { rows } = await client.query(`
    SELECT u.id, u.email, u."createdAt",
           COUNT(s.id)::int AS site_count
    FROM "User" u
    LEFT JOIN "Site" s ON s."userId" = u.id
    WHERE u.email LIKE '%@homenshop.net'
      AND DATE(u."createdAt" AT TIME ZONE 'UTC') = $1
    GROUP BY u.id, u.email, u."createdAt"
    ORDER BY u.email
  `, [dateArg]);

  console.log(`총 ${rows.length}개 계정 발견\n`);

  const toDelete = rows.filter((r) => r.site_count === 0);
  const toKeep   = rows.filter((r) => r.site_count > 0);

  if (toKeep.length > 0) {
    console.log("⚠️  사이트가 있어 유지하는 계정:");
    toKeep.forEach((r) =>
      console.log(`   ${r.email}  (사이트 ${r.site_count}개)`)
    );
    console.log();
  }

  if (toDelete.length === 0) {
    console.log("삭제할 계정 없음 (사이트 없는 @homenshop.net 계정 0개)");
    await client.end(); return;
  }

  console.log(`🗑️  삭제 예정 ${toDelete.length}개 (사이트 없음):`);
  toDelete.forEach((r) => console.log(`   ${r.email}`));

  if (!DRY_RUN) {
    const ids = toDelete.map((r) => r.id);
    const result = await client.query(
      `DELETE FROM "User" WHERE id = ANY($1::text[])`,
      [ids]
    );
    console.log(`\n✅ ${result.rowCount}개 삭제 완료`);
  } else {
    console.log("\n  ※ DRY-RUN — 실제 삭제 없음");
  }

  await client.end();
}

run().catch((e) => { console.error(e); process.exit(1); });
