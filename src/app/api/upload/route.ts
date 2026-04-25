import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { uploadFile, uploadImageCompressed, uploadImageWithResize } from "@/lib/storage";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json(
      { error: "로그인이 필요합니다." },
      { status: 401 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "파일이 없습니다." },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "허용되지 않는 파일 형식입니다. (JPEG, PNG, GIF, WebP만 가능)" },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "파일 크기가 10MB를 초과합니다." },
        { status: 400 }
      );
    }

    const folder = (formData.get("folder") as string) || "uploads";
    const resize = formData.get("resize") === "true";
    const compress = formData.get("compress") === "true";

    if (resize) {
      // Product images: generate thumb/medium/large variants
      const urls = await uploadImageWithResize(file, folder);
      return NextResponse.json(urls, { status: 201 });
    }

    if (compress) {
      // Design-editor images: max 1920×1920, JPEG 85 / PNG 90 / WebP 85,
      // EXIF stripped, format passthrough (PNG transparency / GIF animation
      // preserved). Returns one URL.
      const maxWidthRaw = formData.get("maxWidth");
      const maxWidth = typeof maxWidthRaw === "string" ? parseInt(maxWidthRaw) : undefined;
      const url = await uploadImageCompressed(file, folder, {
        maxWidth: Number.isFinite(maxWidth) ? maxWidth : undefined,
      });
      return NextResponse.json({ url }, { status: 201 });
    }

    // Simple upload (no resize / no compress) — kept for non-image files
    // and any caller that explicitly wants the bytes verbatim.
    const url = await uploadFile(file, folder);
    return NextResponse.json({ url }, { status: 201 });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json(
      { error: "파일 업로드 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
