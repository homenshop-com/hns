import { Resend } from "resend";
import { render } from "@react-email/components";
import WelcomeEmail from "@/emails/welcome";
import OrderConfirmationEmail, {
  type OrderItem,
} from "@/emails/order-confirmation";
import PasswordResetEmail from "@/emails/password-reset";
import VerifyEmail from "@/emails/verify-email";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

const FROM_ADDRESS = "homeNshop <noreply@homenshop.com>";

export interface OrderEmailData {
  orderNumber: string;
  items: OrderItem[];
  totalAmount: number;
}

export async function sendWelcomeEmail(
  to: string,
  name: string
): Promise<void> {
  try {
    const html = await render(WelcomeEmail({ name }));

    const { error } = await getResend().emails.send({
      from: FROM_ADDRESS,
      to,
      subject: "홈앤샵에 오신 것을 환영합니다!",
      html,
    });

    if (error) {
      console.error("Failed to send welcome email:", error);
      return;
    }

    console.log(`Welcome email sent to ${to}`);
  } catch (err) {
    console.error("Error sending welcome email:", err);
  }
}

export async function sendOrderConfirmationEmail(
  to: string,
  order: OrderEmailData
): Promise<void> {
  try {
    const html = await render(
      OrderConfirmationEmail({
        orderNumber: order.orderNumber,
        items: order.items,
        totalAmount: order.totalAmount,
      })
    );

    const { error } = await getResend().emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `주문 확인 - ${order.orderNumber}`,
      html,
    });

    if (error) {
      console.error("Failed to send order confirmation email:", error);
      return;
    }

    console.log(`Order confirmation email sent to ${to} for ${order.orderNumber}`);
  } catch (err) {
    console.error("Error sending order confirmation email:", err);
  }
}

export async function sendVerificationEmail(
  to: string,
  verifyLink: string,
  name?: string
): Promise<void> {
  try {
    const html = await render(VerifyEmail({ verifyLink, name }));

    const { error } = await getResend().emails.send({
      from: FROM_ADDRESS,
      to,
      subject: "이메일 인증 안내 - homeNshop",
      html,
    });

    if (error) {
      console.error("Failed to send verification email:", error);
      return;
    }

    console.log(`Verification email sent to ${to}`);
  } catch (err) {
    console.error("Error sending verification email:", err);
  }
}

export async function sendPasswordResetEmail(
  to: string,
  resetLink: string
): Promise<void> {
  try {
    const html = await render(PasswordResetEmail({ resetLink }));

    const { error } = await getResend().emails.send({
      from: FROM_ADDRESS,
      to,
      subject: "비밀번호 재설정 안내 - homeNshop",
      html,
    });

    if (error) {
      console.error("Failed to send password reset email:", error);
      return;
    }

    console.log(`Password reset email sent to ${to}`);
  } catch (err) {
    console.error("Error sending password reset email:", err);
  }
}
