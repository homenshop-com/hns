-- Page.aeoBlocks — AEO 콘텐츠 블록(JSON). 추가 전용 · idempotent.
-- 블루그린 안전: 기존 인스턴스는 이 컬럼을 모르고, 신규 인스턴스만 사용.
--   npx prisma db execute --file prisma/manual/2026-06-20_add_page_aeo_blocks.sql

ALTER TABLE "Page" ADD COLUMN IF NOT EXISTS "aeoBlocks" JSONB;
