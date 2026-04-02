import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [membersCount, sitesCount, ordersCount, productsCount, recentUsers] =
    await Promise.all([
      prisma.user.count(),
      prisma.site.count(),
      prisma.order.count(),
      prisma.product.count(),
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);

  return NextResponse.json({
    membersCount,
    sitesCount,
    ordersCount,
    productsCount,
    recentUsers,
  });
}
