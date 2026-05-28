import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Column,
  Section,
  Text,
} from "@react-email/components";

interface SubscriptionReceiptProps {
  siteName: string;
  amount: string;        // e.g. "$4.99" or "$49.99"
  periodStart: string;   // e.g. "2026년 5월 28일"
  periodEnd: string;     // e.g. "2026년 6월 28일"
  orderNumber: string;
}

export default function SubscriptionReceiptEmail({
  siteName,
  amount,
  periodStart,
  periodEnd,
  orderNumber,
}: SubscriptionReceiptProps) {
  return (
    <Html>
      <Head />
      <Preview>[homeNshop] {siteName} 결제가 완료되었습니다 — {amount}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={logo}>homeNshop</Heading>
          </Section>

          <Section style={content}>
            <Heading as="h2" style={heading}>
              결제가 완료되었습니다
            </Heading>
            <Text style={text}>
              <strong>{siteName}</strong> 사이트의 PayPal 구독 결제가 성공적으로 처리되었습니다.
            </Text>

            {/* Receipt table */}
            <Section style={receiptBox}>
              <Row style={receiptRow}>
                <Column style={receiptLabel}>사이트</Column>
                <Column style={receiptValue}>{siteName}</Column>
              </Row>
              <Row style={receiptRow}>
                <Column style={receiptLabel}>결제 금액</Column>
                <Column style={{ ...receiptValue, fontWeight: 700, color: "#4a90d9" }}>{amount}</Column>
              </Row>
              <Row style={receiptRow}>
                <Column style={receiptLabel}>이용 기간</Column>
                <Column style={receiptValue}>{periodStart} ~ {periodEnd}</Column>
              </Row>
              <Row>
                <Column style={receiptLabel}>주문번호</Column>
                <Column style={{ ...receiptValue, fontFamily: "monospace", fontSize: 12 }}>{orderNumber}</Column>
              </Row>
            </Section>

            <Text style={text}>
              다음 결제는 <strong>{periodEnd}</strong>에 자동으로 처리됩니다.
              구독 해지는 대시보드의 호스팅 설정에서 언제든지 가능합니다.
            </Text>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            homeNshop · help@homenshop.com
            <br />
            이 이메일은 자동발송입니다. 문의는 이메일로 연락해 주세요.
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
const receiptBox = { background: "#f8fafc", borderRadius: 8, padding: "16px 20px", margin: "0 0 20px" };
const receiptRow = { borderBottom: "1px solid #e5e7eb", paddingBottom: 8, marginBottom: 8 };
const receiptLabel = { color: "#6b7280", fontSize: 13, width: "40%" };
const receiptValue = { color: "#111827", fontSize: 13 };
const hr = { borderColor: "#e5e7eb", margin: "32px 40px 24px" };
const footer = { color: "#9ca3af", fontSize: 12, lineHeight: "1.6", margin: "0 40px", textAlign: "center" as const };
