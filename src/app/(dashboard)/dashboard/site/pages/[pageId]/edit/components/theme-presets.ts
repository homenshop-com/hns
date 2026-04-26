/**
 * Theme preset catalog — shared between design-editor (theme apply +
 * reverse lookup) and LeftPalette (UI grid).  Each preset is a 4-token
 * palette: `brand` for primary actions/headings, `accent` for
 * secondary/badges, `surface` for the page background, `text` for body
 * copy.
 *
 * `category` groups the grid into "기본" / "따뜻한" / "차가운" / "프로페셔널"
 * so the picker doesn't read as a wall of swatches. `mood` is a one-word
 * vibe shown under the name as a hint when the user is browsing.
 */

export interface ThemePreset {
  id: string;
  label: string;
  mood: string;
  brand: string;
  accent: string;
  surface: string;
  text: string;
  category: "fresh" | "warm" | "cool" | "pro" | "soft";
}

export const THEME_PRESETS: ThemePreset[] = [
  // ─── Fresh (밝고 산뜻한) ────────────────────────────────────────
  { id: "mint",     label: "민트",       mood: "산뜻한 비즈니스",  category: "fresh", brand: "#3ccf97", accent: "#5be5b3", surface: "#ffffff", text: "#0d2e26" },
  { id: "ocean",    label: "오션",       mood: "신뢰감 있는 IT",   category: "fresh", brand: "#2563eb", accent: "#4a90d9", surface: "#ffffff", text: "#0f172a" },
  { id: "forest",   label: "포레스트",   mood: "친환경/내추럴",    category: "fresh", brand: "#1f6f5c", accent: "#3ccf97", surface: "#f4faf6", text: "#0d2e26" },

  // ─── Warm (따뜻한 / 빈티지) ────────────────────────────────────
  { id: "sunset",   label: "선셋",       mood: "포근한 카페",      category: "warm",  brand: "#e89a78", accent: "#f4b66a", surface: "#fff8f1", text: "#3d2415" },
  { id: "amber",    label: "앰버",       mood: "고급스러운 우드",  category: "warm",  brand: "#d97706", accent: "#f59e0b", surface: "#fffbeb", text: "#451a03" },
  { id: "beige",    label: "베이지",     mood: "내추럴 뷰티",      category: "warm",  brand: "#a8865a", accent: "#d4b483", surface: "#faf6ef", text: "#3a2a14" },

  // ─── Cool (차분한 / 모던) ──────────────────────────────────────
  { id: "berry",    label: "베리",       mood: "트렌디 패션",      category: "cool",  brand: "#b6267e", accent: "#ff8bb1", surface: "#fff5fa", text: "#3a0e25" },
  { id: "rose",     label: "로즈",       mood: "여성스러운 살롱",  category: "cool",  brand: "#e11d48", accent: "#fb7185", surface: "#fff1f2", text: "#4c0519" },
  { id: "violet",   label: "바이올렛",   mood: "감성 부티크",      category: "cool",  brand: "#7c3aed", accent: "#a78bfa", surface: "#faf5ff", text: "#1e0b3a" },

  // ─── Pro (프로페셔널 / 미니멀) ─────────────────────────────────
  { id: "graphite", label: "그래파이트", mood: "모던 미니멀",      category: "pro",   brand: "#111827", accent: "#6b7280", surface: "#f9fafb", text: "#111827" },
  { id: "slate",    label: "슬레이트",   mood: "기업 / 컨설팅",    category: "pro",   brand: "#0f172a", accent: "#3b82f6", surface: "#ffffff", text: "#0f172a" },
  { id: "midnight", label: "미드나잇",   mood: "프리미엄 다크",    category: "pro",   brand: "#fbbf24", accent: "#f59e0b", surface: "#0f172a", text: "#f8fafc" },
];

export const THEME_CATEGORIES: Array<{ key: ThemePreset["category"]; label: string }> = [
  { key: "fresh", label: "산뜻함" },
  { key: "warm",  label: "따뜻함" },
  { key: "cool",  label: "차가움" },
  { key: "pro",   label: "프로페셔널" },
];

export function findThemePresetByColors(brand: string, accent: string): ThemePreset | null {
  const b = brand.toLowerCase();
  const a = accent.toLowerCase();
  return (
    THEME_PRESETS.find((p) => p.brand.toLowerCase() === b && p.accent.toLowerCase() === a) ?? null
  );
}
