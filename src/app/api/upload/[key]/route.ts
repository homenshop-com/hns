import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteFile } from "@/lib/storage";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json(
      { error: "로그인이 필요합니다." },
      { status: 401 }
    );
  }

  try {
    const { key } = await params;
    const decodedKey = decodeURIComponent(key);
    const publicUrl = process.env.R2_PUBLIC_URL || "";
    const fullUrl = `${publicUrl}/${decodedKey}`;

    await deleteFile(fullUrl);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete error:", err);
    return NextResponse.json(
      { error: "파일 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
