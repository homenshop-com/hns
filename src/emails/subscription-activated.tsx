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

interface SubscriptionActivatedProps {
  siteName: string;
  plan: string;          // "월간 $4.99" | "연간 $49.99"
  nextBillingDate: string; // e.g. "2026년 6월 28일"
  dashboardUrl: string;
}

export default function SubscriptionActivatedEmail({
  siteName,
  plan,
  nextBillingDate,
  dashboardUrl,
}: SubscriptionActivatedProps) {
  return (
    <Html>
      <Head />
      <Preview>{siteName} PayPal 구독이 활성화되었습니다</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={logo}>homeNshop</Heading>
          </Section>

          <Section style={content}>
            <Heading as="h2" style={heading}>
              🎉 구독이 활성화되었습니다
            </Heading>
            <Text style={text}>
              <strong>{siteName}</strong> 사이트의 PayPal 자동결제 구독이 성공적으로 활성화되었습니다.
            </Text>

            <Section style={infoBox}>
              <Text style={infoRow}>
                <strong>플랜:</strong> {plan}
              </Text>
              <Text style={infoRow}>
                <strong>다음 결제일:</strong> {nextBillingDate}
              </Text>
              <Text style={{ ...infoRow, marginBottom: 0 }}>
                <strong>결제 방법:</strong> PayPal 자동결제
              </Text>
            </Section>

            <Text style={text}>
              이제 사이트가 자동으로 갱신됩니다. 언제든지 대시보드에서 구독을 관리하거나 해지할 수 있습니다.
            </Text>

            <Button style={button} href={dashboardUrl}>
              대시보드 바로가기
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            homeNshop · help@homenshop.com
            <br />
            구독 관련 문의는 이메일로 연락해 주세요.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = { backgroundColor: "#f6f9fc", fontFamily: "'Apple SD Gothic Neo', 'Malgun Gothic', Arial, sans-serif" };
const container = { backgroundColor: "#ffffff", margin: "40px auto", padding: "0 0 40px", maxWidth: 560, borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.08)" };
const header = { background: "linear-gradient(135deg, #4a90d9 0%, #357abd 100%)", borderRadius: "8px 8px 0 0", padding: "24px 40px" };
const logo = { color: "#ffffff", fontSize: 22, fontWeight: 700, margin: 0 };
const content = { padding: "32px 40px 0" };
const heading = { color: "#1a1a2e", fontSize: 20, fontWeight: 700, margin: "0 0 16px" };
const text = { color: "#374151", fontSize: 14, lineHeight: "1.7", margin: "0 0 16px" };
const infoBox = { background: "#f0f6ff", borderRadius: 8, padding: "16px 20px", margin: "0 0 20px" };
const infoRow = { color: "#374151", fontSize: 14, margin: "0 0 8px" };
const button = { background: "#4a90d9", borderRadius: 6, color: "#fff", display: "inline-block", fontSize: 14, fontWeight: 600, padding: "12px 24px", textDecoration: "none" };
const hr = { borderColor: "#e5e7eb", margin: "32px 40px 24px" };
const footer = { color: "#9ca3af", fontSize: 12, lineHeight: "1.6", margin: "0 40px", textAlign: "center" as const };
