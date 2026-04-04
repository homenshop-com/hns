"use client";

import { useState, useRef, useCallback } from "react";

interface ImageUrls {
  original: string;
  thumb: string;
  medium: string;
  large: string;
}

interface ImageUploadProps {
  value?: string;
  onChange: (url: string) => void;
  /** Called with all size variants when resize=true */
  onUploadComplete?: (urls: ImageUrls) => void;
  folder?: string;
  /** Enable server-side resize (thumb/medium/large) */
  resize?: boolean;
}

export default function ImageUpload({
  value,
  onChange,
  onUploadComplete,
  folder = "uploads",
  resize = false,
}: ImageUploadProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (file: File) => {
      setError("");
      setLoading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("folder", folder);
        if (resize) formData.append("resize", "true");

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "업로드에 실패했습니다.");
        }

        if (resize && data.thumb) {
          // Resize mode: return medium as main display URL
          onChange(data.medium);
          onUploadComplete?.(data as ImageUrls);
        } else {
          onChange(data.url);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "업로드에 실패했습니다."
        );
      } finally {
        setLoading(false);
      }
    },
    [folder, resize, onChange, onUploadComplete]
  );

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) upload(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
  }

  function handleRemove() {
    onChange("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative inline-block">
          <img
            src={value}
            alt="업로드된 이미지"
            className="h-40 w-40 rounded-lg border border-zinc-300 object-cover"
          />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs text-white hover:bg-red-600"
          >
            X
          </button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`flex h-40 w-40 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
            dragOver
              ? "border-zinc-900 bg-zinc-100"
              : "border-zinc-300 hover:border-zinc-400"
          }`}
        >
          {loading ? (
            <div className="flex flex-col items-center gap-2">
              <svg
                className="h-6 w-6 animate-spin text-zinc-400"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              <span className="text-xs text-zinc-500">업로드 중...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1 text-zinc-400">
              <svg
                className="h-8 w-8"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
                />
              </svg>
              <span className="text-xs">클릭 또는 드래그</span>
            </div>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}
