import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

interface OrderConfirmationEmailProps {
  orderNumber: string;
  items: OrderItem[];
  totalAmount: number;
}

export default function OrderConfirmationEmail({
  orderNumber,
  items,
  totalAmount,
}: OrderConfirmationEmailProps) {
  const formatPrice = (price: number) =>
    price.toLocaleString("ko-KR") + "원";

  return (
    <Html>
      <Head />
      <Preview>주문이 완료되었습니다 - {orderNumber}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={logo}>homeNshop</Heading>
          </Section>

          <Section style={content}>
            <Heading as="h2" style={heading}>
              주문이 완료되었습니다
            </Heading>
            <Text style={paragraph}>
              주문해 주셔서 감사합니다. 아래 주문 내역을 확인해 주세요.
            </Text>

            <Section style={orderInfoBox}>
              <Text style={orderNumberLabel}>주문번호</Text>
              <Text style={orderNumberValue}>{orderNumber}</Text>
            </Section>

            <Section style={tableSection}>
              <Row style={tableHeader}>
                <Column style={tableHeaderCell}>상품명</Column>
                <Column style={tableHeaderCellRight}>수량</Column>
                <Column style={tableHeaderCellRight}>금액</Column>
              </Row>
              {items.map((item, index) => (
                <Row key={index} style={tableRow}>
                  <Column style={tableCell}>{item.name}</Column>
                  <Column style={tableCellRight}>{item.quantity}개</Column>
                  <Column style={tableCellRight}>
                    {formatPrice(item.price * item.quantity)}
                  </Column>
                </Row>
              ))}
            </Section>

            <Hr style={hr} />

            <Row style={totalRow}>
              <Column style={totalLabel}>총 결제금액</Column>
              <Column style={totalValue}>{formatPrice(totalAmount)}</Column>
            </Row>

            <Text style={noteParagraph}>
              주문 상태는 마이페이지에서 확인하실 수 있습니다.
            </Text>
          </Section>

          <Hr style={hr} />

          <Section style={footer}>
            <Text style={footerText}>
              &copy; {new Date().getFullYear()} homeNshop. All rights reserved.
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
  color: "#1a1a2e",
  fontSize: "22px",
  fontWeight: "600",
  margin: "0 0 16px",
};

const paragraph: React.CSSProperties = {
  color: "#4a5568",
  fontSize: "15px",
  lineHeight: "1.7",
  margin: "0 0 24px",
};

const orderInfoBox: React.CSSProperties = {
  backgroundColor: "#f7fafc",
  borderRadius: "6px",
  padding: "16px 20px",
  marginBottom: "24px",
};

const orderNumberLabel: React.CSSProperties = {
  color: "#a0aec0",
  fontSize: "12px",
  fontWeight: "600",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  margin: "0 0 4px",
};

const orderNumberValue: React.CSSProperties = {
  color: "#1a1a2e",
  fontSize: "18px",
  fontWeight: "700",
  margin: "0",
};

const tableSection: React.CSSProperties = {
  marginBottom: "16px",
};

const tableHeader: React.CSSProperties = {
  borderBottom: "2px solid #e2e8f0",
  paddingBottom: "8px",
  marginBottom: "8px",
};

const tableHeaderCell: React.CSSProperties = {
  color: "#718096",
  fontSize: "13px",
  fontWeight: "600",
  textAlign: "left" as const,
  padding: "8px 0",
};

const tableHeaderCellRight: React.CSSProperties = {
  ...tableHeaderCell,
  textAlign: "right" as const,
};

const tableRow: React.CSSProperties = {
  borderBottom: "1px solid #f0f0f0",
};

const tableCell: React.CSSProperties = {
  color: "#2d3748",
  fontSize: "14px",
  padding: "10px 0",
  textAlign: "left" as const,
};

const tableCellRight: React.CSSProperties = {
  ...tableCell,
  textAlign: "right" as const,
};

const hr: React.CSSProperties = {
  borderColor: "#e2e8f0",
  margin: "0",
};

const totalRow: React.CSSProperties = {
  padding: "16px 0",
};

const totalLabel: React.CSSProperties = {
  color: "#1a1a2e",
  fontSize: "16px",
  fontWeight: "600",
  textAlign: "left" as const,
};

const totalValue: React.CSSProperties = {
  color: "#1a1a2e",
  fontSize: "20px",
  fontWeight: "700",
  textAlign: "right" as const,
};

const noteParagraph: React.CSSProperties = {
  color: "#718096",
  fontSize: "13px",
  lineHeight: "1.6",
  margin: "16px 0 0",
};

const footer: React.CSSProperties = {
  padding: "24px 40px",
};

const footerText: React.CSSProperties = {
  color: "#a0aec0",
  fontSize: "12px",
  textAlign: "center" as const,
  margin: "0",
};
