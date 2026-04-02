import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface WelcomeEmailProps {
  name: string;
}

export default function WelcomeEmail({ name }: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>홈앤샵에 오신 것을 환영합니다!</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={logo}>Homenshop</Heading>
          </Section>

          <Section style={content}>
            <Heading as="h2" style={heading}>
              환영합니다, {name}님!
            </Heading>
            <Text style={paragraph}>
              홈앤샵에 가입해 주셔서 감사합니다.
            </Text>
            <Text style={paragraph}>
              이제 나만의 온라인 쇼핑몰을 만들고 관리할 수 있습니다. 대시보드에서
              사이트를 생성하고, 상품을 등록하고, 주문을 관리해 보세요.
            </Text>
            <Text style={paragraph}>
              궁금한 점이 있으시면 언제든지 고객센터로 문의해 주세요.
            </Text>
          </Section>

          <Hr style={hr} />

          <Section style={footer}>
            <Text style={footerText}>
              &copy; {new Date().getFullYear()} Homenshop. All rights reserved.
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
  margin: "0 0 12px",
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
};
