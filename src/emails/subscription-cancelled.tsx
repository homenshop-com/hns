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

interface SubscriptionCancelledProps {
  siteName: string;
  accessUntil: string;   // e.g. "2026년 6월 28일"
  resubscribeUrl: string;
}

export default function SubscriptionCancelledEmail({
  siteName,
  accessUntil,
  resubscribeUrl,
}: SubscriptionCancelledProps) {
  return (
    <Html>
      <Head />
      <Preview>[홈앤샵] {siteName} 구독 해지 완료</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={logo}>homeNshop</Heading>
          </Section>

          <Section style={content}>
            <Heading as="h2" style={heading}>
              구독 해지가 완료되었습니다
            </Heading>
            <Text style={text}>
              <strong>{siteName}</strong> 사이트의 PayPal 자동결제 구독이 해지 처리되었습니다.
            </Text>

            <Section style={infoBox}>
              <Text style={infoText}>
                현재 결제 기간(<strong>{accessUntil}</strong>)까지는 정상적으로 이용하실 수 있습니다.
                이후 자동갱신은 이루어지지 않습니다.
              </Text>
            </Section>

            <Text style={text}>
              마음이 바뀌셨다면 아래 버튼을 눌러 다시 구독하실 수 있습니다.
            </Text>

            <Button style={button} href={resubscribeUrl}>
              다시 구독하기
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            homeNshop · help@homenshop.com
            <br />
            이용해 주셔서 감사합니다.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = { backgroundColor: "#f6f9fc", fontFamily: "'Apple SD Gothic Neo', 'Malgun Gothic', Arial, sans-serif" };
const container = { backgroundColor: "#ffffff", margin: "40px auto", padding: "0 0 40px", maxWidth: 560, borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.08)" };
const header = { background: "linear-gradient(135deg, #6b7280 0%, #4b5563 100%)", borderRadius: "8px 8px 0 0", padding: "24px 40px" };
const logo = { color: "#ffffff", fontSize: 22, fontWeight: 700, margin: 0 };
const content = { padding: "32px 40px 0" };
const heading = { color: "#1a1a2e", fontSize: 20, fontWeight: 700, margin: "0 0 16px" };
const text = { color: "#374151", fontSize: 14, lineHeight: "1.7", margin: "0 0 16px" };
const infoBox = { background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "14px 18px", margin: "0 0 20px" };
const infoText = { color: "#374151", fontSize: 14, lineHeight: "1.6", margin: 0 };
const button = { background: "#4a90d9", borderRadius: 6, color: "#fff", display: "inline-block", fontSize: 14, fontWeight: 600, padding: "12px 24px", textDecoration: "none" };
const hr = { borderColor: "#e5e7eb", margin: "32px 40px 24px" };
const footer = { color: "#9ca3af", fontSize: 12, lineHeight: "1.6", margin: "0 40px", textAlign: "center" as const };
