/**
 * LeftPalette — Figma-inspired component palette pinned on the left side
 * of the editor. Implements the "Insert" tab from the Claude Design
 * "Editor Canvas.html" prototype.
 *
 * Four tabs:
 *   추가   — basic elements (text/button/image/shape) + section blocks
 *   에셋   — (placeholder) image uploads and brand assets
 *   페이지 — (placeholder) page list + add page
 *   테마   — (placeholder) color / font tokens
 *
 * Click a card → call onInsert(type). The parent (design-editor.tsx) wires
 * this to the existing `addElement()` function so the new palette reuses all
 * current object-creation logic (positioning, class markers, DOM insert).
 *
 * Click-to-insert is the MVP behavior; full drag-to-insert with a ghost
 * element is listed in the follow-up work. We still set draggable="true"
 * on each card so users get the OS-level grab affordance.
 */

"use client";

import { useState, useMemo } from "react";
import { SECTION_PRESETS } from "./section-library";

type InsertType =
  | "text"
  | "image"
  | "box"
  | "board"
  | "product"
  | "exhibition"
  | "login"
  | "mail";

const BASIC_ELEMENTS: Array<{ id: InsertType; label: string; icon: string; swatch: string }> = [
  { id: "text",  label: "텍스트", icon: "fa-font",        swatch: "text" },
  { id: "box",   label: "버튼",   icon: "fa-hand-pointer", swatch: "button" },
  { id: "image", label: "이미지", icon: "fa-image",       swatch: "image" },
  { id: "box",   label: "도형",   icon: "fa-shapes",      swatch: "shape" },
];

const MY_COMPONENTS = [
  { label: "사이트 헤더 v2",   icon: "fa-heading" },
  { label: "예약 버튼 (주황)",  icon: "fa-square-check" },
  { label: "문의 카드",         icon: "fa-id-card" },
];

interface Props {
  onInsert(type: InsertType): void;
  /** Insert a pre-built section preset (by preset.id). Wired to
   *  design-editor.tsx's insertSectionPresetHtml helper, which appends the
   *  full multi-element HTML into #hns_body + refreshes the scene store. */
  onInsertSection(presetId: string): void;
}

export default function LeftPalette({ onInsert, onInsertSection }: Props) {
  const [tab, setTab] = useState<"insert" | "assets" | "pages" | "theme">("insert");
  const [query, setQuery] = useState("");

  const filteredSections = useMemo(() => {
    if (!query.trim()) return SECTION_PRESETS;
    const q = query.toLowerCase();
    return SECTION_PRESETS.filter((b) => b.label.toLowerCase().includes(q));
  }, [query]);

  const filteredBasics = useMemo(() => {
    if (!query.trim()) return BASIC_ELEMENTS;
    const q = query.toLowerCase();
    return BASIC_ELEMENTS.filter((b) => b.label.toLowerCase().includes(q));
  }, [query]);

  return (
    <aside className="leftpalette-rail" aria-label="컴포넌트 팔레트">
      {/* Tabs */}
      <div className="lp-tabs" role="tablist">
        {([
          ["insert", "추가"],
          ["assets", "에셋"],
          ["pages",  "페이지"],
          ["theme",  "테마"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`lp-tab${tab === id ? " active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "insert" && (
        <>
          <div className="lp-search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden />
            <input
              type="text"
              placeholder="컴포넌트, 블록 검색…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="lp-kbd">/</span>
          </div>

          <div className="lp-scroll">
            {filteredBasics.length > 0 && (
              <section className="lp-section">
                <h4>
                  기본 요소
                  <i className="fa-solid fa-chevron-down lp-chev" aria-hidden />
                </h4>
                <div className="lp-block-grid">
                  {filteredBasics.map((b, i) => (
                    <button
                      key={`${b.id}-${i}`}
                      type="button"
                      className="lp-block"
                      title={b.label}
                      draggable
                      onClick={() => onInsert(b.id)}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/x-homenshop-insert", b.id);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                    >
                      <div className={`lp-thumb swatch-${b.swatch}`}>
                        <i className={`fa-solid ${b.icon}`} aria-hidden />
                      </div>
                      <div className="lp-label">{b.label}</div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {filteredSections.length > 0 && (
              <section className="lp-section">
                <h4>
                  섹션 블록
                  <i className="fa-solid fa-chevron-down lp-chev" aria-hidden />
                </h4>
                <div className="lp-row-list">
                  {filteredSections.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="lp-row"
                      draggable
                      onClick={() => onInsertSection(s.id)}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/x-homenshop-section", s.id);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      title={s.label}
                    >
                      <span className="lp-row-icon">
                        <i className={`fa-solid ${s.icon}`} aria-hidden />
                      </span>
                      <span className="lp-row-label">{s.label}</span>
                      <i
                        className="fa-solid fa-plus"
                        style={{ color: "var(--fig-text-3)", fontSize: 10 }}
                        aria-hidden
                      />
                    </button>
                  ))}
                </div>
              </section>
            )}

            {!query.trim() && (
              <section className="lp-section">
                <h4>
                  내 컴포넌트
                  <i className="fa-solid fa-plus lp-chev" aria-hidden />
                </h4>
                <div className="lp-row-list">
                  {MY_COMPONENTS.map((c, i) => (
                    <div key={i} className="lp-row lp-row-mine">
                      <span className="lp-row-icon lp-accent">
                        <i className={`fa-solid ${c.icon}`} aria-hidden />
                      </span>
                      <span className="lp-row-label">{c.label}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </>
      )}

      {tab !== "insert" && (
        <div className="lp-empty">
          <i className="fa-solid fa-sparkles lp-empty-icon" aria-hidden />
          <div className="lp-empty-title">
            {tab === "assets" ? "에셋" : tab === "pages" ? "페이지" : "테마"} 탭
          </div>
          <div className="lp-empty-sub">곧 추가됩니다.</div>
        </div>
      )}
    </aside>
  );
}
