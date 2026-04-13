import { prisma } from "@/lib/db";
import Link from "next/link";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return <Result status="error" message="유효하지 않은 링크입니다." />;
  }

  // Find token
  const record = await prisma.verificationToken.findUnique({
    where: { token },
  });

  if (!record) {
    return <Result status="error" message="인증 링크가 만료되었거나 유효하지 않습니다." />;
  }

  if (record.expires < new Date()) {
    // Clean up expired token
    await prisma.verificationToken.delete({ where: { token } });
    return <Result status="error" message="인증 링크가 만료되었습니다. 다시 요청해주세요." />;
  }

  // Mark user as verified
  await prisma.user.updateMany({
    where: { email: record.identifier },
    data: { emailVerified: new Date() },
  });

  // Delete used token
  await prisma.verificationToken.delete({ where: { token } });

  return <Result status="success" message="이메일 인증이 완료되었습니다!" />;
}

function Result({ status, message }: { status: "success" | "error"; message: string }) {
  return (
    <div className="auth-page">
      <div className="auth-card login" style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>
          {status === "success" ? "\u2705" : "\u274C"}
        </div>
        <h1 className="auth-title" style={{ marginBottom: 12 }}>
          {status === "success" ? "이메일 인증 완료" : "인증 실패"}
        </h1>
        <p style={{ color: "#4a5568", fontSize: 15, marginBottom: 24, lineHeight: 1.6 }}>
          {message}
        </p>
        <Link
          href="/dashboard"
          className="auth-btn"
          style={{ display: "inline-block", textDecoration: "none", textAlign: "center" }}
        >
          대시보드로 이동
        </Link>
      </div>
    </div>
  );
}
