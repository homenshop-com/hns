/**
 * Inline SVG icon sprite for the redesigned dashboard (v2).
 * Import once at the top of the page tree, then reference icons via
 * <Icon id="i-home" size={18} />.
 *
 * All icons use currentColor stroke so they inherit from CSS.
 */

export function DashboardIconSprite() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: "absolute" }}
      aria-hidden="true"
    >
      <defs>
        <symbol id="i-home" viewBox="0 0 20 20"><path className="i" d="M3 9l7-6 7 6v8a1 1 0 01-1 1h-4v-6H8v6H4a1 1 0 01-1-1V9z" /></symbol>
        <symbol id="i-grid" viewBox="0 0 20 20"><rect className="i" x="3" y="3" width="6" height="6" rx="1" /><rect className="i" x="11" y="3" width="6" height="6" rx="1" /><rect className="i" x="3" y="11" width="6" height="6" rx="1" /><rect className="i" x="11" y="11" width="6" height="6" rx="1" /></symbol>
        <symbol id="i-analytics" viewBox="0 0 20 20"><path className="i" d="M3 17V7M8 17V3M13 17v-6M18 17v-9" /></symbol>
        <symbol id="i-bag" viewBox="0 0 20 20"><path className="i" d="M5 7h10l-1 10a1 1 0 01-1 1H7a1 1 0 01-1-1L5 7z" /><path className="i" d="M7 7V5a3 3 0 016 0v2" /></symbol>
        <symbol id="i-mail" viewBox="0 0 20 20"><rect className="i" x="3" y="4" width="14" height="12" rx="1.5" /><path className="i" d="M3 6l7 5 7-5" /></symbol>
        <symbol id="i-users" viewBox="0 0 20 20"><circle className="i" cx="8" cy="7" r="3" /><path className="i" d="M2 17c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle className="i" cx="14.5" cy="8" r="2" /><path className="i" d="M13 12.5a5 5 0 015 4.5" /></symbol>
        <symbol id="i-credit" viewBox="0 0 20 20"><rect className="i" x="2" y="5" width="16" height="11" rx="1.5" /><path className="i" d="M2 9h16M5 13h3" /></symbol>
        <symbol id="i-settings" viewBox="0 0 20 20"><circle className="i" cx="10" cy="10" r="2.5" /><path className="i" d="M10 2v2M10 16v2M18 10h-2M4 10H2M15.5 4.5l-1.4 1.4M5.9 14.1l-1.4 1.4M15.5 15.5l-1.4-1.4M5.9 5.9L4.5 4.5" /></symbol>
        <symbol id="i-help" viewBox="0 0 20 20"><circle className="i" cx="10" cy="10" r="7.5" /><path className="i" d="M8 8a2 2 0 114 0c0 1.5-2 1.5-2 3" /><circle className="if" cx="10" cy="14.5" r="1" /></symbol>
        <symbol id="i-life" viewBox="0 0 20 20"><circle className="i" cx="10" cy="10" r="7" /><circle className="i" cx="10" cy="10" r="3" /><path className="i" d="M5 5l3 3M12 12l3 3M15 5l-3 3M8 12l-3 3" /></symbol>
        <symbol id="i-search" viewBox="0 0 20 20"><circle className="i" cx="9" cy="9" r="5.5" /><path className="i" d="M13 13l4 4" /></symbol>
        <symbol id="i-bell" viewBox="0 0 20 20"><path className="i" d="M5 14V9a5 5 0 0110 0v5l1.5 2h-13L5 14z" /><path className="i" d="M8.5 17a1.5 1.5 0 003 0" /></symbol>
        <symbol id="i-chev-down" viewBox="0 0 20 20"><path className="i" d="M5 8l5 5 5-5" /></symbol>
        <symbol id="i-chev-right" viewBox="0 0 20 20"><path className="i" d="M8 5l5 5-5 5" /></symbol>
        <symbol id="i-plus" viewBox="0 0 20 20"><path className="i" d="M10 4v12M4 10h12" /></symbol>
        <symbol id="i-sparkle" viewBox="0 0 20 20"><path className="if" d="M10 1l1.5 5.5L17 8l-5.5 1.5L10 15l-1.5-5.5L3 8l5.5-1.5L10 1z" /></symbol>
        <symbol id="i-template" viewBox="0 0 20 20"><rect className="i" x="3" y="3" width="14" height="4" rx="1" /><rect className="i" x="3" y="9" width="6" height="8" rx="1" /><rect className="i" x="11" y="9" width="6" height="8" rx="1" /></symbol>
        <symbol id="i-handshake" viewBox="0 0 20 20"><path className="i" d="M2 10l3-3h4l2 2-2 2-1-1M18 10l-3-3h-4l-2 2 5 5 4-4zM7 9l3 3" /></symbol>
        <symbol id="i-arr-right" viewBox="0 0 20 20"><path className="i" d="M4 10h12M11 5l5 5-5 5" /></symbol>
        <symbol id="i-palette" viewBox="0 0 20 20"><path className="i" d="M10 2.5a7.5 7.5 0 000 15c1 0 1.5-1 1.5-1.5S11 14.5 11 13.5s1-1.5 2-1.5h2a3 3 0 003-3A7.5 7.5 0 0010 2.5z" /><circle className="if" cx="6" cy="8" r="1" /><circle className="if" cx="9" cy="5.5" r="1" /><circle className="if" cx="13" cy="6" r="1" /><circle className="if" cx="14.5" cy="9.5" r="1" /></symbol>
        <symbol id="i-database" viewBox="0 0 20 20"><ellipse className="i" cx="10" cy="5" rx="6" ry="2.5" /><path className="i" d="M4 5v5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V5M4 10v5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-5" /></symbol>
        <symbol id="i-info" viewBox="0 0 20 20"><circle className="i" cx="10" cy="10" r="7.5" /><path className="i" d="M10 9v5" /><circle className="if" cx="10" cy="6" r="1" /></symbol>
        <symbol id="i-more" viewBox="0 0 20 20"><circle className="if" cx="5" cy="10" r="1.4" /><circle className="if" cx="10" cy="10" r="1.4" /><circle className="if" cx="15" cy="10" r="1.4" /></symbol>
        <symbol id="i-star" viewBox="0 0 20 20"><path className="if" d="M10 2.5l2.4 4.8 5.3.8-3.85 3.75.9 5.25L10 14.6 5.25 17.1l.9-5.25L2.3 8.1l5.3-.8L10 2.5z" /></symbol>
        <symbol id="i-list" viewBox="0 0 20 20"><path className="i" d="M7 5h10M7 10h10M7 15h10" /><circle className="if" cx="4" cy="5" r="1" /><circle className="if" cx="4" cy="10" r="1" /><circle className="if" cx="4" cy="15" r="1" /></symbol>
        <symbol id="i-globe" viewBox="0 0 20 20"><circle className="i" cx="10" cy="10" r="7.5" /><path className="i" d="M2.5 10h15M10 2.5c2 2.5 3 5 3 7.5s-1 5-3 7.5c-2-2.5-3-5-3-7.5s1-5 3-7.5z" /></symbol>
        <symbol id="i-publish" viewBox="0 0 20 20"><path className="i" d="M10 14V4M6 8l4-4 4 4M4 15v1a1 1 0 001 1h10a1 1 0 001-1v-1" /></symbol>
        <symbol id="i-edit" viewBox="0 0 20 20"><path className="i" d="M3 17l3-.5 9-9-2.5-2.5-9 9L3 17zM12 5l2.5 2.5" /></symbol>
      </defs>
    </svg>
  );
}

export function Icon({ id, size = 18, style }: { id: string; size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} style={style} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}
