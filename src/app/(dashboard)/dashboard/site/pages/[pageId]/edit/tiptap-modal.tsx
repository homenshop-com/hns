"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle, Color, FontFamily, FontSize, BackgroundColor } from "@tiptap/extension-text-style";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

interface TiptapModalProps {
  initialHtml: string;
  onSave: (html: string) => void;
  onClose: () => void;
  /** Site pages for the link picker (relative {slug}.html targets). */
  pages?: { slug: string; title: string; isHome?: boolean }[];
  /** Owner site id — for image file uploads to the per-site folder. */
  siteId?: string;
}

/* ─── Toolbar Button ─── */
function TBtn({
  active,
  onClick,
  title,
  children,
  style,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      style={{
        padding: "4px 8px",
        fontSize: 13,
        border: "1px solid #555",
        borderRadius: 3,
        background: active ? "#4a90d9" : "#3a3a3a",
        color: active ? "#fff" : "#ccc",
        cursor: "pointer",
        minWidth: 28,
        lineHeight: 1.4,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

const SELECT_STYLE: React.CSSProperties = {
  padding: "4px 6px",
  fontSize: 12,
  border: "1px solid #555",
  borderRadius: 3,
  background: "#3a3a3a",
  color: "#ccc",
  cursor: "pointer",
};

const FONT_FAMILIES = [
  { label: "기본 글꼴", value: "" },
  { label: "Noto Sans KR", value: "'Noto Sans KR', sans-serif" },
  { label: "Nanum Gothic", value: "'Nanum Gothic', sans-serif" },
  { label: "Pretendard", value: "Pretendard, sans-serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
  { label: "Century Gothic", value: "'Century Gothic', sans-serif" },
];
const FONT_SIZES = ["12", "14", "16", "18", "20", "24", "28", "32", "40", "48"];
const HIGHLIGHTS = [
  { c: "#fff3a3", t: "노랑" },
  { c: "#c8f7c5", t: "초록" },
  { c: "#ffd1dc", t: "분홍" },
  { c: "#cfe8ff", t: "파랑" },
  { c: "#ffe0b3", t: "주황" },
];

/* ─── Link panel (페이지/외부URL/위치) — replaces the bare prompt() ─── */
type LinkKind = "none" | "page" | "url" | "anchor";
function LinkPanel({
  editor,
  pages,
  onClose,
}: {
  editor: Editor;
  pages: { slug: string; title: string; isHome?: boolean }[];
  onClose: () => void;
}) {
  const existing = editor.getAttributes("link").href ?? "";
  const existingTarget = editor.getAttributes("link").target ?? "";
  const detect = (href: string): LinkKind => {
    if (!href) return "none";
    if (href.startsWith("#")) return "anchor";
    const p = href.replace(/^https?:\/\/[^/]+/, "").replace(/[?#].*$/, "");
    if (pages.some((pg) => p.endsWith(`${pg.slug}.html`))) return "page";
    return "url";
  };
  const [kind, setKind] = useState<LinkKind>(detect(existing));
  const [url, setUrl] = useState(detect(existing) === "url" ? existing : "");
  const [target, setTarget] = useState(existingTarget || "_blank");
  const [pageSlug, setPageSlug] = useState(
    detect(existing) === "page"
      ? pages.find((pg) =>
          existing.replace(/^https?:\/\/[^/]+/, "").replace(/[?#].*$/, "").endsWith(`${pg.slug}.html`),
        )?.slug ?? ""
      : "",
  );
  const [anchorId, setAnchorId] = useState(existing.startsWith("#") ? existing.slice(1) : "");
  const anchorOptions = useMemo(() => {
    if (typeof document === "undefined") return [];
    const body = document.getElementById("hns_body");
    if (!body) return [];
    return Array.from(body.querySelectorAll<HTMLElement>("[id]"))
      .filter((e) => e.id && (e.classList.contains("dragable") || /^el_/.test(e.id)))
      .map((e) => ({ id: e.id, label: (e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 28) || e.id }))
      .slice(0, 200);
  }, []);

  const apply = () => {
    let href = "";
    let tgt = "";
    if (kind === "page") href = pageSlug ? `${pageSlug}.html` : "";
    else if (kind === "url") {
      href = url.trim();
      tgt = target === "_self" ? "" : target;
    } else if (kind === "anchor") href = anchorId ? `#${anchorId}` : "";
    const chain = editor.chain().focus().extendMarkRange("link");
    if (!href) chain.unsetLink().run();
    else chain.setLink({ href, target: tgt || null }).run();
    onClose();
  };

  const chip = (k: LinkKind, label: string) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => setKind(k)}
      style={{
        flex: 1,
        padding: "5px 0",
        fontSize: 12,
        cursor: "pointer",
        border: "1px solid " + (kind === k ? "#4a90d9" : "#555"),
        background: kind === k ? "rgba(74,144,217,0.25)" : "#333",
        color: kind === k ? "#bcd8ff" : "#aaa",
        borderRadius: 5,
      }}
    >
      {label}
    </button>
  );
  const f: React.CSSProperties = {
    width: "100%",
    padding: "6px 8px",
    background: "#1e1e1e",
    color: "#e0e0e0",
    border: "1px solid #555",
    borderRadius: 5,
    fontSize: 13,
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 56,
        left: 12,
        zIndex: 5,
        width: 320,
        background: "#2a2a2a",
        border: "1px solid #555",
        borderRadius: 8,
        padding: 12,
        boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        {chip("none", "없음")}
        {chip("page", "페이지")}
        {chip("url", "URL")}
        {chip("anchor", "위치")}
      </div>
      {kind === "page" && (
        <select value={pageSlug} onChange={(e) => setPageSlug(e.target.value)} style={f}>
          <option value="">페이지 선택…</option>
          {pages.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.isHome ? "🏠 " : ""}
              {p.title || p.slug}
            </option>
          ))}
        </select>
      )}
      {kind === "url" && (
        <>
          <input
            type="text"
            value={url}
            placeholder="https://example.com"
            onChange={(e) => setUrl(e.target.value)}
            style={f}
            autoFocus
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <span style={{ fontSize: 12, color: "#999" }}>열기</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)} style={{ ...f, flex: 1 }}>
              <option value="_self">같은 탭</option>
              <option value="_blank">새 탭</option>
            </select>
          </div>
        </>
      )}
      {kind === "anchor" && (
        <select value={anchorId} onChange={(e) => setAnchorId(e.target.value)} style={f}>
          <option value="">이동할 객체 선택…</option>
          {anchorOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 10 }}>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClose}
          style={{ padding: "6px 14px", background: "#555", color: "#ccc", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 12 }}
        >
          취소
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={apply}
          style={{ padding: "6px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 12, fontWeight: 600 }}
        >
          적용
        </button>
      </div>
    </div>
  );
}

/* ─── Main Modal ─── */
export default function TiptapModal({ initialHtml, onSave, onClose, pages = [], siteId }: TiptapModalProps) {
  const t = useTranslations("editor");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        link: { openOnClick: false, HTMLAttributes: { rel: "noopener" } },
      }),
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      BackgroundColor,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image,
      TableKit.configure({ table: { resizable: true } }),
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        style:
          "min-height:300px;max-height:60vh;overflow-y:auto;padding:16px;outline:none;color:#1a1a1a;font-size:14px;line-height:1.7;",
      },
    },
  });

  const handleSave = useCallback(() => {
    if (!editor) return;
    onSave(editor.getHTML());
  }, [editor, onSave]);

  const setColor = useCallback(
    (color: string) => editor?.chain().focus().setColor(color).run(),
    [editor],
  );

  const uploadImage = useCallback(
    async (file: File) => {
      if (!editor) return;
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("folder", "site-uploads");
        fd.append("compress", "true");
        if (siteId) fd.append("siteId", siteId);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) throw new Error(String(res.status));
        const { url } = await res.json();
        if (typeof url === "string") editor.chain().focus().setImage({ src: url }).run();
      } catch {
        alert(t("inspector.image.uploadFailed"));
      } finally {
        setUploading(false);
      }
    },
    [editor, siteId, t],
  );

  if (!editor) return null;

  const inTable = editor.isActive("table");
  const curFamily = (editor.getAttributes("textStyle").fontFamily as string) || "";
  const curSize = ((editor.getAttributes("textStyle").fontSize as string) || "").replace("px", "");

  return (
    <div
      data-tiptap-modal
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          background: "#2a2a2a",
          borderRadius: 12,
          width: "min(92vw, 860px)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          border: "1px solid #444",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid #444",
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 700, color: "#e0e0e0" }}>{t("tiptap.title")}</span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#888", fontSize: 20, cursor: "pointer", padding: "0 4px" }}
          >
            &times;
          </button>
        </div>

        {/* Toolbar */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 3,
            padding: "8px 12px",
            borderBottom: "1px solid #444",
            background: "#333",
          }}
        >
          {/* Font family + size */}
          <select
            value={curFamily}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) =>
              e.target.value
                ? editor.chain().focus().setFontFamily(e.target.value).run()
                : editor.chain().focus().unsetFontFamily().run()
            }
            title="글꼴"
            style={{ ...SELECT_STYLE, maxWidth: 130 }}
          >
            {FONT_FAMILIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            value={curSize}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) =>
              e.target.value
                ? editor.chain().focus().setFontSize(`${e.target.value}px`).run()
                : editor.chain().focus().unsetFontSize().run()
            }
            title="글자 크기"
            style={SELECT_STYLE}
          >
            <option value="">크기</option>
            {FONT_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <span style={{ width: 1, background: "#555", margin: "2px 4px" }} />

          {/* Text style */}
          <TBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title={t("tiptap.bold")}>
            <strong>B</strong>
          </TBtn>
          <TBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title={t("tiptap.italic")}>
            <em>I</em>
          </TBtn>
          <TBtn active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} title={t("tiptap.underline")}>
            <u>U</u>
          </TBtn>
          <TBtn active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} title={t("tiptap.strike")}>
            <s>S</s>
          </TBtn>

          <span style={{ width: 1, background: "#555", margin: "2px 4px" }} />

          {/* Headings */}
          <TBtn active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title={t("tiptap.h1")}>H1</TBtn>
          <TBtn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title={t("tiptap.h2")}>H2</TBtn>
          <TBtn active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title={t("tiptap.h3")}>H3</TBtn>
          <TBtn active={editor.isActive("paragraph")} onClick={() => editor.chain().focus().setParagraph().run()} title={t("tiptap.paragraph")}>P</TBtn>

          <span style={{ width: 1, background: "#555", margin: "2px 4px" }} />

          {/* Alignment */}
          <TBtn active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()} title={t("tiptap.alignLeft")}>&#x2190;</TBtn>
          <TBtn active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()} title={t("tiptap.alignCenter")}>&#x2194;</TBtn>
          <TBtn active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()} title={t("tiptap.alignRight")}>&#x2192;</TBtn>

          <span style={{ width: 1, background: "#555", margin: "2px 4px" }} />

          {/* Lists */}
          <TBtn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title={t("tiptap.bulletList")}>&#x2022; List</TBtn>
          <TBtn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title={t("tiptap.orderedList")}>1. List</TBtn>
          <TBtn active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().setBlockquote().run()} title={t("tiptap.blockquote")}>&ldquo;&rdquo;</TBtn>

          <span style={{ width: 1, background: "#555", margin: "2px 4px" }} />

          {/* Link / Image / Table */}
          <TBtn active={editor.isActive("link") || linkOpen} onClick={() => setLinkOpen((v) => !v)} title={t("tiptap.link")}>&#x1F517;</TBtn>
          <TBtn onClick={() => fileInputRef.current?.click()} title="이미지 업로드" style={uploading ? { opacity: 0.6 } : undefined}>
            {uploading ? "…" : "\u{1F5BC}"}
          </TBtn>
          <TBtn
            active={inTable}
            onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            title="표 삽입"
          >
            &#x25A6;
          </TBtn>

          <span style={{ width: 1, background: "#555", margin: "2px 4px" }} />

          {/* Text color */}
          <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
            {["#ffffff", "#ff4444", "#ff8800", "#ffcc00", "#44cc44", "#4488ff", "#cc44ff", "#888888"].map((c) => (
              <button
                key={c}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setColor(c)}
                title={`글자색 ${c}`}
                style={{ width: 18, height: 18, borderRadius: 3, background: c, border: "1px solid #666", cursor: "pointer", padding: 0 }}
              />
            ))}
          </div>

          <span style={{ width: 1, background: "#555", margin: "2px 4px" }} />

          {/* Highlight (background color) */}
          <div style={{ display: "flex", gap: 2, alignItems: "center" }} title="형광펜">
            {HIGHLIGHTS.map((h) => (
              <button
                key={h.c}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().setBackgroundColor(h.c).run()}
                title={`형광펜 ${h.t}`}
                style={{ width: 18, height: 18, borderRadius: 3, background: h.c, border: "1px solid #666", cursor: "pointer", padding: 0 }}
              />
            ))}
            <TBtn onClick={() => editor.chain().focus().unsetBackgroundColor().run()} title="형광펜 제거" style={{ minWidth: 22, padding: "2px 5px" }}>
              &#x2298;
            </TBtn>
          </div>

          <span style={{ width: 1, background: "#555", margin: "2px 4px" }} />

          {/* Undo/Redo + clear */}
          <TBtn onClick={() => editor.chain().focus().undo().run()} title={t("tiptap.undo")}>&#x21A9;</TBtn>
          <TBtn onClick={() => editor.chain().focus().redo().run()} title={t("tiptap.redo")}>&#x21AA;</TBtn>
          <TBtn onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} title={t("tiptap.clearFormat")}>&#x2718;</TBtn>
          <TBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title={t("tiptap.hr")}>&#x2015;</TBtn>
        </div>

        {/* Table editing controls (visible only inside a table) */}
        {inTable && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, padding: "6px 12px", borderBottom: "1px solid #444", background: "#2e2e2e" }}>
            <TBtn onClick={() => editor.chain().focus().addRowAfter().run()} title="행 추가">+행</TBtn>
            <TBtn onClick={() => editor.chain().focus().deleteRow().run()} title="행 삭제">−행</TBtn>
            <TBtn onClick={() => editor.chain().focus().addColumnAfter().run()} title="열 추가">+열</TBtn>
            <TBtn onClick={() => editor.chain().focus().deleteColumn().run()} title="열 삭제">−열</TBtn>
            <TBtn onClick={() => editor.chain().focus().mergeOrSplit().run()} title="셀 병합/분할">병합</TBtn>
            <TBtn onClick={() => editor.chain().focus().toggleHeaderRow().run()} title="머리글 행">머리글</TBtn>
            <TBtn onClick={() => editor.chain().focus().deleteTable().run()} title="표 삭제" style={{ color: "#ff8888" }}>표 삭제</TBtn>
          </div>
        )}

        {/* Link panel */}
        {linkOpen && <LinkPanel editor={editor} pages={pages} onClose={() => setLinkOpen(false)} />}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadImage(f);
            e.target.value = "";
          }}
        />

        {/* Editor content */}
        {/* White document area — legacy body text is authored dark (e.g. #3C2515)
            for light pages, so a dark editor bg made it invisible. White matches
            the real page and keeps the inline colors readable (WYSIWYG). */}
        <div style={{ flex: 1, overflow: "auto", background: "#fff", borderRadius: "0 0 12px 12px" }} className="tiptap-editor-area">
          <EditorContent editor={editor} />
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "12px 16px",
            borderTop: "1px solid #444",
            background: "#333",
            borderRadius: "0 0 12px 12px",
          }}
        >
          <button onClick={onClose} style={{ padding: "10px 24px", background: "#555", color: "#ccc", border: "none", borderRadius: 6, fontSize: 14, cursor: "pointer" }}>
            {t("tiptap.cancel")}
          </button>
          <button onClick={handleSave} style={{ padding: "10px 28px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            {t("tiptap.apply")}
          </button>
        </div>
      </div>

      {/* TipTap default styles */}
      <style>{`
        .tiptap-editor-area .tiptap { min-height: 300px; cursor: text; user-select: text; -webkit-user-select: text; }
        .tiptap-editor-area .tiptap p { margin: 0.5em 0; }
        .tiptap-editor-area .tiptap h1, .tiptap-editor-area .tiptap h2, .tiptap-editor-area .tiptap h3, .tiptap-editor-area .tiptap h4 { margin: 0.8em 0 0.4em; font-weight: 700; }
        .tiptap-editor-area .tiptap h1 { font-size: 2em; }
        .tiptap-editor-area .tiptap h2 { font-size: 1.5em; }
        .tiptap-editor-area .tiptap h3 { font-size: 1.17em; }
        .tiptap-editor-area .tiptap ul, .tiptap-editor-area .tiptap ol { padding-left: 1.5em; margin: 0.5em 0; }
        .tiptap-editor-area .tiptap blockquote { border-left: 3px solid #ccc; padding-left: 1em; margin: 0.5em 0; color: #666; }
        .tiptap-editor-area .tiptap a { color: #2563eb; text-decoration: underline; }
        .tiptap-editor-area .tiptap img { max-width: 100%; height: auto; }
        .tiptap-editor-area .tiptap hr { border: none; border-top: 1px solid #ddd; margin: 1em 0; }
        .tiptap-editor-area .tiptap code { background: #eef0f3; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
        .tiptap-editor-area .tiptap pre { background: #f4f5f7; padding: 12px; border-radius: 6px; overflow-x: auto; }
        .tiptap-editor-area .tiptap table { border-collapse: collapse; margin: 0.5em 0; width: 100%; table-layout: fixed; }
        .tiptap-editor-area .tiptap th, .tiptap-editor-area .tiptap td { border: 1px solid #ccc; padding: 6px 8px; vertical-align: top; min-width: 40px; }
        .tiptap-editor-area .tiptap th { background: #f0f2f5; font-weight: 700; }
        .tiptap-editor-area .tiptap .selectedCell { background: rgba(74,144,217,0.25); }
        .tiptap-editor-area .tiptap .column-resize-handle { background: #4a90d9; width: 3px; }
      `}</style>
    </div>
  );
}
