import { Resend } from "resend";
import { render } from "@react-email/components";
import WelcomeEmail from "@/emails/welcome";
import OrderConfirmationEmail, {
  type OrderItem,
} from "@/emails/order-confirmation";
import PasswordResetEmail from "@/emails/password-reset";
import VerifyEmail from "@/emails/verify-email";
import ExpirationReminderEmail from "@/emails/expiration-reminder";

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

export async function sendExpirationReminderEmail(
  to: string,
  data: {
    siteName: string;
    shopId: string;
    daysRemaining: number;
    expiresAt: string;
    extendUrl: string;
  }
): Promise<boolean> {
  try {
    const html = await render(ExpirationReminderEmail(data));
    const subject =
      data.daysRemaining <= 0
        ? `[오늘 만료] ${data.siteName} 체험 기간이 오늘 종료됩니다`
        : `[D-${data.daysRemaining}] ${data.siteName} 체험 기간 ${data.daysRemaining}일 남음`;

    const { error } = await getResend().emails.send({
      from: FROM_ADDRESS,
      to,
      subject,
      html,
    });

    if (error) {
      console.error("Failed to send expiration reminder:", error);
      return false;
    }
    console.log(`Expiration reminder sent to ${to} (D-${data.daysRemaining})`);
    return true;
  } catch (err) {
    console.error("Error sending expiration reminder:", err);
    return false;
  }
}
