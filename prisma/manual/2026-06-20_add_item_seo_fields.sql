-- Product / BoardPost 전용 SEO 필드. 추가 전용 · idempotent · 블루그린 안전.
--   npx prisma db execute --file prisma/manual/2026-06-20_add_item_seo_fields.sql

ALTER TABLE "Product"   ADD COLUMN IF NOT EXISTS "seoTitle"       TEXT;
ALTER TABLE "Product"   ADD COLUMN IF NOT EXISTS "seoDescription" TEXT;
ALTER TABLE "BoardPost" ADD COLUMN IF NOT EXISTS "seoTitle"       TEXT;
ALTER TABLE "BoardPost" ADD COLUMN IF NOT EXISTS "seoDescription" TEXT;
