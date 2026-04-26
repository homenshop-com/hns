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
import { FONT_CATALOG, FONT_CATEGORIES } from "./font-catalog";
import { THEME_PRESETS, THEME_CATEGORIES, type ThemePreset } from "./theme-presets";
import { useEditorStore, selectRoot } from "../store/editor-store";
import type { Layer } from "@/lib/scene";

type ShapeKind =
  | "shape:rect"
  | "shape:rounded"
  | "shape:circle"
  | "shape:triangle"
  | "shape:diamond"
  | "shape:star"
  | "shape:arrow"
  | "shape:line";

type InsertType =
  | "text"
  | "image"
  | "box"
  | ShapeKind
  | "board"
  | "product"
  | "exhibition"
  | "login"
  | "mail";

// Top-level basic elements. "도형" is a meta-button that opens a popover
// (handled in render below); the entry here is a sentinel — clicking it
// won't fire onInsert directly, the popover does that.
const BASIC_ELEMENTS: Array<{ id: InsertType | "shape:_picker"; label: string; icon: string; swatch: string }> = [
  { id: "text",            label: "텍스트", icon: "fa-font",         swatch: "text" },
  { id: "box",             label: "버튼",   icon: "fa-hand-pointer", swatch: "button" },
  { id: "image",           label: "이미지", icon: "fa-image",        swatch: "image" },
  { id: "shape:_picker",   label: "도형",   icon: "fa-shapes",       swatch: "shape" },
];

// Shape choices shown in the picker popover. `kind` becomes `shape:<name>`
// in the InsertType, and addElement (design-editor) maps each to a
// concrete CSS / clip-path style.
const SHAPE_OPTIONS: Array<{ kind: ShapeKind; label: string; preview: React.CSSProperties }> = [
  { kind: "shape:rect",     label: "사각형",   preview: { background: "#2a79ff" } },
  { kind: "shape:rounded",  label: "둥근사각", preview: { background: "#2a79ff", borderRadius: 8 } },
  { kind: "shape:circle",   label: "원",       preview: { background: "#2a79ff", borderRadius: "50%" } },
  { kind: "shape:triangle", label: "삼각형",   preview: { background: "#2a79ff", clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)" } },
  { kind: "shape:diamond",  label: "다이아몬드", preview: { background: "#2a79ff", clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" } },
  { kind: "shape:star",     label: "별",       preview: { background: "#2a79ff", clipPath: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)" } },
  { kind: "shape:arrow",    label: "화살표",   preview: { background: "#2a79ff", clipPath: "polygon(0% 35%, 65% 35%, 65% 15%, 100% 50%, 65% 85%, 65% 65%, 0% 65%)" } },
  { kind: "shape:line",     label: "선",       preview: { background: "#2a79ff", height: 3, alignSelf: "center" } },
];

const MY_COMPONENTS = [
  { label: "사이트 헤더 v2",   icon: "fa-heading" },
  { label: "예약 버튼 (주황)",  icon: "fa-square-check" },
  { label: "문의 카드",         icon: "fa-id-card" },
];

/** Theme presets and font catalog live in shared modules so the
 *  inspector and design-editor reuse the same source of truth. */


interface Props {
  onInsert(type: InsertType): void;
  /** Insert a pre-built section preset (by preset.id). Wired to
   *  design-editor.tsx's insertSectionPresetHtml helper. */
  onInsertSection(presetId: string): void;
  /** Insert an existing image asset (URL) into the canvas. Wired in
   *  design-editor.tsx so it routes to flow / absolute insert depending
   *  on the template's responsive flag. */
  onInsertAsset?(url: string): void;
  /** Open the dedicated header edit modal — wired from the 섹션 tab's
   *  "헤더" pinned row so users can find one-stop header editing. */
  onOpenHeaderEdit?(): void;
  /** Open the dedicated footer edit modal — same pattern as header. */
  onOpenFooterEdit?(): void;
  /** Owner site id — used by the 에셋 tab to fetch /api/uploads/list
   *  scoped to this site. */
  siteId?: string;

  /* ─── 테마 tab — site-wide theme tokens ──────────────────────────── */
  /** Apply brand/accent color + font stack to the site's CSS. Callee
   *  injects/updates a `:root{...}` rule into Site.cssText. */
  onApplyTheme?(tokens: {
    brand: string;
    accent: string;
    surface?: string;
    text?: string;
    fontStack?: string;
  }): void;
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
  onInsertAsset,
  onOpenHeaderEdit,
  onOpenFooterEdit,
  siteId,
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
  const [tab, setTab] = useState<"insert" | "sections" | "assets" | "theme" | "ai">("insert");
  const [query, setQuery] = useState("");
  const [shapePopoverOpen, setShapePopoverOpen] = useState(false);
  const aiRef = useRef<HTMLTextAreaElement>(null);

  // Close shape popover when switching tab or typing in search.
  useEffect(() => {
    if (tab !== "insert" || query) setShapePopoverOpen(false);
  }, [tab, query]);

  /* ─── 테마 tab — local working copy of the 4 color tokens ────────
   * Initialised from the active preset (if any) and kept in sync when
   * the user picks a different preset. Each color picker updates this
   * state and immediately calls onApplyTheme so the canvas reflects
   * changes live without an explicit "apply" press. */
  const initialPreset = THEME_PRESETS.find((p) => p.id === currentThemeId) ?? THEME_PRESETS[0]!;
  const [themeColors, setThemeColors] = useState({
    brand: initialPreset.brand,
    accent: initialPreset.accent,
    surface: initialPreset.surface,
    text: initialPreset.text,
  });
  // When design-editor reports a new active preset (e.g. on page load or
  // after applying a swatch), pull its colors into our local state so
  // the custom inputs reflect the canvas truth.
  useEffect(() => {
    if (!currentThemeId) return;
    const p = THEME_PRESETS.find((pp) => pp.id === currentThemeId);
    if (!p) return;
    setThemeColors({ brand: p.brand, accent: p.accent, surface: p.surface, text: p.text });
  }, [currentThemeId]);

  /** Apply a tokens patch + always include the currently-selected font
   *  so picking a new color doesn't drop --brand-font from the managed
   *  CSS block (rebuilt from scratch every call). */
  const applyThemePatch = (patch: Partial<typeof themeColors>) => {
    const next = { ...themeColors, ...patch };
    setThemeColors(next);
    const font = FONT_CATALOG.find((f) => f.id === currentFontId);
    onApplyTheme?.({
      ...next,
      ...(font && { fontStack: font.stack }),
    });
  };

  const activeFontStack =
    FONT_CATALOG.find((f) => f.id === currentFontId)?.stack ??
    "'Pretendard Variable', Pretendard, system-ui, sans-serif";

  /* ─── 에셋 tab — recent uploads list ─────────────────────────────── */
  type AssetItem = { url: string; name: string; mtime: number; size: number };
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsErr, setAssetsErr] = useState<string | null>(null);
  const [assetUploadBusy, setAssetUploadBusy] = useState(false);
  const assetFileRef = useRef<HTMLInputElement>(null);

  // Load (and refresh on tab open) the site's recent uploads.
  useEffect(() => {
    if (tab !== "assets" || !siteId) return;
    let cancelled = false;
    (async () => {
      setAssetsLoading(true);
      setAssetsErr(null);
      try {
        const res = await fetch(`/api/uploads/list?siteId=${encodeURIComponent(siteId)}&limit=60`);
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error || `목록 불러오기 실패 (${res.status})`);
        }
        const j = (await res.json()) as { items?: AssetItem[] };
        if (!cancelled) setAssets(j.items ?? []);
      } catch (e) {
        if (!cancelled) setAssetsErr(e instanceof Error ? e.message : "오류");
      } finally {
        if (!cancelled) setAssetsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, siteId]);

  const uploadAsset = async (file: File) => {
    if (!siteId) return;
    setAssetUploadBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "site-uploads");
      fd.append("compress", "true");
      fd.append("siteId", siteId);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `업로드 실패 (${res.status})`);
      }
      const j = (await res.json()) as { url?: string };
      if (j.url) {
        // Prepend the new asset so it shows up at the top without
        // re-fetching the whole list.
        setAssets((prev) => [
          { url: j.url!, name: j.url!.split("/").pop() ?? "", mtime: Date.now(), size: file.size },
          ...prev,
        ]);
      }
    } catch (e) {
      setAssetsErr(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setAssetUploadBusy(false);
    }
  };

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
          ["insert",   "추가"],
          ["sections", "섹션"],
          ["assets",   "에셋"],
          ["theme",    "테마"],
          ["ai",       "AI"],
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
                  {filteredBasics.map((b, i) => {
                    // The "도형" entry is a popover trigger, not a direct
                    // insert. All other entries call onInsert immediately.
                    const isShapePicker = b.id === "shape:_picker";
                    return (
                      <button
                        key={`${b.id}-${i}`}
                        type="button"
                        className={`lp-block${isShapePicker && shapePopoverOpen ? " active" : ""}`}
                        title={b.label}
                        draggable={!isShapePicker}
                        onClick={() => {
                          if (isShapePicker) {
                            setShapePopoverOpen((v) => !v);
                          } else {
                            onInsert(b.id as InsertType);
                          }
                        }}
                        onDragStart={(e) => {
                          if (isShapePicker) {
                            e.preventDefault();
                            return;
                          }
                          e.dataTransfer.setData("text/x-homenshop-insert", b.id);
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                      >
                        <div className={`lp-thumb swatch-${b.swatch}`}>
                          <i className={`fa-solid ${b.icon}`} aria-hidden />
                        </div>
                        <div className="lp-label">{b.label}</div>
                      </button>
                    );
                  })}
                </div>
                {/* Shape picker popover — Figma-style 4-col grid of common
                    shape variants. Click → onInsert("shape:<name>") →
                    design-editor maps to clip-path / border-radius styles
                    on a fresh .dragable. Click outside (handled by the
                    backdrop layer) closes without inserting. */}
                {shapePopoverOpen && (
                  <>
                    <div
                      onClick={() => setShapePopoverOpen(false)}
                      style={{
                        position: "fixed",
                        inset: 0,
                        zIndex: 9000,
                        cursor: "default",
                      }}
                    />
                    <div
                      style={{
                        position: "relative",
                        zIndex: 9001,
                        margin: "6px 10px 12px",
                        padding: 10,
                        background: "#16181f",
                        border: "1px solid #2a2d3a",
                        borderRadius: 8,
                        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          color: "#888",
                          marginBottom: 8,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        도형 선택
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(4, 1fr)",
                          gap: 6,
                        }}
                      >
                        {SHAPE_OPTIONS.map((s) => (
                          <button
                            key={s.kind}
                            type="button"
                            title={s.label}
                            draggable
                            onClick={() => {
                              onInsert(s.kind);
                              setShapePopoverOpen(false);
                            }}
                            onDragStart={(e) => {
                              e.dataTransfer.setData(
                                "text/x-homenshop-insert",
                                s.kind,
                              );
                              e.dataTransfer.effectAllowed = "copy";
                            }}
                            style={{
                              padding: 8,
                              background: "#1a1c24",
                              border: "1px solid #2a2d3a",
                              borderRadius: 6,
                              cursor: "pointer",
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                ...s.preview,
                              }}
                            />
                            <div style={{ fontSize: 10, color: "#c6c9d6" }}>
                              {s.label}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
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

      {tab === "sections" && (
        <SectionsTab
          onAddSectionClick={() => setTab("insert")}
          onOpenHeaderEdit={onOpenHeaderEdit}
          onOpenFooterEdit={onOpenFooterEdit}
        />
      )}

      {tab === "assets" && (
        <div className="lp-scroll">
          {/* Upload bar — drop a new file directly into the site's bucket.
              Pre-pends the result to the grid so the user sees instant
              feedback without a full refetch. */}
          <section className="lp-section">
            <h4>
              에셋 라이브러리
              <i className="fa-solid fa-images lp-chev" aria-hidden />
            </h4>
            <div style={{ padding: "0 10px 8px", display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={() => assetFileRef.current?.click()}
                disabled={!siteId || assetUploadBusy}
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  background: "var(--fig-accent, #2a79ff)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  cursor: assetUploadBusy ? "wait" : "pointer",
                  fontSize: 12,
                  opacity: assetUploadBusy ? 0.6 : 1,
                }}
              >
                <i className="fa-solid fa-upload" style={{ marginRight: 6 }} />
                {assetUploadBusy ? "업로드 중…" : "파일 업로드"}
              </button>
              <input
                ref={assetFileRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadAsset(f);
                  e.target.value = "";
                }}
              />
            </div>
            {assetsErr && (
              <div style={{ padding: "0 14px 10px", color: "#ff6b6b", fontSize: 11 }}>
                {assetsErr}
              </div>
            )}
            {!siteId && (
              <div className="lp-empty-sub" style={{ padding: "0 14px 14px" }}>
                사이트 컨텍스트가 없어 에셋을 표시할 수 없습니다.
              </div>
            )}
            {siteId && assetsLoading && assets.length === 0 && (
              <div className="lp-empty-sub" style={{ padding: "0 14px 14px" }}>
                불러오는 중…
              </div>
            )}
            {siteId && !assetsLoading && assets.length === 0 && !assetsErr && (
              <div className="lp-empty-sub" style={{ padding: "0 14px 14px" }}>
                아직 업로드한 이미지가 없습니다.
              </div>
            )}
            {/* Grid — 3 cols, square thumbs, click → insert into canvas
                via onInsertAsset (design-editor decides flow vs absolute
                based on the template's responsive flag). */}
            {assets.length > 0 && (
              <div
                style={{
                  padding: "0 10px 12px",
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 6,
                }}
              >
                {assets.map((a) => (
                  <button
                    key={a.url}
                    type="button"
                    title={a.name}
                    onClick={() => onInsertAsset?.(a.url)}
                    draggable
                    onDragStart={(e) => {
                      // Reuse the same dataTransfer key used by the 추가
                      // panel's drag-to-canvas flow. Payload is "asset:<url>"
                      // so the canvas drop handler can distinguish from
                      // basic-element inserts.
                      e.dataTransfer.setData(
                        "text/x-homenshop-insert",
                        `asset:${a.url}`,
                      );
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    style={{
                      aspectRatio: "1 / 1",
                      padding: 0,
                      border: "1px solid var(--fig-line, #2a2d3a)",
                      borderRadius: 4,
                      background: "#1a1c24",
                      cursor: "pointer",
                      overflow: "hidden",
                      position: "relative",
                    }}
                  >
                    <img
                      src={a.url}
                      alt={a.name}
                      loading="lazy"
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "theme" && (
        <div className="lp-scroll lp-theme-tab">
          {/* ─── Live preview ─────────────────────────────────────── */}
          <section className="lp-section">
            <h4>
              미리보기
              <i className="fa-solid fa-eye lp-chev" aria-hidden />
            </h4>
            <div
              className="lp-theme-preview"
              style={{
                background: themeColors.surface,
                color: themeColors.text,
                fontFamily: activeFontStack,
              }}
            >
              <div className="lp-theme-preview-eyebrow" style={{ color: themeColors.accent }}>
                NEW · COLLECTION
              </div>
              <div className="lp-theme-preview-title" style={{ color: themeColors.brand }}>
                헤드라인 텍스트
              </div>
              <div className="lp-theme-preview-body">
                본문 텍스트는 이런 색으로 보여집니다.
              </div>
              <div className="lp-theme-preview-buttons">
                <span
                  className="lp-theme-preview-btn primary"
                  style={{ background: themeColors.brand, color: "#fff" }}
                >
                  주요 버튼
                </span>
                <span
                  className="lp-theme-preview-btn outline"
                  style={{ borderColor: themeColors.accent, color: themeColors.brand }}
                >
                  보조 버튼
                </span>
              </div>
            </div>
          </section>

          {/* ─── Preset cards by category ─────────────────────────── */}
          <section className="lp-section">
            <h4>
              테마 프리셋
              <i className="fa-solid fa-palette lp-chev" aria-hidden />
            </h4>
            {THEME_CATEGORIES.map((cat) => {
              const presets = THEME_PRESETS.filter((p: ThemePreset) => p.category === cat.key);
              if (presets.length === 0) return null;
              return (
                <div key={cat.key} className="lp-theme-category">
                  <div className="lp-theme-category-label">{cat.label}</div>
                  <div className="lp-theme-card-grid">
                    {presets.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={`lp-theme-card${currentThemeId === p.id ? " active" : ""}`}
                        onClick={() =>
                          applyThemePatch({
                            brand: p.brand,
                            accent: p.accent,
                            surface: p.surface,
                            text: p.text,
                          })
                        }
                        title={`${p.label} · ${p.mood}`}
                      >
                        <div className="lp-theme-card-swatch">
                          <span style={{ background: p.brand }} />
                          <span style={{ background: p.accent }} />
                          <span style={{ background: p.surface, border: "1px solid rgba(0,0,0,0.06)" }} />
                          <span style={{ background: p.text }} />
                        </div>
                        <div className="lp-theme-card-meta">
                          <div className="lp-theme-card-label">{p.label}</div>
                          <div className="lp-theme-card-mood">{p.mood}</div>
                        </div>
                        {currentThemeId === p.id && (
                          <div className="lp-theme-card-check" aria-hidden>
                            <i className="fa-solid fa-check" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>

          {/* ─── Custom 4-token color picker ──────────────────────── */}
          <section className="lp-section">
            <h4>
              커스텀 컬러
              <i className="fa-solid fa-eye-dropper lp-chev" aria-hidden />
            </h4>
            <div className="lp-color-list">
              {([
                { key: "brand",   label: "포인트", help: "버튼 / 제목" },
                { key: "accent",  label: "강조",   help: "배지 / 보조" },
                { key: "surface", label: "배경",   help: "페이지 바탕" },
                { key: "text",    label: "본문",   help: "기본 글자색" },
              ] as const).map((row) => (
                <div key={row.key} className="lp-color-row">
                  <input
                    type="color"
                    className="lp-color-swatch"
                    value={themeColors[row.key]}
                    onChange={(e) => applyThemePatch({ [row.key]: e.target.value })}
                    aria-label={row.label}
                  />
                  <div className="lp-color-meta">
                    <div className="lp-color-label">{row.label}</div>
                    <div className="lp-color-help">{row.help}</div>
                  </div>
                  <input
                    type="text"
                    className="lp-color-input"
                    value={themeColors[row.key]}
                    onChange={(e) => setThemeColors((s) => ({ ...s, [row.key]: e.target.value }))}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      // Only commit valid CSS color formats — avoids
                      // applying garbage half-typed input live.
                      if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) || v.startsWith("rgb")) {
                        applyThemePatch({ [row.key]: v });
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* ─── Typography (categorized font picker, unchanged) ──── */}
          <section className="lp-section">
            <h4>
              타이포그래피
              <i className="fa-solid fa-font lp-chev" aria-hidden />
            </h4>
            {FONT_CATEGORIES.map((cat) => {
              const fonts = FONT_CATALOG.filter((f) => f.category === cat.key);
              if (fonts.length === 0) return null;
              return (
                <div key={cat.key} className="lp-font-group">
                  <div className="lp-font-group-label">{cat.label}</div>
                  <div className="lp-row-list">
                    {fonts.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className={`lp-row${currentFontId === f.id ? " active" : ""}`}
                        onClick={() => {
                          // Preserve current color tokens; only change font.
                          onApplyTheme?.({
                            brand: themeColors.brand,
                            accent: themeColors.accent,
                            surface: themeColors.surface,
                            text: themeColors.text,
                            fontStack: f.stack,
                          });
                        }}
                        style={{ fontFamily: f.stack }}
                        title={`${f.label} · ${f.english}`}
                      >
                        <span className="lp-row-icon"><i className="fa-solid fa-font" aria-hidden /></span>
                        <span className="lp-row-label">{f.label}</span>
                        {currentFontId === f.id && (
                          <i className="fa-solid fa-check" style={{ color: "var(--fig-accent)", fontSize: 10 }} aria-hidden />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
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
            disabled={
              aiLoading ||
              !aiPrompt.trim() ||
              (creditBalance !== null && creditBalance < creditCost)
            }
          >
            {aiLoading ? "처리 중…" : `실행 (⌘↵) · ${creditCost}C`}
          </button>
          {/* In-tab insufficient-credits warning. Without this the user
              just sees the run button greyed out with no explanation;
              the modal that handles 402 only fires AFTER trying to run. */}
          {creditBalance !== null && creditBalance < creditCost && (
            <div
              style={{
                marginTop: 8,
                padding: "10px 12px",
                background: "rgba(255, 107, 107, 0.1)",
                border: "1px solid rgba(255, 107, 107, 0.4)",
                borderRadius: 6,
                fontSize: 11,
                color: "#ffb4b4",
                lineHeight: 1.5,
              }}
            >
              크레딧이 부족합니다. 보유 {creditBalance}C, 필요 {creditCost}C.{" "}
              <a
                href="/dashboard/credits"
                style={{ color: "#fff", textDecoration: "underline", fontWeight: 600 }}
              >
                충전하기 →
              </a>
            </div>
          )}
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

/* ─── 섹션 (Sections) tab — PPT-style page list (2026-04-25) ───────────
 *
 * For beginner users who think of sections as "slides" / "pages"
 * stacked vertically. Mirrors the PowerPoint slide-strip mental model:
 *   - Click a section → scroll the canvas to it + select it
 *   - Drag a section row → reorder (moves the section up/down on the page)
 *   - Hover row → quick action buttons (↑ / ↓ / 복제 / 삭제)
 *   - "+ 새 섹션 추가" button → switches to the 추가 tab so the user
 *     can pick a section preset (히어로 / 갤러리 / CTA / etc.)
 *
 * Uses content-preview labels (parse.ts → suggestName) so the user
 * sees "섹션 · We build enterprise" instead of opaque "섹션 25".
 *
 * The advanced layer tree (right-side LayerPanel) stays as the
 * power-user view — this tab is the simplified flat alternative.
 */
function SectionsTab({
  onAddSectionClick,
  onOpenHeaderEdit,
  onOpenFooterEdit,
}: {
  onAddSectionClick: () => void;
  onOpenHeaderEdit?: () => void;
  onOpenFooterEdit?: () => void;
}) {
  // Subscribe to the scene root so the list reflects every reorder /
  // add / delete instantly (same pattern as InspectorPanel).
  const [tick, setTick] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    setSelectedId(useEditorStore.getState().selectedId);
    return useEditorStore.subscribe((s) => {
      setSelectedId((prev) => (prev === s.selectedId ? prev : s.selectedId));
      setTick((t) => t + 1);
    });
  }, []);

  const sections = useMemo(() => {
    const root = selectRoot(useEditorStore.getState());
    return ((root as { children?: Layer[] }).children ?? []).filter(
      // Hide the virtual root's special children types if any. Top-level
      // dragables that the user thinks of as "sections" are typically
      // type=section, but boxes/groups at the top level also count
      // (legacy templates rarely use the typed section role).
      (c) => c.type !== "inline",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  /* ── Drag-and-drop reorder state ── */
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const onRowClick = (id: string) => {
    useEditorStore.getState().select(id);
    // Scroll the canvas to the section. The canvas viewport (#de-canvas-inner)
    // is the closest scrollable ancestor; use the element's scrollIntoView
    // which respects nested scroll containers.
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const moveBy = (id: string, delta: -1 | 1) => {
    const root = selectRoot(useEditorStore.getState());
    const idx = (root as { children?: Layer[] }).children?.findIndex(
      (c) => c.id === id,
    );
    if (idx == null || idx < 0) return;
    const newIdx = idx + delta;
    const total = (root as { children?: Layer[] }).children?.length ?? 0;
    if (newIdx < 0 || newIdx >= total) return;
    // moveLayer uses the post-removal index, so moving down by 1 means
    // target index = idx + 1 (after the dragged element is removed,
    // sliding everything up; +1 puts it after its previous neighbor).
    const targetIdx = delta === 1 ? idx + 1 : idx - 1;
    useEditorStore.getState().moveLayer(id, root.id, targetIdx);
  };

  const dup = (id: string) => {
    useEditorStore.getState().duplicateLayer(id, { dx: 0, dy: 0 });
  };
  const del = (id: string) => {
    if (!confirm("이 섹션을 삭제할까요?")) return;
    useEditorStore.getState().remove(id);
  };

  return (
    <div className="lp-scroll">
      {/* Pinned site-frame items — header + footer. These are not part
          of scene.root.children; they live in Site.headerHtml /
          Site.footerHtml and need their own dedicated editors. Showing
          them here keeps every "page section" entry-point in one tab. */}
      {(onOpenHeaderEdit || onOpenFooterEdit) && (
        <section className="lp-section" style={{ borderBottom: "1px solid #2a2d3a", paddingBottom: 8 }}>
          <h4>
            사이트 영역
            <i className="fa-solid fa-window-maximize lp-chev" aria-hidden />
          </h4>
          <div style={{ padding: "0 6px", display: "flex", flexDirection: "column", gap: 6 }}>
            {onOpenHeaderEdit && (
              <button
                type="button"
                onClick={onOpenHeaderEdit}
                style={frameRowBtn}
              >
                <span style={{ ...frameRowIcon, background: "#2a79ff" }}>
                  <i className="fa-solid fa-window-maximize" />
                </span>
                <span style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>헤더 편집</div>
                  <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>
                    로고 · 메뉴 · 텍스트 · 언어 · 스타일
                  </div>
                </span>
                <i className="fa-solid fa-chevron-right" style={{ color: "#666", fontSize: 11 }} />
              </button>
            )}
            {onOpenFooterEdit && (
              <button
                type="button"
                onClick={onOpenFooterEdit}
                style={frameRowBtn}
              >
                <span style={{ ...frameRowIcon, background: "#7a5af8", transform: "rotate(180deg)" }}>
                  <i className="fa-solid fa-window-maximize" />
                </span>
                <span style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>푸터 편집</div>
                  <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>
                    이미지 · 텍스트 · 링크 · 스타일
                  </div>
                </span>
                <i className="fa-solid fa-chevron-right" style={{ color: "#666", fontSize: 11 }} />
              </button>
            )}
          </div>
        </section>
      )}

      <section className="lp-section">
        <h4>
          섹션 (페이지 슬라이드)
          <i className="fa-solid fa-layer-group lp-chev" aria-hidden />
        </h4>
        <div style={{ padding: "0 10px 8px" }}>
          <button
            type="button"
            onClick={onAddSectionClick}
            style={{
              width: "100%",
              padding: "8px 10px",
              background: "var(--fig-accent, #2a79ff)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <i className="fa-solid fa-plus" /> 새 섹션 추가
          </button>
        </div>
        {sections.length === 0 && (
          <div className="lp-empty-sub" style={{ padding: "0 14px 14px" }}>
            아직 섹션이 없습니다. "새 섹션 추가" 버튼으로 시작하세요.
          </div>
        )}
        {sections.length > 0 && (
          <ol
            style={{
              listStyle: "none",
              margin: 0,
              padding: "0 6px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {sections.map((s, i) => (
              <SectionRow
                key={s.id}
                index={i}
                total={sections.length}
                section={s}
                isSelected={s.id === selectedId}
                isDragging={s.id === draggingId}
                isDropAbove={dragOverIdx === i && draggingId !== s.id}
                onClick={() => onRowClick(s.id)}
                onDragStart={() => setDraggingId(s.id)}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDragOverIdx(null);
                }}
                onDragOverRow={(e) => {
                  e.preventDefault();
                  if (!draggingId || draggingId === s.id) return;
                  // Decide above vs below based on cursor Y vs row mid.
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const above = e.clientY < r.top + r.height / 2;
                  setDragOverIdx(above ? i : i + 1);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!draggingId || dragOverIdx == null) return;
                  const root = selectRoot(useEditorStore.getState());
                  const fromIdx =
                    (root as { children?: Layer[] }).children?.findIndex(
                      (c) => c.id === draggingId,
                    ) ?? -1;
                  let toIdx = dragOverIdx;
                  // moveLayer expects index in the post-removal child list.
                  if (toIdx > fromIdx) toIdx -= 1;
                  if (fromIdx >= 0 && toIdx !== fromIdx) {
                    useEditorStore.getState().moveLayer(draggingId, root.id, toIdx);
                  }
                  setDraggingId(null);
                  setDragOverIdx(null);
                }}
                onMoveUp={() => moveBy(s.id, -1)}
                onMoveDown={() => moveBy(s.id, 1)}
                onDuplicate={() => dup(s.id)}
                onDelete={() => del(s.id)}
              />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function SectionRow({
  index,
  total,
  section,
  isSelected,
  isDragging,
  isDropAbove,
  onClick,
  onDragStart,
  onDragEnd,
  onDragOverRow,
  onDrop,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
}: {
  index: number;
  total: number;
  section: Layer;
  isSelected: boolean;
  isDragging: boolean;
  isDropAbove: boolean;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverRow: (e: React.DragEvent<HTMLLIElement>) => void;
  onDrop: (e: React.DragEvent<HTMLLIElement>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", section.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOverRow}
      onDrop={onDrop}
      onClick={onClick}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 8px",
        background: isSelected ? "rgba(42,121,255,0.15)" : "#1a1c24",
        border: isSelected ? "1px solid #2a79ff" : "1px solid #2a2d3a",
        borderRadius: 6,
        cursor: "grab",
        opacity: isDragging ? 0.5 : 1,
        userSelect: "none",
      }}
    >
      {/* Drop-above indicator line */}
      {isDropAbove && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: -3,
            left: 0,
            right: 0,
            height: 3,
            background: "#2a79ff",
            borderRadius: 2,
            boxShadow: "0 0 6px rgba(42,121,255,0.6)",
          }}
        />
      )}

      {/* Position number — 1-based, matches user's slide-counting model */}
      <span
        style={{
          minWidth: 22,
          height: 22,
          padding: "0 6px",
          background: "#2a2d3a",
          color: "#c6c9d6",
          fontSize: 11,
          fontFamily: "ui-monospace, monospace",
          borderRadius: 4,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {index + 1}
      </span>

      {/* Name */}
      <span
        title={section.name}
        style={{
          flex: 1,
          fontSize: 12,
          color: "#e8eaf2",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {section.name}
      </span>

      {/* Quick action buttons. Always visible to keep the affordance
          obvious for beginners — hover-only would be a discoverability
          regression. */}
      <span style={{ display: "flex", gap: 2 }}>
        <RowBtn
          icon="fa-arrow-up"
          title="위로"
          disabled={index === 0}
          onClick={(e) => {
            e.stopPropagation();
            onMoveUp();
          }}
        />
        <RowBtn
          icon="fa-arrow-down"
          title="아래로"
          disabled={index === total - 1}
          onClick={(e) => {
            e.stopPropagation();
            onMoveDown();
          }}
        />
        <RowBtn
          icon="fa-clone"
          title="복제"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
        />
        <RowBtn
          icon="fa-trash"
          title="삭제"
          danger
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        />
      </span>
    </li>
  );
}

function RowBtn({
  icon,
  title,
  disabled,
  danger,
  onClick,
}: {
  icon: string;
  title: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 22,
        height: 22,
        padding: 0,
        background: "transparent",
        color: disabled ? "#444" : danger ? "#ff8b8b" : "#888",
        border: "none",
        borderRadius: 4,
        cursor: disabled ? "default" : "pointer",
        fontSize: 11,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <i className={`fa-solid ${icon}`} aria-hidden />
    </button>
  );
}


const frameRowBtn: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px",
  background: "#1a1c24",
  border: "1px solid #2a2d3a",
  borderRadius: 6,
  cursor: "pointer",
  color: "#e8eaf2",
  fontSize: 12,
  textAlign: "left",
};

const frameRowIcon: React.CSSProperties = {
  width: 22,
  height: 22,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#fff",
  borderRadius: 4,
  fontSize: 11,
};
