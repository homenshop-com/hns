import { Resend } from "resend";
import { render } from "@react-email/components";
import WelcomeEmail from "@/emails/welcome";
import OrderConfirmationEmail, {
  type OrderItem,
} from "@/emails/order-confirmation";
import PasswordResetEmail from "@/emails/password-reset";
import VerifyEmail from "@/emails/verify-email";
import ExpirationReminderEmail from "@/emails/expiration-reminder";
import SubscriptionActivatedEmail from "@/emails/subscription-activated";
import SubscriptionReceiptEmail from "@/emails/subscription-receipt";
import SubscriptionPaymentFailedEmail from "@/emails/subscription-payment-failed";
import SubscriptionCancelledEmail from "@/emails/subscription-cancelled";

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

// ─── PayPal Subscription lifecycle emails ────────────────────────────────────

export async function sendSubscriptionActivatedEmail(
  to: string,
  data: {
    siteName: string;
    plan: string;
    nextBillingDate: string;
    dashboardUrl: string;
  }
): Promise<void> {
  try {
    const html = await render(SubscriptionActivatedEmail(data));
    const { error } = await getResend().emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `[홈앤샵] ${data.siteName} PayPal 구독 활성화 완료`,
      html,
    });
    if (error) console.error("Failed to send subscription activated email:", error);
  } catch (err) {
    console.error("Error sending subscription activated email:", err);
  }
}

export async function sendSubscriptionReceiptEmail(
  to: string,
  data: {
    siteName: string;
    amount: string;
    periodStart: string;
    periodEnd: string;
    orderNumber: string;
  }
): Promise<void> {
  try {
    const html = await render(SubscriptionReceiptEmail(data));
    const { error } = await getResend().emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `[홈앤샵] ${data.siteName} 결제 완료 — ${data.amount}`,
      html,
    });
    if (error) console.error("Failed to send subscription receipt email:", error);
  } catch (err) {
    console.error("Error sending subscription receipt email:", err);
  }
}

export async function sendSubscriptionPaymentFailedEmail(
  to: string,
  data: {
    siteName: string;
    retryUrl: string;
  }
): Promise<void> {
  try {
    const html = await render(SubscriptionPaymentFailedEmail(data));
    const { error } = await getResend().emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `[홈앤샵] ${data.siteName} — PayPal 결제 실패 안내`,
      html,
    });
    if (error) console.error("Failed to send payment failed email:", error);
  } catch (err) {
    console.error("Error sending payment failed email:", err);
  }
}

export async function sendSubscriptionCancelledEmail(
  to: string,
  data: {
    siteName: string;
    accessUntil: string;
    resubscribeUrl: string;
  }
): Promise<void> {
  try {
    const html = await render(SubscriptionCancelledEmail(data));
    const { error } = await getResend().emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `[홈앤샵] ${data.siteName} — 구독 해지 완료`,
      html,
    });
    if (error) console.error("Failed to send subscription cancelled email:", error);
  } catch (err) {
    console.error("Error sending subscription cancelled email:", err);
  }
}
