/**
 * LeftPalette — Figma-inspired component palette pinned on the left side
 * of the editor. Implements the "Insert" tab from the Claude Design
 * "Editor Canvas.html" prototype.
 *
 * Four tabs (2026-04-22 consolidation — replaces old 5-button top toolbar):
 *   추가   — basic elements (text/image/box/…) + section presets
 *   에셋   — image uploads and brand assets (placeholder)
 *   테마   — site-wide color / font tokens (injects :root CSS vars)
 *   AI     — AI edit prompt + credit balance chip (moved from App bar)
 *
 * Drag-to-insert + click-to-insert are both supported. The parent
 * (design-editor.tsx) wires `onInsert`/`onInsertSection` to existing
 * addElement / insertSectionPreset helpers.
 */

"use client";

import { useState, useMemo, useEffect, useRef } from "react";
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
  { id: "text",  label: "텍스트", icon: "fa-font",         swatch: "text" },
  { id: "box",   label: "버튼",   icon: "fa-hand-pointer", swatch: "button" },
  { id: "image", label: "이미지", icon: "fa-image",        swatch: "image" },
  { id: "box",   label: "도형",   icon: "fa-shapes",       swatch: "shape" },
];

const MY_COMPONENTS = [
  { label: "사이트 헤더 v2",   icon: "fa-heading" },
  { label: "예약 버튼 (주황)",  icon: "fa-square-check" },
  { label: "문의 카드",         icon: "fa-id-card" },
];

/** Curated palette presets for the 테마 tab. Applied as `--brand-*`
 *  custom properties injected into a `:root{}` rule, so any CSS that
 *  references `var(--brand-color)` picks up the change. Non-themed
 *  markup is unaffected. */
const THEME_PRESETS: Array<{ id: string; label: string; brand: string; accent: string }> = [
  { id: "mint",    label: "민트",   brand: "#3ccf97", accent: "#5be5b3" },
  { id: "ocean",   label: "오션",   brand: "#2563eb", accent: "#4a90d9" },
  { id: "sunset",  label: "선셋",   brand: "#e89a78", accent: "#f4b66a" },
  { id: "berry",   label: "베리",   brand: "#b6267e", accent: "#ff8bb1" },
  { id: "forest",  label: "포레스트", brand: "#1f6f5c", accent: "#3ccf97" },
  { id: "graphite",label: "그래파이트", brand: "#111827", accent: "#6b7280" },
];

const THEME_FONTS: Array<{ id: string; label: string; stack: string }> = [
  { id: "pretendard",  label: "Pretendard",  stack: "'Pretendard Variable', Pretendard, system-ui, sans-serif" },
  { id: "inter",       label: "Inter",       stack: "Inter, system-ui, sans-serif" },
  { id: "noto",        label: "Noto Sans KR",stack: "'Noto Sans KR', system-ui, sans-serif" },
  { id: "serif",       label: "Serif",       stack: "'Noto Serif KR', Georgia, serif" },
  { id: "mono",        label: "Mono",        stack: "'JetBrains Mono', ui-monospace, monospace" },
];

interface Props {
  onInsert(type: InsertType): void;
  /** Insert a pre-built section preset (by preset.id). Wired to
   *  design-editor.tsx's insertSectionPresetHtml helper. */
  onInsertSection(presetId: string): void;

  /* ─── 테마 tab — site-wide theme tokens ──────────────────────────── */
  /** Apply brand/accent color + font stack to the site's CSS. Callee
   *  injects/updates a `:root{...}` rule into Site.cssText. */
  onApplyTheme?(tokens: { brand: string; accent: string; fontStack?: string }): void;
  currentThemeId?: string | null;
  currentFontId?: string | null;

  /* ─── AI tab — page-level AI edit ────────────────────────────────── */
  aiPrompt: string;
  setAiPrompt(value: string): void;
  aiLoading: boolean;
  aiStatus: "" | "success" | "error";
  aiError: string;
  canUndoAi: boolean;
  creditBalance: number | null;
  creditCost: number;
  onRunAi(): void;
  onUndoAi(): void;
}

export default function LeftPalette({
  onInsert,
  onInsertSection,
  onApplyTheme,
  currentThemeId,
  currentFontId,
  aiPrompt,
  setAiPrompt,
  aiLoading,
  aiStatus,
  aiError,
  canUndoAi,
  creditBalance,
  creditCost,
  onRunAi,
  onUndoAi,
}: Props) {
  const [tab, setTab] = useState<"insert" | "assets" | "theme" | "ai">("insert");
  const [query, setQuery] = useState("");
  const aiRef = useRef<HTMLTextAreaElement>(null);

  // Focus the AI textarea whenever the tab becomes active.
  useEffect(() => {
    if (tab === "ai" && aiRef.current) aiRef.current.focus();
  }, [tab]);

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
          ["theme",  "테마"],
          ["ai",     "AI"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`lp-tab${tab === id ? " active" : ""}${id === "ai" ? " lp-tab-ai" : ""}`}
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

      {tab === "assets" && (
        <div className="lp-empty">
          <i className="fa-solid fa-images lp-empty-icon" aria-hidden />
          <div className="lp-empty-title">에셋</div>
          <div className="lp-empty-sub">이미지·브랜드 에셋 업로드가 곧 추가됩니다.</div>
        </div>
      )}

      {tab === "theme" && (
        <div className="lp-scroll">
          <section className="lp-section">
            <h4>
              색상 팔레트
              <i className="fa-solid fa-palette lp-chev" aria-hidden />
            </h4>
            <div className="lp-theme-grid">
              {THEME_PRESETS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`lp-theme-swatch${currentThemeId === t.id ? " active" : ""}`}
                  onClick={() =>
                    onApplyTheme?.({ brand: t.brand, accent: t.accent })
                  }
                  title={t.label}
                >
                  <span className="lp-theme-bar" style={{ background: t.brand }} />
                  <span className="lp-theme-bar" style={{ background: t.accent }} />
                  <span className="lp-theme-label">{t.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="lp-section">
            <h4>
              타이포그래피
              <i className="fa-solid fa-font lp-chev" aria-hidden />
            </h4>
            <div className="lp-row-list">
              {THEME_FONTS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`lp-row${currentFontId === f.id ? " active" : ""}`}
                  onClick={() => {
                    // Preserve current color selection; only change font.
                    const preset = THEME_PRESETS.find((p) => p.id === currentThemeId) ?? THEME_PRESETS[0]!;
                    onApplyTheme?.({ brand: preset.brand, accent: preset.accent, fontStack: f.stack });
                  }}
                  style={{ fontFamily: f.stack }}
                >
                  <span className="lp-row-icon"><i className="fa-solid fa-font" aria-hidden /></span>
                  <span className="lp-row-label">{f.label}</span>
                  {currentFontId === f.id && (
                    <i className="fa-solid fa-check" style={{ color: "var(--fig-accent)", fontSize: 10 }} aria-hidden />
                  )}
                </button>
              ))}
            </div>
          </section>

          <div className="lp-empty-sub" style={{ padding: "0 14px 14px" }}>
            테마를 적용하면 사이트 CSS의 <code>:root</code>에 <code>--brand-color</code>·<code>--brand-accent</code>·<code>--brand-font</code> 변수가 주입됩니다.
          </div>
        </div>
      )}

      {tab === "ai" && (
        <div className="lp-ai">
          {creditBalance !== null && (
            <a
              href="/dashboard/credits"
              className={`lp-ai-credits${creditBalance < creditCost ? " low" : ""}`}
              title={`AI 편집 1회 = ${creditCost} C`}
            >
              <span aria-hidden>✨</span>
              <span>{creditBalance.toLocaleString()} C</span>
            </a>
          )}
          <textarea
            ref={aiRef}
            className="lp-ai-textarea"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder={'예: 배경색을 검정색으로 변경해줘\n배너 텍스트를 "봄 세일 50%"로 바꿔줘'}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                onRunAi();
              }
            }}
            disabled={aiLoading}
            rows={5}
          />
          <button
            type="button"
            className="lp-ai-run"
            onClick={onRunAi}
            disabled={aiLoading || !aiPrompt.trim()}
          >
            {aiLoading ? "처리 중…" : `실행 (⌘↵) · ${creditCost}C`}
          </button>
          {canUndoAi && aiStatus === "success" && (
            <button
              type="button"
              className="lp-ai-undo"
              onClick={onUndoAi}
            >
              이전 상태로 되돌리기
            </button>
          )}
          {aiStatus === "success" && (
            <div className="lp-ai-status ok">✓ 적용 완료</div>
          )}
          {aiStatus === "error" && (
            <div className="lp-ai-status err">{aiError}</div>
          )}
          <div className="lp-empty-sub" style={{ padding: 0, marginTop: 8 }}>
            선택된 요소가 있으면 그 요소를 우선 편집합니다. ⌘↵ 로 빠른 실행.
          </div>
        </div>
      )}
    </aside>
  );
}
