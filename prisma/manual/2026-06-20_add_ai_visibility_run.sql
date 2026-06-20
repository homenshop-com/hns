-- AiVisibilityRun — AI 언급률(GEO) 측정 결과 테이블.
-- 추가 전용(additive) · idempotent. 블루그린 배포 안전:
-- 기존 인스턴스는 이 테이블을 모르고, 신규 인스턴스만 사용한다.
-- 로컬/운영 모두 동일하게 적용:
--   npx prisma db execute --file prisma/manual/2026-06-20_add_ai_visibility_run.sql --schema prisma/schema.prisma

CREATE TABLE IF NOT EXISTS "AiVisibilityRun" (
  "id"             TEXT             NOT NULL,
  "siteId"         TEXT             NOT NULL,
  "engine"         TEXT             NOT NULL DEFAULT 'claude',
  "model"          TEXT             NOT NULL,
  "brandName"      TEXT,
  "domain"         TEXT,
  "totalQueries"   INTEGER          NOT NULL DEFAULT 0,
  "mentionedCount" INTEGER          NOT NULL DEFAULT 0,
  "mentionRate"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  "creditsCharged" INTEGER          NOT NULL DEFAULT 0,
  "results"        JSONB            NOT NULL DEFAULT '[]',
  "createdAt"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiVisibilityRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiVisibilityRun_siteId_createdAt_idx"
  ON "AiVisibilityRun" ("siteId", "createdAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AiVisibilityRun_siteId_fkey') THEN
    ALTER TABLE "AiVisibilityRun"
      ADD CONSTRAINT "AiVisibilityRun_siteId_fkey"
      FOREIGN KEY ("siteId") REFERENCES "Site"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
