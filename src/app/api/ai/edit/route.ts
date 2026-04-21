import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  consumeCredits,
  refundCredits,
  CREDIT_COSTS,
  InsufficientCreditsError,
} from "@/lib/credits";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = process.env.AI_EDIT_MODEL || "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are a web page HTML/CSS editor. You ONLY output valid JSON. No explanations, no questions, no comments.

You receive: body HTML, header HTML, menu HTML, footer HTML, page CSS (editable), template CSS (read-only).
You may also receive a [Selected element] section indicating which element the user has currently selected in the editor.

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

Selected element (VERY IMPORTANT):
- When a [Selected element] section is provided, the user's request applies ONLY to that specific element (identified by its id).
- "현재 선택된", "선택한", "이 객체", "이 요소" ALL refer to that one selected element.
- You MUST modify ONLY the selected element. Do NOT touch any other elements in the HTML.
- Find the element by its id in the section HTML, modify only that element, and return the full section HTML with everything else unchanged.
- If NO [Selected element] is provided but the user mentions "선택된/선택한", apply the change to the most likely target element based on context. Never refuse — always make your best attempt.

Image handling:
- For image replacement requests, use our semantic image endpoint: /api/img?q={english-keywords}&w={width}&h={height}
- The q parameter MUST be English keywords — translate Korean/other languages to English first. Examples:
    "하늘" → q=sky    "바다" → q=sea    "노을" → q=sunset    "산" → q=mountain
    "커피" → q=coffee    "카페" → q=cafe    "꽃" → q=flower    "사람" → q=people
    "갈대" → q=reeds    "도시" → q=city    "밤하늘" → q=night+sky
- Multiple keywords: join with "+" (URL-encoded space). Prefer 1–3 specific words.
- Good: q=blue+sky+clouds   q=coffee+cup   q=mountain+sunrise
- Bad:  q=nice+photo   q=안녕   (not English)   q=picture (too vague)
- Example full URL: /api/img?q=sky&w=1920&h=1080
- For background image: background-image: url(/api/img?q=sky&w=1920&h=1080)
- Preserve the original image dimensions (width/height attributes and inline styles)
- IMPORTANT: Only replace the image in the selected element. Leave all other images untouched.
- NEVER use picsum.photos or other random placeholder services — always use /api/img with a specific English keyword.

CRITICAL RULES:
- Output ONLY a JSON object: {"body":"...","header":"...","menu":"...","footer":"...","pageCss":"..."}
- Only include keys you actually modified
- When a selected element is provided, ONLY modify that element — keep everything else identical
- pageCss must be the COMPLETE CSS (existing + your additions merged)
- Prefer CSS changes over HTML changes when possible (e.g. color/font/background changes → pageCss)
- NEVER output explanations, questions, or anything other than JSON
- NEVER ask for clarification — make your best judgment and apply the change
- If you cannot do something, return {} (empty JSON object)
- Do not wrap JSON in markdown code fences`;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  const userId = session.user.id;

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI 기능이 설정되지 않았습니다." },
      { status: 503 }
    );
  }

  const { html, headerHtml, menuHtml, footerHtml, css, pageCss, templateCss, prompt, selectedElement } = await request.json();

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json(
      { error: "프롬프트를 입력하세요." },
      { status: 400 }
    );
  }

  // ─── Credit check & consumption ───────────────────────────────────────────
  // Consume credits up-front so concurrent requests can't double-spend. If the
  // AI call fails for a reason that isn't the user's fault (API error, parse
  // failure, timeout), we refund at the end via `creditsConsumed` + the
  // single `return` choke-point below.
  try {
    await consumeCredits(userId, {
      kind: "AI_EDIT",
      amount: CREDIT_COSTS.AI_EDIT,
      aiModel: CLAUDE_MODEL,
      description: "디자인 에디터 AI 편집",
    });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json(
        {
          error: `크레딧이 부족합니다. (필요: ${err.required} C, 잔액: ${err.balance} C)`,
          code: "INSUFFICIENT_CREDITS",
          balance: err.balance,
          required: err.required,
        },
        { status: 402 }
      );
    }
    console.error("[credits] consume failed:", err);
    return NextResponse.json({ error: "크레딧 처리 중 오류가 발생했습니다." }, { status: 500 });
  }

  // From here on, if we return a non-200 response we should refund.
  const response = await runAiEdit({
    html, headerHtml, menuHtml, footerHtml, css, pageCss, templateCss, prompt, selectedElement,
  });
  if (response.status !== 200) {
    refundCredits(userId, CREDIT_COSTS.AI_EDIT, {
      reason: `AI edit failed (${response.status})`,
    }).catch((e) => console.error("[credits] refund failed:", e));
  }
  return response;
}

interface AiEditInput {
  html?: string; headerHtml?: string; menuHtml?: string; footerHtml?: string;
  css?: string; pageCss?: string; templateCss?: string;
  prompt: string; selectedElement?: string;
}

async function runAiEdit(input: AiEditInput): Promise<NextResponse> {
  const { html, headerHtml, menuHtml, footerHtml, css, pageCss, templateCss, prompt, selectedElement } = input;

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
  if (selectedElement) {
    userMessage += `Selected element:\n${selectedElement}\n\n`;
  }
  userMessage += `Request: ${prompt.trim()}\n\nRespond with JSON only.`;

  console.log("AI edit request:", { selectedElement: selectedElement ? "yes" : "no", promptLen: prompt.length, htmlLen: (html || "").length });

  const apiBody = JSON.stringify({
    model: CLAUDE_MODEL,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [
      { role: "user", content: userMessage },
      { role: "assistant", content: "{" },
    ],
  });

  // ANTHROPIC_API_KEY is validated in the POST handler before this is called.
  const apiHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": ANTHROPIC_API_KEY!,
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

      // Prepend "{" from assistant prefill
      resultText = "{" + resultText;

      // Strip markdown code fences
      resultText = resultText
        .replace(/^```json?\s*\n?/i, "")
        .replace(/\n?```\s*$/i, "")
        .trim();

      // Try to extract JSON object if response contains extra text
      if (!resultText.startsWith("{")) {
        const jsonMatch = resultText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          resultText = jsonMatch[0];
        } else {
          console.error("AI returned non-JSON:", resultText.substring(0, 200));
          return NextResponse.json(
            { error: "AI가 올바른 형식으로 응답하지 않았습니다. 다시 시도해주세요." },
            { status: 502 }
          );
        }
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
