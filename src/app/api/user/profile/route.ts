import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PUT(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { name, phone } = await request.json();

  const current = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { phone: true },
  });

  const newPhone = phone || null;
  // If the phone number changes, the prior OTP proof no longer applies to the
  // new number — clear phoneVerifiedAt so downstream flows (claim-prospect)
  // cannot treat a swapped-in number as verified. Re-verification is required.
  const phoneChanged = (current?.phone ?? null) !== newPhone;

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name: name || null,
      phone: newPhone,
      ...(phoneChanged ? { phoneVerifiedAt: null } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}
