import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Verify password
  const { password } = await req.json();
  if (!password) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true },
  });

  if (!user?.password) {
    return NextResponse.json({ error: "No password set" }, { status: 400 });
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    return NextResponse.json({ error: "Wrong password" }, { status: 403 });
  }

  // Delete in order to avoid FK constraints
  // Orders and Domains reference userId without cascade
  await prisma.orderItem.deleteMany({
    where: { order: { userId } },
  });
  await prisma.order.deleteMany({ where: { userId } });
  await prisma.domain.deleteMany({ where: { userId } });

  // User deletion cascades to: Account, Session, Site → (Page, Product, Board, BoardCategory, BoardPost, SiteHmf, etc.)
  await prisma.user.delete({ where: { id: userId } });

  return NextResponse.json({ ok: true });
}
