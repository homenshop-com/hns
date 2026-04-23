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
        <symbol id="i-menu" viewBox="0 0 20 20"><path className="i" d="M3 5h14M3 10h14M3 15h14" /></symbol>
        <symbol id="i-board" viewBox="0 0 20 20"><rect className="i" x="3" y="4" width="14" height="12" rx="1" /><path className="i" d="M3 8h14M7 12h7M7 14h5" /></symbol>
        <symbol id="i-package" viewBox="0 0 20 20"><path className="i" d="M3 6l7-3 7 3v8l-7 3-7-3V6z" /><path className="i" d="M3 6l7 3 7-3M10 9v9" /></symbol>
        <symbol id="i-eye" viewBox="0 0 20 20"><path className="i" d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z" /><circle className="i" cx="10" cy="10" r="2.5" /></symbol>
        <symbol id="i-save" viewBox="0 0 20 20"><path className="i" d="M4 3h10l3 3v10a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1z" /><path className="i" d="M6 3v5h8V3M6 17v-5h8v5" /></symbol>
        <symbol id="i-user" viewBox="0 0 20 20"><circle className="i" cx="10" cy="7" r="3.5" /><path className="i" d="M3.5 17a6.5 6.5 0 0113 0" /></symbol>
        <symbol id="i-copy" viewBox="0 0 20 20"><rect className="i" x="7" y="7" width="10" height="10" rx="1.5" /><path className="i" d="M4 13V5a1 1 0 011-1h8" /></symbol>
        <symbol id="i-check" viewBox="0 0 20 20"><path className="i" d="M4 10l4 4 8-8" /></symbol>
        <symbol id="i-refresh" viewBox="0 0 20 20"><path className="i" d="M4 10a6 6 0 0110-4.5M16 10a6 6 0 01-10 4.5M14 3v3h-3M6 17v-3h3" /></symbol>
        <symbol id="i-sitemap" viewBox="0 0 20 20"><rect className="i" x="7" y="2" width="6" height="4" rx="1" /><rect className="i" x="2" y="14" width="5" height="4" rx="1" /><rect className="i" x="13" y="14" width="5" height="4" rx="1" /><path className="i" d="M10 6v4M5 14v-1a1 1 0 011-1h8a1 1 0 011 1v1" /></symbol>
        <symbol id="i-warn" viewBox="0 0 20 20"><path className="i" d="M10 2l8 15H2L10 2z" /><path className="i" d="M10 8v4" /><circle className="if" cx="10" cy="14.5" r="1" /></symbol>
        <symbol id="i-trash" viewBox="0 0 20 20"><path className="i" d="M4 6h12M7 6V4h6v2M6 6l1 11h6l1-11" /></symbol>
        <symbol id="i-external" viewBox="0 0 20 20"><path className="i" d="M8 4H5a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1v-3M12 4h4v4M10 10l6-6" /></symbol>
        <symbol id="i-google" viewBox="0 0 20 20"><path fill="#4285F4" d="M18 10.2c0-.6 0-1.1-.1-1.7H10v3.2h4.5c-.2 1-.8 1.9-1.7 2.5v2.1h2.7c1.6-1.5 2.5-3.6 2.5-6.1z" /><path fill="#34A853" d="M10 18c2.3 0 4.2-.8 5.6-2.1l-2.7-2.1c-.8.5-1.7.8-2.9.8-2.2 0-4.1-1.5-4.8-3.5H2.4v2.2A8 8 0 0010 18z" /><path fill="#FBBC04" d="M5.2 11.1a4.8 4.8 0 010-3.1V5.8H2.4a8 8 0 000 7.2l2.8-2z" /><path fill="#EA4335" d="M10 5c1.2 0 2.3.4 3.2 1.3l2.4-2.4A8 8 0 002.4 5.8l2.8 2.2C5.9 6 7.8 5 10 5z" /></symbol>
        <symbol id="i-lang" viewBox="0 0 20 20"><path className="i" d="M3 5h8M7 3v2M5 5c0 4 3 7 6 8M11 5c0 3-2 6-5 7M10 17l3-7 3 7M11 14.5h4" /></symbol>
        <symbol id="i-lock" viewBox="0 0 20 20"><rect className="i" x="4" y="9" width="12" height="9" rx="1.5" /><path className="i" d="M7 9V6a3 3 0 016 0v3" /></symbol>
        <symbol id="i-shield" viewBox="0 0 20 20"><path className="i" d="M10 2l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V5l7-3z" /><path className="i" d="M7 10l2 2 4-4" /></symbol>
        <symbol id="i-clock" viewBox="0 0 20 20"><circle className="i" cx="10" cy="10" r="7.5" /><path className="i" d="M10 6v4l2.5 2.5" /></symbol>
        <symbol id="i-bulb" viewBox="0 0 20 20"><path className="i" d="M10 2a5 5 0 00-3 9c.5.5 1 1 1 2v1h4v-1c0-1 .5-1.5 1-2a5 5 0 00-3-9z" /><path className="i" d="M8 17h4M9 19h2" /></symbol>
        <symbol id="i-book" viewBox="0 0 20 20"><path className="i" d="M3 4a1 1 0 011-1h5a2 2 0 012 2v11a2 2 0 00-2-2H4a1 1 0 01-1-1V4zM17 4a1 1 0 00-1-1h-5a2 2 0 00-2 2v11a2 2 0 012-2h5a1 1 0 001-1V4z" /></symbol>
        <symbol id="i-pin" viewBox="0 0 20 20"><path className="i" d="M10 2l2 5 5 1-4 4 1 5-4-3-4 3 1-5-4-4 5-1 2-5z" /></symbol>
        <symbol id="i-link" viewBox="0 0 20 20"><path className="i" d="M11 4.5L12.5 3a3 3 0 014.2 4.2L15 9M9 15.5L7.5 17a3 3 0 01-4.2-4.2L5 11M7 13l6-6" /></symbol>
        <symbol id="i-coin" viewBox="0 0 20 20"><circle className="i" cx="10" cy="10" r="7.5" /><path className="i" d="M10 5v10M7.5 7.2a2.5 2.5 0 012.5-.7c1.4 0 2.5.8 2.5 2s-1 1.5-2.5 1.7c-1.5.2-2.5.5-2.5 2s1.1 2 2.5 2a2.5 2.5 0 002.5-.7" /></symbol>
        <symbol id="i-bolt" viewBox="0 0 20 20"><path className="if" d="M11 2L4 11h5l-1 7 7-9h-5l1-7z" /></symbol>
        <symbol id="i-gift" viewBox="0 0 20 20"><path className="i" d="M3 8h14v9a1 1 0 01-1 1H4a1 1 0 01-1-1V8zM2 5h16v3H2zM10 5v13M10 5c-1-2-4-2-4 0s3 0 4 0c1 0 4 0 4 0 0-2-3-2-4 0z" /></symbol>
        <symbol id="i-receipt" viewBox="0 0 20 20"><path className="i" d="M4 2h12v16l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L4 18V2zM7 6h6M7 9h6M7 12h4" /></symbol>
        <symbol id="i-chat" viewBox="0 0 20 20"><path className="i" d="M4 4h12a1 1 0 011 1v9a1 1 0 01-1 1H9l-4 3v-3H4a1 1 0 01-1-1V5a1 1 0 011-1z" /></symbol>
        <symbol id="i-hash" viewBox="0 0 20 20"><path className="i" d="M7 3l-2 14M15 3l-2 14M3 7h14M3 13h14" /></symbol>
        <symbol id="i-chev-left" viewBox="0 0 20 20"><path className="i" d="M12 5l-5 5 5 5" /></symbol>
        <symbol id="i-card" viewBox="0 0 20 20"><rect className="i" x="2" y="5" width="16" height="11" rx="1.5" /><path className="i" d="M2 9h16M5 13h3" /></symbol>
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
