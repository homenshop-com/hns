/**
 * Korean web font catalog — single source of truth for the design editor's
 * 테마 tab and the inspector's 타이포그래피 폰트 picker.
 *
 * `marker` is the substring that uniquely identifies a font inside a CSS
 * `font-family` stack — used by reverse lookup (CSS → font id) so the UI
 * can highlight the active font when CSS already contains a custom value.
 *
 * Fonts hosted on Google Fonts are loaded once globally via
 * `app/layout.tsx`; Pretendard ships from jsdelivr separately.
 */

export interface FontDef {
  /** Stable id used in UI state and CSS comments. */
  id: string;
  /** Korean display label shown in the font picker. */
  label: string;
  /** Latin label (kept in the picker preview alongside the Korean one). */
  english: string;
  /** Full CSS font-family stack assigned to elements. */
  stack: string;
  /** Substring uniquely identifying the font inside the stack. */
  marker: string;
  /** Loose category for grouping inside the picker. */
  category: "sans" | "serif" | "display" | "handwriting" | "mono";
}

export const FONT_CATALOG: FontDef[] = [
  // ─── Sans (산세리프 / 고딕) ───────────────────────────────────────
  {
    id: "pretendard",
    label: "Pretendard",
    english: "Pretendard",
    stack: "'Pretendard Variable', Pretendard, system-ui, sans-serif",
    marker: "Pretendard",
    category: "sans",
  },
  {
    id: "noto-sans-kr",
    label: "Noto Sans KR",
    english: "Noto Sans KR",
    stack: "'Noto Sans KR', system-ui, sans-serif",
    marker: "Noto Sans KR",
    category: "sans",
  },
  {
    id: "nanum-gothic",
    label: "나눔고딕",
    english: "Nanum Gothic",
    stack: "'Nanum Gothic', system-ui, sans-serif",
    marker: "Nanum Gothic",
    category: "sans",
  },
  {
    id: "ibm-plex-sans-kr",
    label: "IBM Plex Sans KR",
    english: "IBM Plex Sans KR",
    stack: "'IBM Plex Sans KR', system-ui, sans-serif",
    marker: "IBM Plex Sans KR",
    category: "sans",
  },
  {
    id: "gowun-dodum",
    label: "고운돋움",
    english: "Gowun Dodum",
    stack: "'Gowun Dodum', system-ui, sans-serif",
    marker: "Gowun Dodum",
    category: "sans",
  },
  {
    id: "sunflower",
    label: "Sunflower (해바라기)",
    english: "Sunflower",
    stack: "'Sunflower', system-ui, sans-serif",
    marker: "Sunflower",
    category: "sans",
  },
  {
    id: "jeju-gothic",
    label: "제주고딕",
    english: "Jeju Gothic",
    stack: "'Jeju Gothic', system-ui, sans-serif",
    marker: "Jeju Gothic",
    category: "sans",
  },
  {
    id: "inter",
    label: "Inter",
    english: "Inter",
    stack: "Inter, system-ui, sans-serif",
    marker: "Inter",
    category: "sans",
  },

  // ─── Serif (세리프 / 명조) ────────────────────────────────────────
  {
    id: "noto-serif-kr",
    label: "Noto Serif KR",
    english: "Noto Serif KR",
    stack: "'Noto Serif KR', Georgia, serif",
    marker: "Noto Serif KR",
    category: "serif",
  },
  {
    id: "nanum-myeongjo",
    label: "나눔명조",
    english: "Nanum Myeongjo",
    stack: "'Nanum Myeongjo', Georgia, serif",
    marker: "Nanum Myeongjo",
    category: "serif",
  },
  {
    id: "gowun-batang",
    label: "고운바탕",
    english: "Gowun Batang",
    stack: "'Gowun Batang', Georgia, serif",
    marker: "Gowun Batang",
    category: "serif",
  },
  {
    id: "song-myung",
    label: "송명체",
    english: "Song Myung",
    stack: "'Song Myung', Georgia, serif",
    marker: "Song Myung",
    category: "serif",
  },
  {
    id: "jeju-myeongjo",
    label: "제주명조",
    english: "Jeju Myeongjo",
    stack: "'Jeju Myeongjo', Georgia, serif",
    marker: "Jeju Myeongjo",
    category: "serif",
  },
  {
    id: "stylish",
    label: "스타일리시",
    english: "Stylish",
    stack: "'Stylish', Georgia, serif",
    marker: "Stylish",
    category: "serif",
  },

  // ─── Display (제목용 / 강조체) ────────────────────────────────────
  {
    id: "black-han-sans",
    label: "검은고딕",
    english: "Black Han Sans",
    stack: "'Black Han Sans', system-ui, sans-serif",
    marker: "Black Han Sans",
    category: "display",
  },
  {
    id: "do-hyeon",
    label: "도현체",
    english: "Do Hyeon",
    stack: "'Do Hyeon', system-ui, sans-serif",
    marker: "Do Hyeon",
    category: "display",
  },
  {
    id: "jua",
    label: "주아체",
    english: "Jua",
    stack: "'Jua', system-ui, sans-serif",
    marker: "Jua",
    category: "display",
  },
  {
    id: "gugi",
    label: "구기체",
    english: "Gugi",
    stack: "'Gugi', cursive",
    marker: "Gugi",
    category: "display",
  },
  {
    id: "jeju-hallasan",
    label: "제주한라산",
    english: "Jeju Hallasan",
    stack: "'Jeju Hallasan', system-ui, serif",
    marker: "Jeju Hallasan",
    category: "display",
  },
  {
    id: "yeon-sung",
    label: "연성체",
    english: "Yeon Sung",
    stack: "'Yeon Sung', cursive",
    marker: "Yeon Sung",
    category: "display",
  },

  // ─── Handwriting (손글씨 / 캘리) ─────────────────────────────────
  {
    id: "nanum-pen",
    label: "나눔펜",
    english: "Nanum Pen Script",
    stack: "'Nanum Pen Script', cursive",
    marker: "Nanum Pen Script",
    category: "handwriting",
  },
  {
    id: "nanum-brush",
    label: "나눔붓",
    english: "Nanum Brush Script",
    stack: "'Nanum Brush Script', cursive",
    marker: "Nanum Brush Script",
    category: "handwriting",
  },
  {
    id: "gaegu",
    label: "개구체",
    english: "Gaegu",
    stack: "'Gaegu', cursive",
    marker: "Gaegu",
    category: "handwriting",
  },
  {
    id: "hi-melody",
    label: "하이멜로디",
    english: "Hi Melody",
    stack: "'Hi Melody', cursive",
    marker: "Hi Melody",
    category: "handwriting",
  },
  {
    id: "single-day",
    label: "싱글데이",
    english: "Single Day",
    stack: "'Single Day', cursive",
    marker: "Single Day",
    category: "handwriting",
  },
  {
    id: "poor-story",
    label: "푸어스토리",
    english: "Poor Story",
    stack: "'Poor Story', cursive",
    marker: "Poor Story",
    category: "handwriting",
  },
  {
    id: "cute-font",
    label: "큐트체",
    english: "Cute Font",
    stack: "'Cute Font', cursive",
    marker: "Cute Font",
    category: "handwriting",
  },
  {
    id: "east-sea-dokdo",
    label: "동해독도",
    english: "East Sea Dokdo",
    stack: "'East Sea Dokdo', cursive",
    marker: "East Sea Dokdo",
    category: "handwriting",
  },

  // ─── Mono (코드 / 고정폭) ────────────────────────────────────────
  {
    id: "nanum-gothic-coding",
    label: "나눔고딕코딩",
    english: "Nanum Gothic Coding",
    stack: "'Nanum Gothic Coding', ui-monospace, monospace",
    marker: "Nanum Gothic Coding",
    category: "mono",
  },
  {
    id: "jetbrains-mono",
    label: "JetBrains Mono",
    english: "JetBrains Mono",
    stack: "'JetBrains Mono', ui-monospace, monospace",
    marker: "JetBrains Mono",
    category: "mono",
  },
];

export const FONT_CATEGORIES: Array<{ key: FontDef["category"]; label: string }> = [
  { key: "sans", label: "고딕" },
  { key: "serif", label: "명조" },
  { key: "display", label: "디스플레이" },
  { key: "handwriting", label: "손글씨" },
  { key: "mono", label: "고정폭" },
];

/** Reverse lookup: given a CSS font-family stack, return the matching id. */
export function findFontIdByStack(stack: string | undefined | null): string | null {
  if (!stack) return null;
  const found = FONT_CATALOG.find((f) => stack.includes(f.marker));
  return found ? found.id : null;
}

export function getFontById(id: string | null | undefined): FontDef | null {
  if (!id) return null;
  return FONT_CATALOG.find((f) => f.id === id) ?? null;
}
