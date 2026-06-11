import { describe, it, expect } from "vitest";
import { validateHmf, assertHmfContract } from "../hmf-contract";

const HEADER = `<div id="hns_header_content" class="dragable"><img src="logo.png"></div>
<div id="sushi_05" class="dragable" style="left:462px;top:65px;width:60px;height:48px;position:absolute;z-index:14;"><img src="s5.png"></div>`;
const FOOTER = `<div id="foot_txt" class="dragable sol-replacible-text" style="left:41px;width:1058px;text-align:center;">© 2026</div>`;

describe("validateHmf", () => {
  it("passes a clean header/footer with bare menu", () => {
    const r = validateHmf({
      headerHtml: HEADER,
      menuHtml: `<div id="hns_menu"></div>`,
      footerHtml: FOOTER,
      pages: [{ slug: "index", html: `<div id="obj_hero" class="dragable">hi</div>`, css: "" }],
    });
    expect(r.ok).toBe(true);
    expect(r.issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("ERROR: HMF object id reused in a page body (ghost/scene clash)", () => {
    const r = validateHmf({
      headerHtml: HEADER,
      footerHtml: FOOTER,
      pages: [{ slug: "about-us", html: `<div id="sushi_05" class="dragable"><img src="s5.png"></div>` }],
    });
    expect(r.ok).toBe(false);
    const e = r.issues.find((i) => i.code === "DUP_ID_IN_BODY");
    expect(e?.severity).toBe("error");
    expect(e?.ids).toContain("sushi_05");
    expect(e?.where).toBe("about-us");
  });

  it("ERROR: header object geometry in Page.css (per-page header divergence)", () => {
    const r = validateHmf({
      headerHtml: HEADER,
      pages: [{ slug: "index", css: `#sushi_05 { left: 462px !important; z-index: 14 !important; }` }],
    });
    expect(r.ok).toBe(false);
    const e = r.issues.find((i) => i.code === "HEADER_GEOM_IN_PAGECSS");
    expect(e?.ids).toContain("sushi_05");
  });

  it("does NOT flag a non-geometry page.css rule for a header id", () => {
    const r = validateHmf({
      headerHtml: HEADER,
      pages: [{ slug: "index", css: `#sushi_05 { opacity: 0.9; filter: none; }` }],
    });
    expect(r.issues.find((i) => i.code === "HEADER_GEOM_IN_PAGECSS")).toBeUndefined();
  });

  it("WARN: footer direct child pinned absolute", () => {
    const r = validateHmf({
      footerHtml: `<div id="ftxt" class="dragable" style="position:absolute;top:1596px;left:41px;">x</div>`,
    });
    const w = r.issues.find((i) => i.code === "FOOTER_ABSOLUTE");
    expect(w?.severity).toBe("warn");
    expect(w?.ids).toContain("ftxt");
    expect(r.ok).toBe(true); // warn doesn't fail
  });

  it("does NOT flag nested footer_content children (only direct children)", () => {
    const r = validateHmf({
      footerHtml: `<div id="hns_footer_content" class="dragable" style="position:relative;top:0;"><div id="logo" class="dragable" style="position:absolute;top:5px;left:0;">l</div></div>`,
    });
    expect(r.issues.find((i) => i.code === "FOOTER_ABSOLUTE")).toBeUndefined();
  });

  it("WARN: menuHtml carries a <nav>/<ul> (duplicate nav risk)", () => {
    const r = validateHmf({ menuHtml: `<div id="hns_menu"><nav><a href="/">Home</a></nav></div>` });
    const w = r.issues.find((i) => i.code === "MENU_NOT_BARE");
    expect(w?.severity).toBe("warn");
  });

  it("INFO (not warn): legacy <ul class=mainmenu> menu is allowed", () => {
    const r = validateHmf({ menuHtml: `<div id="hns_menu"><ul class="mainmenu"><li><a>Home</a></li></ul></div>` });
    const w = r.issues.find((i) => i.code === "MENU_NOT_BARE");
    expect(w?.severity).toBe("info");
  });

  it("WARN: negative z-index on an HMF object", () => {
    const r = validateHmf({ headerHtml: `<div id="x" class="dragable" style="z-index:-3;">x</div>` });
    expect(r.issues.find((i) => i.code === "BAD_ZINDEX")?.severity).toBe("warn");
  });

  it("assertHmfContract throws on error-severity issues", () => {
    expect(() =>
      assertHmfContract({
        headerHtml: HEADER,
        pages: [{ slug: "p", html: `<div id="sushi_05" class="dragable">x</div>` }],
      }),
    ).toThrow(/HMF contract/);
    expect(() => assertHmfContract({ headerHtml: HEADER, footerHtml: FOOTER })).not.toThrow();
  });
});
