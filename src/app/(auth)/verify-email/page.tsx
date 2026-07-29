import { prisma } from "@/lib/db";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

type MessageKey = "success" | "invalidLink" | "notFound" | "expired";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return <Result status="error" messageKey="invalidLink" />;
  }

  // Find token
  const record = await prisma.verificationToken.findUnique({
    where: { token },
  });

  if (!record) {
    return <Result status="error" messageKey="notFound" />;
  }

  if (record.expires < new Date()) {
    // Clean up expired token
    await prisma.verificationToken.delete({ where: { token } });
    return <Result status="error" messageKey="expired" />;
  }

  // Mark user as verified
  await prisma.user.updateMany({
    where: { email: record.identifier },
    data: { emailVerified: new Date() },
  });

  // Delete used token
  await prisma.verificationToken.delete({ where: { token } });

  return <Result status="success" messageKey="success" />;
}

async function Result({
  status,
  messageKey,
}: {
  status: "success" | "error";
  messageKey: MessageKey;
}) {
  const t = await getTranslations("auth.verifyEmail");
  const tAuth = await getTranslations("auth");
  return (
    <div className="auth-page">
      <Link href="/" className="auth-home">
        <span aria-hidden="true">←</span> {tAuth("backHome")}
      </Link>
      <div className="auth-card login" style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>
          {status === "success" ? "✅" : "❌"}
        </div>
        <h1 className="auth-title" style={{ marginBottom: 12 }}>
          {status === "success" ? t("successTitle") : t("errorTitle")}
        </h1>
        <p style={{ color: "#4a5568", fontSize: 15, marginBottom: 24, lineHeight: 1.6 }}>
          {t(messageKey)}
        </p>
        <Link
          href="/dashboard"
          className="auth-btn"
          style={{ display: "inline-block", textDecoration: "none", textAlign: "center" }}
        >
          {t("goDashboard")}
        </Link>
      </div>
    </div>
  );
}
