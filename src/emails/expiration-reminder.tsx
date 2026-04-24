import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface ExpirationReminderProps {
  siteName: string;
  shopId: string;
  daysRemaining: number;
  expiresAt: string;
  extendUrl: string;
}

export default function ExpirationReminderEmail({
  siteName,
  shopId,
  daysRemaining,
  expiresAt,
  extendUrl,
}: ExpirationReminderProps) {
  const title =
    daysRemaining <= 0
      ? `[오늘 만료] ${siteName} 체험 기간이 오늘 종료됩니다`
      : `[D-${daysRemaining}] ${siteName} 체험 기간이 ${daysRemaining}일 남았습니다`;

  const headline =
    daysRemaining <= 0
      ? "오늘 체험 기간이 종료됩니다"
      : `체험 기간이 ${daysRemaining}일 남았습니다`;

  return (
    <Html>
      <Head />
      <Preview>{title}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={logo}>homeNshop</Heading>
          </Section>

          <Section style={content}>
            <Heading as="h2" style={heading}>
              {headline}
            </Heading>
            <Text style={paragraph}>
              안녕하세요. 현재 운영 중인 홈페이지 <b>{siteName}</b>
              (<code>{shopId}</code>)의 무료 체험 기간이{" "}
              <b>{new Date(expiresAt).toLocaleDateString("ko-KR")}</b>에
              종료될 예정입니다.
            </Text>
            <Text style={paragraph}>
              만료 이후에는 방문자에게 홈페이지가 노출되지 않으며, 기간 연장 전까지
              대시보드에서만 확인하실 수 있습니다. 연속적인 서비스를 위해 아래
              버튼으로 요금제를 선택해 주세요.
            </Text>

            <Section style={btnWrap}>
              <Button href={extendUrl} style={button}>
                요금제 선택하러 가기
              </Button>
            </Section>

            <Text style={paragraphSmall}>
              요금제 플랜: 1년 66,000원 / 2년 118,800원(10% 할인) / 3년 158,400원(20% 할인)
            </Text>
          </Section>

          <Hr style={hr} />

          <Section style={footer}>
            <Text style={footerText}>
              이 메일은 homenshop.com 홈페이지 만료 안내 자동 발송 메일입니다.
              <br />
              문의: help@homenshop.com · &copy; {new Date().getFullYear()} homeNshop
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main: React.CSSProperties = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", sans-serif',
};

const container: React.CSSProperties = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  maxWidth: "600px",
  borderRadius: "8px",
  overflow: "hidden",
  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
};

const header: React.CSSProperties = {
  backgroundColor: "#1a1a2e",
  padding: "32px 40px",
  textAlign: "center" as const,
};

const logo: React.CSSProperties = {
  color: "#ffffff",
  fontSize: "28px",
  fontWeight: "700",
  margin: "0",
  letterSpacing: "-0.5px",
};

const content: React.CSSProperties = {
  padding: "40px",
};

const heading: React.CSSProperties = {
  color: "#dc2626",
  fontSize: "22px",
  fontWeight: "600",
  margin: "0 0 16px",
};

const paragraph: React.CSSProperties = {
  color: "#4a5568",
  fontSize: "15px",
  lineHeight: "1.7",
  margin: "0 0 12px",
};

const paragraphSmall: React.CSSProperties = {
  color: "#718096",
  fontSize: "13px",
  lineHeight: "1.6",
  margin: "16px 0 0",
};

const btnWrap: React.CSSProperties = {
  margin: "24px 0 8px",
  textAlign: "center" as const,
};

const button: React.CSSProperties = {
  backgroundColor: "#2563eb",
  color: "#fff",
  padding: "12px 28px",
  borderRadius: "8px",
  textDecoration: "none",
  fontWeight: 600,
  fontSize: "14px",
  display: "inline-block",
};

const hr: React.CSSProperties = {
  borderColor: "#e2e8f0",
  margin: "0",
};

const footer: React.CSSProperties = {
  padding: "24px 40px",
};

const footerText: React.CSSProperties = {
  color: "#a0aec0",
  fontSize: "12px",
  textAlign: "center" as const,
  margin: "0",
  lineHeight: "1.6",
};
