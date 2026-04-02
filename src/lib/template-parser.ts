/**
 * Parse legacy template HTML files and extract page content.
 *
 * Template HTML structure:
 *   <div id="v_home_dft" class="c_v_home_dft">
 *     <div id="hns_header"></div>
 *     <div id="hns_menu"></div>
 *     <div id="hns_body">...dragable elements...</div>
 *     <div id="hns_footer"></div>
 *   </div>
 *
 * We extract only the #hns_body innerHTML for each page.
 */

import * as fs from "fs";
import * as path from "path";

// Base path for template files on disk
const TEMPLATE_BASE_PATH =
  process.env.TEMPLATE_FILES_PATH ||
  "/var/www/templates/personal/newtemp";

export interface TemplatePage {
  slug: string;
  title: string;
  bodyHtml: string;
}

// Map of filename → display title
const PAGE_TITLE_MAP: Record<string, string> = {
  "index.html": "Home",
  "aboutus.html": "About Us",
  "history.html": "History",
  "service.html": "Service",
  "intro.html": "Gallery",
  "product.html": "Products",
  "board.html": "Board",
  "contactus.html": "Contact Us",
  "agreement.html": "Agreement",
  "users.html": "Members",
  "user.html": "Members",
};

// Pages to skip (not user-visible)
const SKIP_PAGES = new Set(["empty.html", "thumbnail.js"]);

/**
 * Extract body content from template HTML.
 * Gets innerHTML of <div id="hns_body">...</div>
 */
function extractBodyContent(html: string): string {
  // Match content between <div id="hns_body"> and the closing </div>
  // before <div id="hns_footer">
  const bodyMatch = html.match(
    /<div\s+id="hns_body"[^>]*>([\s\S]*?)<\/div>\s*<div\s+id="hns_footer"/i
  );
  if (bodyMatch) {
    return bodyMatch[1].trim();
  }

  // Fallback: try without footer
  const bodyMatch2 = html.match(
    /<div\s+id="hns_body"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/body>/i
  );
  if (bodyMatch2) {
    return bodyMatch2[1].trim();
  }

  return "";
}

/**
 * Read template CSS from the files/default.css
 * Rewrites relative url() references to absolute /tpl/ paths so they work
 * when injected as inline <style> in the editor.
 */
export function readTemplateCss(templatePath: string): string {
  // templatePath example: "personal/newtemp/pt449441/wpt721160"
  // Strip leading "personal/newtemp/" if present since TEMPLATE_BASE_PATH already includes it
  const relativePath = templatePath.replace(/^personal\/newtemp\//, "");
  const cssPath = path.join(TEMPLATE_BASE_PATH, relativePath, "files", "default.css");

  let css = "";
  try {
    css = fs.readFileSync(cssPath, "utf-8");
  } catch {
    // Try with full path
    const fullCssPath = path.join(
      path.dirname(TEMPLATE_BASE_PATH),
      templatePath,
      "files",
      "default.css"
    );
    try {
      css = fs.readFileSync(fullCssPath, "utf-8");
    } catch {
      return "";
    }
  }

  // Rewrite relative url() references to absolute /tpl/ paths.
  // CSS like url(tm.gif) or url(bg.jpg) becomes url(/tpl/{templatePath}/files/tm.gif)
  // Skip already-absolute URLs (starting with /, http, https, data:)
  const baseUrl = `/tpl/${templatePath}/files`;
  css = css.replace(
    /url\(\s*['"]?(?!\/|https?:|data:)([^'")]+?)['"]?\s*\)/g,
    (_, filename) => `url(${baseUrl}/${filename})`
  );

  // Strip body background-image: legacy templates have body { background:url(bg.jpg) }
  // which doesn't render properly in the new system (body → scoped div)
  css = css.replace(
    /(body\s*\{[^}]*?)background\s*:\s*url\([^)]*\)[^;]*;?/gi,
    "$1"
  );

  // wowasp → hns branding migration
  css = css.replace(/wowasp_/g, "hns_");
  css = css.replace(/wowaspfoot/g, "hnsfoot");

  return css;
}

/**
 * Parse all HTML pages from a template directory.
 * Returns array of pages with slug, title, and body HTML content.
 */
export function parseTemplatePages(templatePath: string): TemplatePage[] {
  const relativePath = templatePath.replace(/^personal\/newtemp\//, "");
  let templateDir = path.join(TEMPLATE_BASE_PATH, relativePath);

  // Fallback to full path resolution
  if (!fs.existsSync(templateDir)) {
    templateDir = path.join(path.dirname(TEMPLATE_BASE_PATH), templatePath);
  }

  if (!fs.existsSync(templateDir)) {
    console.error(`Template directory not found: ${templateDir}`);
    return [
      {
        slug: "index",
        title: "Home",
        bodyHtml: "",
      },
    ];
  }

  const files = fs.readdirSync(templateDir).filter((f) => f.endsWith(".html"));
  const pages: TemplatePage[] = [];

  for (const file of files) {
    if (SKIP_PAGES.has(file)) continue;

    const filePath = path.join(templateDir, file);
    const html = fs.readFileSync(filePath, "utf-8");
    const bodyHtml = extractBodyContent(html);

    const slug = file.replace(".html", "");
    const title = PAGE_TITLE_MAP[file] || slug.charAt(0).toUpperCase() + slug.slice(1);

    pages.push({ slug, title, bodyHtml });
  }

  // Sort: index first, then alphabetical
  pages.sort((a, b) => {
    if (a.slug === "index") return -1;
    if (b.slug === "index") return 1;
    return a.slug.localeCompare(b.slug);
  });

  // If no pages found, return a default empty home page
  if (pages.length === 0) {
    pages.push({ slug: "index", title: "Home", bodyHtml: "" });
  }

  return pages;
}

/**
 * Rewrite image/asset URLs in HTML to use the new server path.
 * /tpl/path/files/image.png → /tpl/path/files/image.png (same pattern, served by nginx)
 */
export function rewriteAssetUrls(html: string, templatePath: string): string {
  // Remove PHP includes (not applicable in Next.js)
  let result = html.replace(/<\?php[\s\S]*?\?>/g, "");

  const baseUrl = `/tpl/${templatePath}/files`;

  // Rewrite relative ../files/ paths to absolute /tpl/ paths
  result = result.replace(
    /(src|href)="\.\.\/files\/([^"]+)"/g,
    (_, attr, filename) => `${attr}="${baseUrl}/${filename}"`
  );

  // Rewrite relative ./files/ paths
  result = result.replace(
    /(src|href)="\.\/files\/([^"]+)"/g,
    (_, attr, filename) => `${attr}="${baseUrl}/${filename}"`
  );

  // Rewrite inline style url() with relative paths
  result = result.replace(
    /url\(\s*['"]?\.\.\/files\/([^'")]+?)['"]?\s*\)/g,
    (_, filename) => `url(${baseUrl}/${filename})`
  );

  return result;
}
