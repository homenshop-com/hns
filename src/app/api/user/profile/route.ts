import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PUT(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { name, phone } = await request.json();

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name: name || null,
      phone: phone || null,
    },
  });

  return NextResponse.json({ ok: true });
}
