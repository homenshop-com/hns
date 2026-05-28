-- ============================================================
-- Migration: add_subscription
-- Adds PayPal recurring subscription support
-- ============================================================

-- 1. New enums
CREATE TYPE "PaymentChannel" AS ENUM ('PAYPAL', 'TOSS', 'BANK_TRANSFER');

CREATE TYPE "SubscriptionStatus" AS ENUM (
  'PENDING',
  'ACTIVE',
  'CANCELLED',
  'PAYMENT_FAILED',
  'EXPIRED'
);

-- 2. New columns on Order
ALTER TABLE "Order"
  ADD COLUMN "paymentChannel" "PaymentChannel",
  ADD COLUMN "subscriptionId"  TEXT,
  ADD COLUMN "paypalEventId"   TEXT;

-- 3. Unique constraint on Order.paypalEventId (idempotency)
CREATE UNIQUE INDEX "Order_paypalEventId_key" ON "Order"("paypalEventId");

-- 4. Indexes on new Order columns
CREATE INDEX "Order_subscriptionId_idx"  ON "Order"("subscriptionId");
CREATE INDEX "Order_paymentChannel_idx"  ON "Order"("paymentChannel");

-- 5. Subscription table
CREATE TABLE "Subscription" (
  "id"                   TEXT        NOT NULL,
  "siteId"               TEXT        NOT NULL,
  "userId"               TEXT        NOT NULL,
  "paypalSubscriptionId" TEXT        NOT NULL,
  "paypalPlanId"         TEXT        NOT NULL,
  "status"               "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
  "currentPeriodStart"   TIMESTAMP(3),
  "currentPeriodEnd"     TIMESTAMP(3),
  "cancelAtPeriodEnd"    BOOLEAN     NOT NULL DEFAULT false,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- 6. Unique + indexes on Subscription
CREATE UNIQUE INDEX "Subscription_paypalSubscriptionId_key"
  ON "Subscription"("paypalSubscriptionId");

CREATE INDEX "Subscription_siteId_idx"  ON "Subscription"("siteId");
CREATE INDEX "Subscription_userId_idx"  ON "Subscription"("userId");
CREATE INDEX "Subscription_status_idx"  ON "Subscription"("status");

-- 7. Foreign key: Order.subscriptionId → Subscription.id
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId")
  REFERENCES "Subscription"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 8. Foreign keys: Subscription → Site / User
ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
