"use client";

import { useRef, useState } from "react";
import { resolveResellerLogoUrl } from "@/lib/reseller-logo";

/**
 * Logo picker for the admin reseller form. Uploads the chosen image to
 * /api/upload (folder=reseller-logos, mild compression) and stores the
 * returned absolute URL in `value`. Falls back to showing a legacy bare
 * filename via resolveResellerLogoUrl so previously-migrated logos preview.
 */
export default function ResellerLogoField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const previewUrl = resolveResellerLogoUrl(value);

  async function handleFile(file: File) {
    setError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "reseller-logos");
      fd.append("compress", "true");
      fd.append("maxWidth", "600");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "업로드에 실패했습니다.");
      onChange(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드 중 오류가 발생했습니다.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">로고</label>
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-32 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
          {previewUrl ? (
            // Arbitrary uploaded/legacy asset, not eligible for next/image.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="로고 미리보기"
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="text-xs text-slate-400">로고 없음</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              {uploading ? "업로드 중..." : "이미지 업로드"}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange("")}
                disabled={uploading}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                제거
              </button>
            )}
          </div>
          <p className="text-xs text-slate-400">PNG · JPG · GIF · WebP (최대 10MB)</p>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
