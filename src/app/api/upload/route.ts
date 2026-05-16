import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
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

    const folderRaw = (formData.get("folder") as string) || "uploads";
    const siteIdRaw = formData.get("siteId");
    // siteId scopes uploads to /uploads/site-uploads/{shopId}/ so the
    // 에셋 tab can list a site's media + each customer's folder is named
    // by their human-readable shopId (e.g. ybsurplus-com) — much easier
    // to migrate when a customer leaves the platform. Whitelist a-z 0-9
    // _ - to prevent path traversal.
    const siteIdParam = typeof siteIdRaw === "string" && /^[a-z0-9_-]+$/i.test(siteIdRaw)
      ? siteIdRaw
      : null;
    // Resolve siteId (cuid) → shopId via DB, and verify ownership.
    // Accepts either the internal siteId or the shopId as input — both
    // map to the same shopId-keyed folder.
    let scopedSlug: string | null = null;
    if (siteIdParam && folderRaw === "site-uploads") {
      const site = await prisma.site.findFirst({
        where: {
          OR: [{ id: siteIdParam }, { shopId: siteIdParam }],
          userId: session.user.id,
        },
        select: { shopId: true },
      });
      if (site) scopedSlug = site.shopId;
    }
    const folder = scopedSlug ? `site-uploads/${scopedSlug}` : folderRaw;
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
