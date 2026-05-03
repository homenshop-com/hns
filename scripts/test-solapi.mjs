// Quick smoke test for Solapi credentials.
// Usage:
//   cd homenshop-next
//   node --env-file=.env.local scripts/test-solapi.mjs 010xxxxxxxx
//
// Sends a one-line "[homeNshop] 테스트 메시지" to the given recipient. Use
// your own phone — Solapi requires the sender to be a pre-registered
// number on your account, but the recipient can be anyone.
import crypto from "node:crypto";

const to = process.argv[2];
if (!to) {
  console.error("Usage: node scripts/test-solapi.mjs <recipient-phone>");
  process.exit(1);
}

const apiKey = process.env.SOLAPI_API_KEY;
const apiSecret = process.env.SOLAPI_API_SECRET;
const sender = process.env.SOLAPI_SENDER;

if (!apiKey || !apiSecret || !sender) {
  console.error(
    "Missing one of SOLAPI_API_KEY / SOLAPI_API_SECRET / SOLAPI_SENDER. " +
      "Run with: node --env-file=.env.local scripts/test-solapi.mjs <phone>",
  );
  process.exit(1);
}

const date = new Date().toISOString();
const salt = crypto.randomBytes(32).toString("hex");
const signature = crypto
  .createHmac("sha256", apiSecret)
  .update(date + salt)
  .digest("hex");

const auth = `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;

const body = {
  message: {
    to: to.replace(/\D/g, ""),
    from: sender.replace(/\D/g, ""),
    text: "[homeNshop] 테스트 메시지 — Solapi 연결 OK",
    type: "SMS",
  },
};

const res = await fetch("https://api.solapi.com/messages/v4/send", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: auth,
  },
  body: JSON.stringify(body),
});

const data = await res.json().catch(() => ({}));
console.log("HTTP", res.status);
console.log(JSON.stringify(data, null, 2));

if (!res.ok || (data.statusCode && data.statusCode !== "2000")) {
  process.exit(1);
}
