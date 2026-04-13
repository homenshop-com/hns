import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = process.env.AI_EDIT_MODEL || "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are a web page HTML/CSS editor. You ONLY output valid JSON. No explanations, no questions, no comments.

You receive: body HTML, header HTML, menu HTML, footer HTML, page CSS (editable), template CSS (read-only).

Page structure:
- Elements use class "dragable" with position:absolute and inline styles (top, left, width, height)
- Elements have unique IDs
- Body is in <div id="hns_body">, header in <div id="hns_header">, footer in <div id="hns_footer">
- Menu is in <div id="hns_menu"> — contains <ul><li><a> navigation links
- Page wrapper: <div class="c_v_home_dft"> (width ~1000px)

CSS priority: Template CSS (read-only) < Site CSS (read-only) < Page CSS (editable).
For visual changes (background, fonts, colors): modify pageCss with !important to override template CSS.
For page background: use body { background: ... !important; } or .c_v_home_dft { background: ... !important; }
For menu styling: use #hns_menu a { color: ... !important; } in pageCss.

CRITICAL RULES:
- Output ONLY a JSON object: {"body":"...","header":"...","menu":"...","footer":"...","pageCss":"..."}
- Only include keys you actually modified
- pageCss must be the COMPLETE CSS (existing + your additions merged)
- Prefer CSS changes over HTML changes when possible (e.g. color/font/background changes → pageCss)
- NEVER output explanations, questions, or anything other than JSON
- NEVER ask for clarification — make your best judgment and apply the change
- If you cannot do something, return {} (empty JSON object)
- Do not wrap JSON in markdown code fences`;

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI 기능이 설정되지 않았습니다." },
      { status: 503 }
    );
  }

  const { html, headerHtml, menuHtml, footerHtml, css, pageCss, templateCss, prompt } = await request.json();

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json(
      { error: "프롬프트를 입력하세요." },
      { status: 400 }
    );
  }

  let userMessage = `Body HTML:\n\`\`\`html\n${html || ""}\n\`\`\`\n\n`;
  if (headerHtml) {
    userMessage += `Header HTML:\n\`\`\`html\n${headerHtml}\n\`\`\`\n\n`;
  }
  if (menuHtml) {
    userMessage += `Menu HTML:\n\`\`\`html\n${menuHtml}\n\`\`\`\n\n`;
  }
  if (footerHtml) {
    userMessage += `Footer HTML:\n\`\`\`html\n${footerHtml}\n\`\`\`\n\n`;
  }
  userMessage += `Page CSS (editable):\n\`\`\`css\n${pageCss || "/* empty */"}\n\`\`\`\n\n`;
  if (templateCss) {
    const truncated = templateCss.length > 2000
      ? templateCss.slice(0, 2000) + "\n/* ... truncated ... */"
      : templateCss;
    userMessage += `Template CSS (read-only):\n\`\`\`css\n${truncated}\n\`\`\`\n\n`;
  }
  if (css) {
    const truncated = css.length > 1000
      ? css.slice(0, 1000) + "\n/* ... truncated ... */"
      : css;
    userMessage += `Site CSS (read-only):\n\`\`\`css\n${truncated}\n\`\`\`\n\n`;
  }
  userMessage += `Request: ${prompt.trim()}\n\nRespond with JSON only.`;

  const apiBody = JSON.stringify({
    model: CLAUDE_MODEL,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const apiHeaders = {
    "Content-Type": "application/json",
    "x-api-key": ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
  };

  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: apiHeaders,
        body: apiBody,
      });

      if (response.status === 529) {
        lastError = "AI 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.";
        console.error(`Anthropic overloaded (attempt ${attempt + 1}/3)`);
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        console.error("Anthropic API error:", response.status, errText);
        if (response.status === 401) {
          return NextResponse.json({ error: "API 인증 오류입니다." }, { status: 502 });
        }
        if (response.status === 429) {
          return NextResponse.json({ error: "API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요." }, { status: 502 });
        }
        return NextResponse.json({ error: "AI 처리 중 오류가 발생했습니다." }, { status: 502 });
      }

      const data = await response.json();
      let resultText = data.content?.[0]?.text || "";

      // Strip markdown code fences
      resultText = resultText
        .replace(/^```json?\s*\n?/i, "")
        .replace(/\n?```\s*$/i, "")
        .trim();

      // Must be valid JSON starting with {
      if (!resultText.startsWith("{")) {
        console.error("AI returned non-JSON:", resultText.substring(0, 200));
        return NextResponse.json(
          { error: "AI가 올바른 형식으로 응답하지 않았습니다. 다시 시도해주세요." },
          { status: 502 }
        );
      }

      try {
        const result = JSON.parse(resultText);

        // Validate: each value must look like HTML or CSS, not plain text explanations
        for (const key of ["body", "header", "menu", "footer"]) {
          if (result[key] && typeof result[key] === "string") {
            const val = result[key].trim();
            // If it looks like an explanation (starts with "I ", "Please", "However", etc.)
            if (/^(I |Please |However|Unfortunately|Note:|To |Since )/i.test(val)) {
              delete result[key]; // Remove invalid entries
            }
          }
        }

        // If empty result after cleanup
        if (Object.keys(result).length === 0) {
          return NextResponse.json(
            { error: "AI가 변경 사항을 생성하지 못했습니다. 더 구체적으로 요청해주세요." },
            { status: 502 }
          );
        }

        return NextResponse.json(result);
      } catch {
        console.error("JSON parse failed:", resultText.substring(0, 200));
        return NextResponse.json(
          { error: "AI 응답을 파싱할 수 없습니다. 다시 시도해주세요." },
          { status: 502 }
        );
      }
    } catch (err) {
      console.error("AI edit error:", err);
      lastError = "네트워크 오류가 발생했습니다.";
    }
  }

  return NextResponse.json({ error: lastError || "AI 처리 중 오류가 발생했습니다." }, { status: 502 });
}
