/**
 * Heuristic spam classifier for inbound emails.
 *
 * Returns a 0-100 score and a list of human-readable reasons (Korean).
 * No external API — pure pattern matching on sender, subject, and body.
 *
 * Thresholds:
 *   score >= AUTO_SPAM_THRESHOLD (60) → caller should auto-flag as spam
 *   score >= SUSPECT_THRESHOLD   (30) → show "스팸 의심" warning badge
 *
 * Reasons reference the offending pattern (e.g., "브랜드 사칭: Wix") so the
 * operator can audit why an email was scored.
 */

export const AUTO_SPAM_THRESHOLD = 60;
export const SUSPECT_THRESHOLD = 30;

export interface SpamInput {
  fromEmail: string;
  fromName?: string | null;
  toEmail?: string | null;
  subject?: string | null;
  text?: string | null;
  html?: string | null;
}

export interface SpamResult {
  score: number;
  reasons: string[];
}

const BRAND_KEYWORDS: Array<{ brand: string; domains: string[] }> = [
  { brand: "Wix", domains: ["wix.com"] },
  { brand: "PayPal", domains: ["paypal.com"] },
  { brand: "Microsoft", domains: ["microsoft.com", "outlook.com", "office.com"] },
  { brand: "Apple", domains: ["apple.com", "icloud.com"] },
  { brand: "Meta", domains: ["meta.com", "facebook.com", "fb.com"] },
  { brand: "Facebook", domains: ["facebook.com", "fb.com", "meta.com"] },
  { brand: "Instagram", domains: ["instagram.com", "meta.com"] },
  { brand: "Amazon", domains: ["amazon.com", "amazon.co.kr", "amazonaws.com"] },
  { brand: "Google", domains: ["google.com", "youtube.com", "gmail.com"] },
  { brand: "Netflix", domains: ["netflix.com"] },
  { brand: "DHL", domains: ["dhl.com"] },
  { brand: "FedEx", domains: ["fedex.com"] },
  { brand: "Coupang", domains: ["coupang.com"] },
  { brand: "Naver", domains: ["naver.com", "navercorp.com"] },
  { brand: "Kakao", domains: ["kakao.com", "kakaocorp.com"] },
  { brand: "Shopify", domains: ["shopify.com"] },
  { brand: "Squarespace", domains: ["squarespace.com"] },
];

const PHISHING_PHRASES_EN = [
  "subscription renewal",
  "subscription has expired",
  "subscription expired",
  "your account has been suspended",
  "account suspended",
  "account locked",
  "verify your account",
  "confirm your identity",
  "unusual sign-in",
  "unusual login",
  "click below to renew",
  "renew now",
  "update your billing",
  "update billing information",
  "payment failed",
  "payment was declined",
  "we could not process",
  "release pending message",
  "release your message",
  "winner",
  "you have won",
  "claim your prize",
  "limited time offer",
  "act now",
  "final notice",
  "last warning",
  "your domain will expire",
  "domain renewal",
  "invoice attached",
  "wire transfer",
  "bitcoin",
  "crypto wallet",
  "kyc verification required",
  "release of funds",
];

const PHISHING_PHRASES_KO = [
  "구독이 만료",
  "계정이 정지",
  "비밀번호 확인",
  "본인 인증",
  "결제 실패",
  "당첨되셨습니다",
  "지금 갱신",
  "지금 결제",
  "긴급 안내",
  "도메인이 만료",
];

const URGENCY_PATTERNS = [
  /within\s+(?:the\s+next\s+)?\d+\s*(?:hour|day)/i,
  /expir(?:e|es|ed|ing)\s+(?:today|tomorrow|in\s+\d+)/i,
  /\b24\s*hours?\b/i,
  /\b48\s*hours?\b/i,
  /(?:final|last)\s+(?:notice|warning|reminder)/i,
];

const SUSPICIOUS_TLDS = [
  ".xyz",
  ".top",
  ".click",
  ".loan",
  ".zip",
  ".mov",
  ".country",
  ".biz",
  ".info",
  ".online",
  ".site",
  ".buzz",
  ".rest",
  ".monster",
  ".surf",
  ".cfd",
];

const FREE_MAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "naver.com",
  "daum.net",
  "nate.com",
  "aol.com",
  "icloud.com",
  "yandex.com",
  "mail.ru",
  "proton.me",
  "protonmail.com",
]);

const SUSPICIOUS_LOCAL_PARTS = new Set([
  "support",
  "noreply",
  "no-reply",
  "billing",
  "security",
  "admin",
  "help",
  "service",
  "notification",
  "notifications",
  "info",
]);

function getDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase().trim() : "";
}

function getLocalPart(email: string): string {
  const at = email.indexOf("@");
  return (at >= 0 ? email.slice(0, at) : email).toLowerCase().trim();
}

function getRootDomain(domain: string): string {
  const parts = domain.split(".");
  if (parts.length <= 2) return domain;
  return parts.slice(-2).join(".");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLinks(html: string): string[] {
  const out: string[] = [];
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1].startsWith("http")) out.push(m[1]);
  }
  return out;
}

export function classifySpam(input: SpamInput): SpamResult {
  const reasons: string[] = [];
  let score = 0;

  const fromEmail = (input.fromEmail || "").toLowerCase().trim();
  const fromName = (input.fromName || "").trim();
  const subject = (input.subject || "").trim();
  const text = input.text || "";
  const htmlRaw = input.html || "";
  const htmlText = htmlRaw ? stripHtml(htmlRaw) : "";
  const body = [subject, text, htmlText].join("\n");
  const bodyLower = body.toLowerCase();

  const fromDomain = getDomain(fromEmail);
  const fromRoot = getRootDomain(fromDomain);
  const fromLocal = getLocalPart(fromEmail);

  if (!fromEmail || !fromDomain) {
    reasons.push("발신자 주소 없음");
    score += 50;
    return { score: Math.min(100, score), reasons };
  }

  // Brand impersonation: brand mentioned in name/subject/body but sender
  // domain is NOT one of the brand's legit domains.
  const nameLower = fromName.toLowerCase();
  for (const { brand, domains } of BRAND_KEYWORDS) {
    const lower = brand.toLowerCase();
    const mentioned =
      nameLower.includes(lower) ||
      subject.toLowerCase().includes(lower) ||
      bodyLower.includes(lower);
    if (!mentioned) continue;
    const matchesLegit = domains.some(
      (d) => fromDomain === d || fromDomain.endsWith("." + d)
    );
    if (!matchesLegit) {
      reasons.push(`브랜드 사칭 의심: ${brand} 언급 / 발신 ${fromDomain}`);
      score += 35;
      break;
    }
  }

  // From-name email vs sender domain mismatch (display name shows another email)
  const nameEmailMatch = fromName.match(/[\w.+-]+@([\w.-]+)/);
  if (nameEmailMatch) {
    const nameDomain = nameEmailMatch[1].toLowerCase();
    if (nameDomain !== fromDomain && getRootDomain(nameDomain) !== fromRoot) {
      reasons.push(`발신자 이름의 도메인 불일치: ${nameDomain} vs ${fromDomain}`);
      score += 20;
    }
  }

  // Free-mail sender with operational-looking local part (support@gmail.com)
  if (
    FREE_MAIL_DOMAINS.has(fromDomain) &&
    SUSPICIOUS_LOCAL_PARTS.has(fromLocal)
  ) {
    reasons.push(`프리메일에서 운영 계정 사칭: ${fromLocal}@${fromDomain}`);
    score += 25;
  }

  // Suspicious TLD on sender
  for (const tld of SUSPICIOUS_TLDS) {
    if (fromDomain.endsWith(tld)) {
      reasons.push(`의심 TLD 발신: ${tld}`);
      score += 15;
      break;
    }
  }

  // Phishing phrases (EN + KO)
  let phishingHits = 0;
  for (const p of PHISHING_PHRASES_EN) {
    if (bodyLower.includes(p)) phishingHits++;
  }
  for (const p of PHISHING_PHRASES_KO) {
    if (body.includes(p)) phishingHits++;
  }
  if (phishingHits >= 3) {
    reasons.push(`피싱 의심 표현 다수 (${phishingHits}건)`);
    score += 30;
  } else if (phishingHits === 2) {
    reasons.push("피싱 의심 표현 2건");
    score += 18;
  } else if (phishingHits === 1) {
    reasons.push("피싱 의심 표현 1건");
    score += 8;
  }

  // Urgency
  let urgencyHits = 0;
  for (const re of URGENCY_PATTERNS) {
    if (re.test(body)) urgencyHits++;
  }
  if (urgencyHits >= 2) {
    reasons.push("긴급성 강조 표현 다수");
    score += 12;
  } else if (urgencyHits === 1) {
    reasons.push("긴급성 강조 표현");
    score += 6;
  }

  // HTML link analysis: many links to mismatched domain
  if (htmlRaw) {
    const links = extractLinks(htmlRaw);
    if (links.length > 0) {
      const linkDomains = new Set<string>();
      const suspiciousLinkDomains = new Set<string>();
      for (const link of links) {
        try {
          const u = new URL(link);
          const d = u.hostname.toLowerCase();
          linkDomains.add(d);
          for (const tld of SUSPICIOUS_TLDS) {
            if (d.endsWith(tld)) suspiciousLinkDomains.add(d);
          }
        } catch {
          /* ignore */
        }
      }
      if (suspiciousLinkDomains.size > 0) {
        const sample = Array.from(suspiciousLinkDomains).slice(0, 2).join(", ");
        reasons.push(`의심 TLD 링크: ${sample}`);
        score += 20;
      }
      // CTA button text suggesting payment/renewal
      if (
        /(?:renew|update\s+billing|verify\s+account|claim\s+now|view\s+invoice)/i.test(
          htmlRaw
        )
      ) {
        reasons.push("결제·갱신·인증 유도 버튼");
        score += 10;
      }
    }
  }

  // All caps subject (>= 50% letters uppercase, length >= 20)
  if (subject.length >= 20) {
    const letters = subject.replace(/[^A-Za-z]/g, "");
    if (letters.length >= 10) {
      const upper = letters.replace(/[^A-Z]/g, "");
      if (upper.length / letters.length >= 0.7) {
        reasons.push("제목 대문자 과다");
        score += 8;
      }
    }
  }

  // Excessive punctuation in subject
  if ((subject.match(/[!?$€¥₩]/g) || []).length >= 3) {
    reasons.push("제목 특수문자 과다");
    score += 5;
  }

  // Bitcoin / wallet addresses in body
  if (
    /\b(?:bc1|bitcoin|btc\s+wallet|usdt\s+wallet|crypto\s+wallet)\b/i.test(body)
  ) {
    reasons.push("암호화폐 관련 단어");
    score += 20;
  }

  // Cap and dedupe reasons preserving order
  const seen = new Set<string>();
  const uniqueReasons = reasons.filter((r) => {
    if (seen.has(r)) return false;
    seen.add(r);
    return true;
  });

  return {
    score: Math.min(100, score),
    reasons: uniqueReasons,
  };
}
