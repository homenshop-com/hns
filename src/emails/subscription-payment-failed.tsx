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

interface SubscriptionPaymentFailedProps {
  siteName: string;
  retryUrl: string;   // link to PayPal subscription management or extend page
}

export default function SubscriptionPaymentFailedEmail({
  siteName,
  retryUrl,
}: SubscriptionPaymentFailedProps) {
  return (
    <Html>
      <Head />
      <Preview>[홈앤샵] {siteName} PayPal 결제 실패 — 확인이 필요합니다</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={warningHeader}>
            <Heading style={logo}>homeNshop</Heading>
          </Section>

          <Section style={content}>
            <Heading as="h2" style={heading}>
              ⚠️ 결제에 실패했습니다
            </Heading>
            <Text style={text}>
              <strong>{siteName}</strong> 사이트의 PayPal 자동결제가 실패했습니다.
            </Text>

            <Section style={alertBox}>
              <Text style={alertText}>
                <strong>3일 이내</strong>에 결제 수단을 업데이트하지 않으면 사이트가 일시 비활성화될 수 있습니다.
              </Text>
            </Section>

            <Text style={text}>
              아래 방법으로 해결해 주세요:
            </Text>
            <Text style={listItem}>1. PayPal 계정의 결제 수단(카드)을 확인하세요</Text>
            <Text style={listItem}>2. 유효 기간이 지난 카드가 등록되어 있다면 업데이트해 주세요</Text>
            <Text style={listItem}>3. 문제가 해결되면 PayPal에서 자동으로 재시도합니다</Text>

            <Button style={button} href={retryUrl}>
              대시보드에서 확인
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            homeNshop · help@homenshop.com
            <br />
            결제 문의: help@homenshop.com
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = { backgroundColor: "#f6f9fc", fontFamily: "'Apple SD Gothic Neo', 'Malgun Gothic', Arial, sans-serif" };
const container = { backgroundColor: "#ffffff", margin: "40px auto", padding: "0 0 40px", maxWidth: 560, borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.08)" };
const warningHeader = { background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)", borderRadius: "8px 8px 0 0", padding: "24px 40px" };
const logo = { color: "#ffffff", fontSize: 22, fontWeight: 700, margin: 0 };
const content = { padding: "32px 40px 0" };
const heading = { color: "#1a1a2e", fontSize: 20, fontWeight: 700, margin: "0 0 16px" };
const text = { color: "#374151", fontSize: 14, lineHeight: "1.7", margin: "0 0 12px" };
const alertBox = { background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 8, padding: "14px 18px", margin: "0 0 20px" };
const alertText = { color: "#92400e", fontSize: 14, lineHeight: "1.6", margin: 0 };
const listItem = { color: "#374151", fontSize: 14, lineHeight: "1.7", margin: "0 0 4px", paddingLeft: 8 };
const button = { background: "#f59e0b", borderRadius: 6, color: "#fff", display: "inline-block", fontSize: 14, fontWeight: 600, padding: "12px 24px", textDecoration: "none", marginTop: 16 };
const hr = { borderColor: "#e5e7eb", margin: "32px 40px 24px" };
const footer = { color: "#9ca3af", fontSize: 12, lineHeight: "1.6", margin: "0 40px", textAlign: "center" as const };
