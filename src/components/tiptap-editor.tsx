"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Image from "@tiptap/extension-image";
import { useCallback, useEffect } from "react";

interface TiptapEditorProps {
  initialHtml: string;
  onChange?: (html: string) => void;
  minHeight?: number;
}

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
        border: "1px solid #d1d5db",
        borderRadius: 4,
        background: active ? "#2563eb" : "#fff",
        color: active ? "#fff" : "#374151",
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

export default function TiptapEditor({ initialHtml, onChange, minHeight = 300 }: TiptapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        link: { openOnClick: false, HTMLAttributes: { target: "_blank" } },
      }),
      TextStyle,
      Color,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image,
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        style: `min-height:${minHeight}px;max-height:60vh;overflow-y:auto;padding:16px;outline:none;color:#111827;font-size:14px;line-height:1.7;`,
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange?.(ed.getHTML());
    },
  });

  useEffect(() => {
    if (editor && initialHtml !== editor.getHTML()) {
      editor.commands.setContent(initialHtml);
    }
    // only reset when initialHtml identity changes from parent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialHtml]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href;
    const url = prompt("URL:", prev || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  }, [editor]);

  const addImage = useCallback(() => {
    if (!editor) return;
    const url = prompt("이미지 URL:", "https://");
    if (url) editor.chain().focus().setImage({ src: url }).run();
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
    <div style={{ border: "1px solid #d1d5db", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 3, padding: "8px 12px", borderBottom: "1px solid #e5e7eb", background: "#f9fafb" }}>
        <TBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="굵게 (⌘B)">
          <strong>B</strong>
        </TBtn>
        <TBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="기울임 (⌘I)">
          <em>I</em>
        </TBtn>
        <TBtn active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} title="밑줄 (⌘U)">
          <u>U</u>
        </TBtn>
        <TBtn active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} title="취소선">
          <s>S</s>
        </TBtn>

        <span style={{ width: 1, background: "#d1d5db", margin: "2px 4px" }} />

        <TBtn active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="제목 1">H1</TBtn>
        <TBtn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="제목 2">H2</TBtn>
        <TBtn active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="제목 3">H3</TBtn>
        <TBtn active={editor.isActive("paragraph")} onClick={() => editor.chain().focus().setParagraph().run()} title="본문">P</TBtn>

        <span style={{ width: 1, background: "#d1d5db", margin: "2px 4px" }} />

        <TBtn active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()} title="왼쪽 정렬">&#x2190;</TBtn>
        <TBtn active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()} title="가운데 정렬">&#x2194;</TBtn>
        <TBtn active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()} title="오른쪽 정렬">&#x2192;</TBtn>

        <span style={{ width: 1, background: "#d1d5db", margin: "2px 4px" }} />

        <TBtn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="글머리 기호">&#x2022; List</TBtn>
        <TBtn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="번호 매기기">1. List</TBtn>
        <TBtn onClick={() => editor.chain().focus().setBlockquote().run()} active={editor.isActive("blockquote")} title="인용구">&ldquo;&rdquo;</TBtn>

        <span style={{ width: 1, background: "#d1d5db", margin: "2px 4px" }} />

        <TBtn active={editor.isActive("link")} onClick={setLink} title="링크">&#x1F517;</TBtn>
        <TBtn onClick={addImage} title="이미지 삽입">&#x1F5BC;</TBtn>

        <span style={{ width: 1, background: "#d1d5db", margin: "2px 4px" }} />

        <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
          {["#000000", "#ff4444", "#ff8800", "#ffcc00", "#44cc44", "#4488ff", "#cc44ff", "#888888"].map((c) => (
            <button
              key={c}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setColor(c)}
              title={c}
              style={{ width: 18, height: 18, borderRadius: 3, background: c, border: "1px solid #d1d5db", cursor: "pointer", padding: 0 }}
            />
          ))}
        </div>

        <span style={{ width: 1, background: "#d1d5db", margin: "2px 4px" }} />

        <TBtn onClick={() => editor.chain().focus().undo().run()} title="실행 취소 (⌘Z)">&#x21A9;</TBtn>
        <TBtn onClick={() => editor.chain().focus().redo().run()} title="다시 실행 (⌘⇧Z)">&#x21AA;</TBtn>

        <span style={{ width: 1, background: "#d1d5db", margin: "2px 4px" }} />

        <TBtn onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} title="서식 지우기">&#x2718;</TBtn>
        <TBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="구분선">&#x2015;</TBtn>
      </div>

      {/* Editor content */}
      <div className="board-tiptap-area">
        <EditorContent editor={editor} />
      </div>

      <style>{`
        .board-tiptap-area .tiptap { min-height: ${minHeight}px; }
        .board-tiptap-area .tiptap p { margin: 0.5em 0; }
        .board-tiptap-area .tiptap h1,
        .board-tiptap-area .tiptap h2,
        .board-tiptap-area .tiptap h3,
        .board-tiptap-area .tiptap h4 { margin: 0.8em 0 0.4em; font-weight: 700; }
        .board-tiptap-area .tiptap h1 { font-size: 2em; }
        .board-tiptap-area .tiptap h2 { font-size: 1.5em; }
        .board-tiptap-area .tiptap h3 { font-size: 1.17em; }
        .board-tiptap-area .tiptap ul,
        .board-tiptap-area .tiptap ol { padding-left: 1.5em; margin: 0.5em 0; }
        .board-tiptap-area .tiptap ul { list-style-type: disc; }
        .board-tiptap-area .tiptap ol { list-style-type: decimal; }
        .board-tiptap-area .tiptap blockquote { border-left: 3px solid #d1d5db; padding-left: 1em; margin: 0.5em 0; color: #6b7280; }
        .board-tiptap-area .tiptap a { color: #2563eb; text-decoration: underline; }
        .board-tiptap-area .tiptap img { max-width: 100%; height: auto; }
        .board-tiptap-area .tiptap hr { border: none; border-top: 1px solid #e5e7eb; margin: 1em 0; }
        .board-tiptap-area .tiptap code { background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
        .board-tiptap-area .tiptap pre { background: #f9fafb; padding: 12px; border-radius: 6px; overflow-x: auto; }
      `}</style>
    </div>
  );
}
