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

interface PasswordResetEmailProps {
  resetLink: string;
}

export default function PasswordResetEmail({
  resetLink,
}: PasswordResetEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>비밀번호 재설정 안내</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={logo}>homeNshop</Heading>
          </Section>

          <Section style={content}>
            <Heading as="h2" style={heading}>
              비밀번호 재설정
            </Heading>
            <Text style={paragraph}>
              비밀번호 재설정을 요청하셨습니다. 아래 버튼을 클릭하여 새로운
              비밀번호를 설정해 주세요.
            </Text>

            <Section style={buttonContainer}>
              <Button href={resetLink} style={button}>
                비밀번호 재설정하기
              </Button>
            </Section>

            <Text style={noteParagraph}>
              이 링크는 1시간 동안 유효합니다. 본인이 요청하지 않으셨다면 이
              이메일을 무시해 주세요.
            </Text>

            <Section style={linkBox}>
              <Text style={linkLabel}>
                버튼이 작동하지 않으면 아래 링크를 브라우저에 직접 입력해 주세요:
              </Text>
              <Text style={linkText}>{resetLink}</Text>
            </Section>
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

const buttonContainer: React.CSSProperties = {
  textAlign: "center" as const,
  margin: "32px 0",
};

const button: React.CSSProperties = {
  backgroundColor: "#1a1a2e",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "16px",
  fontWeight: "600",
  textDecoration: "none",
  textAlign: "center" as const,
  padding: "14px 32px",
  display: "inline-block",
};

const noteParagraph: React.CSSProperties = {
  color: "#718096",
  fontSize: "13px",
  lineHeight: "1.6",
  margin: "0 0 24px",
};

const linkBox: React.CSSProperties = {
  backgroundColor: "#f7fafc",
  borderRadius: "6px",
  padding: "16px 20px",
};

const linkLabel: React.CSSProperties = {
  color: "#718096",
  fontSize: "12px",
  margin: "0 0 8px",
};

const linkText: React.CSSProperties = {
  color: "#4a5568",
  fontSize: "13px",
  wordBreak: "break-all" as const,
  margin: "0",
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
