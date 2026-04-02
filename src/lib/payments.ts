const TOSS_API_URL = "https://api.tosspayments.com/v1";

function getSecretKey(): string {
  const key = process.env.TOSS_SECRET_KEY;
  if (!key) {
    throw new Error("TOSS_SECRET_KEY 환경변수가 설정되지 않았습니다.");
  }
  return key;
}

function getAuthHeader(): string {
  const encoded = Buffer.from(`${getSecretKey()}:`).toString("base64");
  return `Basic ${encoded}`;
}

export async function confirmPayment(
  paymentKey: string,
  orderId: string,
  amount: number
) {
  const res = await fetch(`${TOSS_API_URL}/payments/confirm`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });
  return res.json();
}

export async function cancelPayment(
  paymentKey: string,
  cancelReason: string
) {
  const res = await fetch(
    `${TOSS_API_URL}/payments/${paymentKey}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: getAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cancelReason }),
    }
  );
  return res.json();
}

export async function getPayment(paymentKey: string) {
  const res = await fetch(`${TOSS_API_URL}/payments/${paymentKey}`, {
    headers: { Authorization: getAuthHeader() },
  });
  return res.json();
}
