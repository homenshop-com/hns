"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Image from "@tiptap/extension-image";
import { useCallback } from "react";
import { useTranslations } from "next-intl";

interface TiptapModalProps {
  initialHtml: string;
  onSave: (html: string) => void;
  onClose: () => void;
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

/* ─── Main Modal ─── */
export default function TiptapModal({ initialHtml, onSave, onClose }: TiptapModalProps) {
  const t = useTranslations("editor");
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        link: { openOnClick: false, HTMLAttributes: { target: "_blank" } },
      }),
      TextStyle,
      Color,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Image,
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        style:
          "min-height:300px;max-height:60vh;overflow-y:auto;padding:16px;outline:none;color:#e0e0e0;font-size:14px;line-height:1.7;",
      },
    },
  });

  const handleSave = useCallback(() => {
    if (!editor) return;
    onSave(editor.getHTML());
  }, [editor, onSave]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href;
    const url = prompt(t("tiptap.promptUrl"), prev || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  }, [editor]);

  const addImage = useCallback(() => {
    if (!editor) return;
    const url = prompt(t("tiptap.promptImageUrl"), "https://");
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  const setColor = useCallback(
    (color: string) => {
      if (!editor) return;
      editor.chain().focus().setColor(color).run();
    },
    [editor]
  );

  if (!editor) return null;

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
        // Only close if clicking directly on the overlay (not drag-selecting from inside)
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          background: "#2a2a2a",
          borderRadius: 12,
          width: "min(90vw, 800px)",
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
          <span style={{ fontSize: 15, fontWeight: 700, color: "#e0e0e0" }}>
            {t("tiptap.title")}
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#888",
              fontSize: 20,
              cursor: "pointer",
              padding: "0 4px",
            }}
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
          <TBtn active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title={t("tiptap.h1")}>
            H1
          </TBtn>
          <TBtn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title={t("tiptap.h2")}>
            H2
          </TBtn>
          <TBtn active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title={t("tiptap.h3")}>
            H3
          </TBtn>
          <TBtn active={editor.isActive("paragraph")} onClick={() => editor.chain().focus().setParagraph().run()} title={t("tiptap.paragraph")}>
            P
          </TBtn>

          <span style={{ width: 1, background: "#555", margin: "2px 4px" }} />

          {/* Alignment */}
          <TBtn active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()} title={t("tiptap.alignLeft")}>
            &#x2190;
          </TBtn>
          <TBtn active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()} title={t("tiptap.alignCenter")}>
            &#x2194;
          </TBtn>
          <TBtn active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()} title={t("tiptap.alignRight")}>
            &#x2192;
          </TBtn>

          <span style={{ width: 1, background: "#555", margin: "2px 4px" }} />

          {/* Lists */}
          <TBtn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title={t("tiptap.bulletList")}>
            &#x2022; List
          </TBtn>
          <TBtn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title={t("tiptap.orderedList")}>
            1. List
          </TBtn>
          <TBtn onClick={() => editor.chain().focus().setBlockquote().run()} active={editor.isActive("blockquote")} title={t("tiptap.blockquote")}>
            &ldquo;&rdquo;
          </TBtn>

          <span style={{ width: 1, background: "#555", margin: "2px 4px" }} />

          {/* Link & Image */}
          <TBtn active={editor.isActive("link")} onClick={setLink} title={t("tiptap.link")}>
            &#x1F517;
          </TBtn>
          <TBtn onClick={addImage} title={t("tiptap.image")}>
            &#x1F5BC;
          </TBtn>

          <span style={{ width: 1, background: "#555", margin: "2px 4px" }} />

          {/* Colors */}
          <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
            {["#ffffff", "#ff4444", "#ff8800", "#ffcc00", "#44cc44", "#4488ff", "#cc44ff", "#888888"].map(
              (c) => (
                <button
                  key={c}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setColor(c)}
                  title={c}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 3,
                    background: c,
                    border: "1px solid #666",
                    cursor: "pointer",
                    padding: 0,
                  }}
                />
              )
            )}
          </div>

          <span style={{ width: 1, background: "#555", margin: "2px 4px" }} />

          {/* Undo/Redo */}
          <TBtn onClick={() => editor.chain().focus().undo().run()} title={t("tiptap.undo")}>
            &#x21A9;
          </TBtn>
          <TBtn onClick={() => editor.chain().focus().redo().run()} title={t("tiptap.redo")}>
            &#x21AA;
          </TBtn>

          <span style={{ width: 1, background: "#555", margin: "2px 4px" }} />

          {/* Clear formatting */}
          <TBtn onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} title={t("tiptap.clearFormat")}>
            &#x2718;
          </TBtn>
          <TBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title={t("tiptap.hr")}>
            &#x2015;
          </TBtn>
        </div>

        {/* Editor content */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            background: "#1e1e1e",
            borderRadius: "0 0 12px 12px",
          }}
          className="tiptap-editor-area"
        >
          <EditorContent editor={editor} />
        </div>

        {/* Footer with Save/Cancel */}
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
          <button
            onClick={onClose}
            style={{
              padding: "10px 24px",
              background: "#555",
              color: "#ccc",
              border: "none",
              borderRadius: 6,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {t("tiptap.cancel")}
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: "10px 28px",
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t("tiptap.apply")}
          </button>
        </div>
      </div>

      {/* TipTap default styles */}
      <style>{`
        .tiptap-editor-area .tiptap {
          min-height: 300px;
        }
        .tiptap-editor-area .tiptap p {
          margin: 0.5em 0;
        }
        .tiptap-editor-area .tiptap h1,
        .tiptap-editor-area .tiptap h2,
        .tiptap-editor-area .tiptap h3,
        .tiptap-editor-area .tiptap h4 {
          margin: 0.8em 0 0.4em;
          font-weight: 700;
        }
        .tiptap-editor-area .tiptap h1 { font-size: 2em; }
        .tiptap-editor-area .tiptap h2 { font-size: 1.5em; }
        .tiptap-editor-area .tiptap h3 { font-size: 1.17em; }
        .tiptap-editor-area .tiptap ul,
        .tiptap-editor-area .tiptap ol {
          padding-left: 1.5em;
          margin: 0.5em 0;
        }
        .tiptap-editor-area .tiptap blockquote {
          border-left: 3px solid #555;
          padding-left: 1em;
          margin: 0.5em 0;
          color: #999;
        }
        .tiptap-editor-area .tiptap a {
          color: #4a90d9;
          text-decoration: underline;
        }
        .tiptap-editor-area .tiptap img {
          max-width: 100%;
          height: auto;
        }
        .tiptap-editor-area .tiptap hr {
          border: none;
          border-top: 1px solid #555;
          margin: 1em 0;
        }
        .tiptap-editor-area .tiptap code {
          background: #333;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 0.9em;
        }
        .tiptap-editor-area .tiptap pre {
          background: #1a1a1a;
          padding: 12px;
          border-radius: 6px;
          overflow-x: auto;
        }
        .tiptap-editor-area .tiptap {
          cursor: text;
          user-select: text;
          -webkit-user-select: text;
        }
      `}</style>
    </div>
  );
}
