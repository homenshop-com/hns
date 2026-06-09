/**
 * remap-legacy-users.mjs
 *
 * 레거시 MySQL maindb 의 orders+members 테이블에서 추출한
 * shopId → 실제이메일 매핑을 사용하여,
 * 마이그레이션 시 생성된 {shopId}@homenshop.net 유령계정을
 * 실제 소유자 계정으로 교체합니다.
 *
 * 동작 원리:
 *   A. 실제 이메일 User 이미 존재 → Site.userId 교체 + 유령계정 삭제
 *   B. 실제 이메일 User 없음      → 유령계정의 email 을 실제 이메일로 업데이트
 *   C. Site 없음                  → 스킵
 *
 * 실행:
 *   source /var/www/homenshop-next/.env.local 2>/dev/null || true
 *   node scripts/remap-legacy-users.mjs [--dry-run]
 *
 *   또는 DATABASE_URL 직접 지정:
 *   DATABASE_URL="postgresql://..." node scripts/remap-legacy-users.mjs --dry-run
 */

import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes("--dry-run");

// .env.local 에서 DATABASE_URL 로드 (환경변수로 주입되지 않은 경우 폴백)
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

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL 환경변수가 없습니다.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

if (DRY_RUN) console.log("🔍 DRY-RUN 모드 — DB 변경 없음\n");

// ──────────────────────────────────────────────────────────────────────────────
// 레거시 maindb (orders JOIN members) 에서 추출한 shopId → 실제 이메일 매핑
// 출처: /htdocs/lib/class/db_bak/maindb_20220802.sql
// ──────────────────────────────────────────────────────────────────────────────
const MAPPING = [
  { shopId: "a1shutters",      email: "robertkim78@gmail.com" },
  { shopId: "aaapainting",     email: "steve815kim@gmail.com" },
  { shopId: "adam-painting",   email: "info.adampainting@gmail.com" },
  { shopId: "asfdasdf33",      email: "hhj582@hanmail.net" },
  { shopId: "bjtotalcoating",  email: "admin@bjtotalcoating.com.au" },
  { shopId: "blossom",         email: "stella.blossombeauty@gmail.com" },
  { shopId: "cacsedu",         email: "hhj582@hanmail.net" },
  { shopId: "cacsedu2",        email: "hhj582@hanmail.net" },
  { shopId: "cleanokay",       email: "cleanokay@gmail.com" },
  { shopId: "cleantopiaser",   email: "cleantopiaservices@gmail.com" },
  { shopId: "commonhealth-d",  email: "commondental@gmail.com" },
  { shopId: "daynighttour",    email: "sydneydaynighttour@gmail.com" },
  { shopId: "dentalmillingcen",email: "admc.nsw@gmail.com" },
  { shopId: "donnypainting",   email: "donnypainting@hotmail.com" },
  { shopId: "felicehair",      email: "felicehair.sydney@gmail.com" },
  { shopId: "freecontrol",     email: "soft0123@naver.com" },
  { shopId: "friendly-cleanin",email: "friendlycleaningsyd@gmail.com" },
  { shopId: "gajameat",        email: "webnshopau@gmail.com" },
  { shopId: "glowmotion-2",    email: "glowmotion@naver.com" },
  { shopId: "hairgallery",     email: "koji23yun@hanmail.net" },
  { shopId: "haraberu",        email: "haraberu@outlook.com" },
  { shopId: "huidlab",         email: "jaypark0420@gmail.com" },
  { shopId: "inmec12345",      email: "goodshot73@naver.com" },
  { shopId: "inmecgroup",      email: "goodshot73@naver.com" },
  { shopId: "inmecgroup1",     email: "goodshot73@naver.com" },
  { shopId: "innex-cleaning-1",email: "admin@innexcleaning.com.au" },
  { shopId: "innoblinds",      email: "sydinno@gmail.com" },
  { shopId: "jeune-au",        email: "sales@jeune.com.au" },
  { shopId: "jps0621",         email: "btyeom0705@gmail.com" },
  { shopId: "jsfood",          email: "jsfood@live.co.kr" },
  { shopId: "jungclinic",      email: "info@jungclinic.com.au" },
  { shopId: "konnichiwasushi", email: "karl2144@gmail.com" },
  { shopId: "marystchildcare", email: "info@marystchildcare.com.au" },
  { shopId: "masangenakjjim",  email: "hyj7001@naver.com" },
  { shopId: "masterrolls",     email: "master.rolls@hotmail.com" },
  { shopId: "masterthaimassag",email: "masterthaimassage@hotmail.com" },
  { shopId: "medident",        email: "medidentaustralia@gmail.com" },
  { shopId: "misungnetworks",  email: "whchoi000@naver.com" },
  { shopId: "nabtnc",          email: "nab21@hanmail.net" },
  { shopId: "nakiss",          email: "nakisensor@naver.com" },
  { shopId: "newkorea",        email: "hykang@newkoreaip.com" },
  { shopId: "oven-time",       email: "oventime0191@gmail.com" },
  { shopId: "parks0293",       email: "hhj582@hanmail.net" },
  { shopId: "rmbiohome",       email: "nji2000@hanmail.net" },
  { shopId: "sbscleaning",     email: "admin@sbsservices.com.au" },
  { shopId: "semicon",         email: "ejkim@atsemicon.com" },
  { shopId: "seu-hallym",      email: "tanyou@nate.com" },
  { shopId: "skygroup",        email: "art100@skygroup.cn" },
  { shopId: "snecleaning",     email: "webnshopau@gmail.com" },
  { shopId: "soullighting2",   email: "soullightkim@naver.com" },
  { shopId: "sushirashai",     email: "sushirashai@gmail.com" },
  { shopId: "swishkitchen",    email: "info@swishkitchen.com.au" },
  { shopId: "swishkitchen-02", email: "info@swishkitchen.com.au" },
  { shopId: "sydneyovenclean", email: "sydneyovenclean@gmail.com" },
  { shopId: "whereisshop",     email: "webnshopau@gmail.com" },
  { shopId: "winbrocleaning",  email: "admin@winbrocleaning.com.au" },
  { shopId: "wintec",          email: "wte@hanmail.net" },
  { shopId: "worldcleaning",   email: "worldcleaningstaff@gmail.com" },
  { shopId: "xunion5",         email: "jgcheon@hanmail.net" },
  { shopId: "ybsurplus",       email: "eric.ahn09@gmail.com" },
  { shopId: "yes-300",         email: "book@yesremovals.com.au" },
  { shopId: "youngdriving",    email: "youngdrivingschool@hotmail.com" },
];

// ──────────────────────────────────────────────────────────────────────────────
async function query(sql, params = []) {
  const r = await client.query(sql, params);
  return r.rows;
}

async function run() {
  await client.connect();
  console.log(`총 ${MAPPING.length}개 shopId 처리 시작\n`);

  const stats = { already: 0, merged: 0, renamed: 0, noSite: 0, skipped: 0 };

  for (const { shopId, email: realEmail } of MAPPING) {
    // 1. Site 조회
    const sites = await query(
      `SELECT id, "userId" FROM "Site" WHERE "shopId" = $1`, [shopId]
    );
    if (sites.length === 0) {
      console.log(`  ⚠️  [${shopId}] Site 없음 — 스킵`);
      stats.noSite++;
      continue;
    }

    // 2. 유령계정 조회
    const ghostEmail = `${shopId}@homenshop.net`;
    const ghostRows = await query(
      `SELECT id, email FROM "User" WHERE email = $1`, [ghostEmail]
    );
    const ghost = ghostRows[0] ?? null;

    // 3. 실제 이메일 User 조회
    const realRows = await query(
      `SELECT id, email, name FROM "User" WHERE email = $1`, [realEmail]
    );
    const realUser = realRows[0] ?? null;

    if (realUser) {
      // ── A. 실제 User 이미 존재 ──
      const alreadyMapped = sites.every((s) => s.userId === realUser.id);
      if (alreadyMapped && !ghost) {
        console.log(`  ✅  [${shopId}] 이미 올바르게 매핑됨 → ${realEmail}`);
        stats.already++;
        continue;
      }

      console.log(`  🔀  [${shopId}] 실제 User 연결: ${ghostEmail || "(ghost 없음)"} → ${realEmail}`);
      if (!DRY_RUN) {
        for (const site of sites) {
          if (site.userId !== realUser.id) {
            await query(
              `UPDATE "Site" SET "userId" = $1 WHERE id = $2`,
              [realUser.id, site.id]
            );
          }
        }
        // 유령계정 정리: 다른 Site 가 없으면 삭제
        if (ghost) {
          const otherSites = await query(
            `SELECT id FROM "Site" WHERE "userId" = $1`, [ghost.id]
          );
          if (otherSites.length === 0) {
            await query(`DELETE FROM "User" WHERE id = $1`, [ghost.id]);
            console.log(`       🗑️  유령계정 삭제: ${ghostEmail}`);
          } else {
            console.log(`       ⚠️  유령계정에 Site ${otherSites.length}개 남아 삭제 스킵`);
          }
        }
      }
      stats.merged++;

    } else if (ghost) {
      // ── B. 실제 User 없음 + 유령계정 존재 → 이메일 교체 ──
      console.log(`  📝  [${shopId}] 이메일 교체: ${ghostEmail} → ${realEmail}`);
      if (!DRY_RUN) {
        await query(
          `UPDATE "User" SET email = $1, name = $2, "updatedAt" = NOW() WHERE id = $3`,
          [realEmail, realEmail.split("@")[0], ghost.id]
        );
      }
      stats.renamed++;

    } else {
      console.log(`  ❓  [${shopId}] User 전혀 없음 — 스킵`);
      stats.skipped++;
    }
  }

  console.log("\n─── 완료 ──────────────────────────────────────────────");
  console.log(`  ✅ 이미 올바름:          ${stats.already}`);
  console.log(`  🔀 실User로 연결·교체:   ${stats.merged}`);
  console.log(`  📝 유령계정 이메일 교체: ${stats.renamed}`);
  console.log(`  ⚠️  Site 없음:            ${stats.noSite}`);
  console.log(`  ❓ 기타 스킵:            ${stats.skipped}`);
  if (DRY_RUN) console.log("\n  ※ DRY-RUN — 실제 변경 없음");

  await client.end();
}

run().catch((e) => { console.error(e); process.exit(1); });
