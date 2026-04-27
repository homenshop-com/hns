import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

/**
 * AES-256-GCM symmetric encryption for storing third-party credentials
 * (marketplace API tokens, refresh tokens, vendor IDs) in the database.
 *
 * Why GCM: gives us authenticated encryption (tamper detection via auth
 * tag) without a separate HMAC step. Each encryption uses a fresh random
 * 12-byte IV, so identical plaintexts produce different ciphertexts.
 *
 * Format on disk (single string column, base64url-encoded):
 *   v1:<iv-b64>:<authTag-b64>:<ciphertext-b64>
 * The "v1" prefix lets us rotate the algorithm later without breaking
 * existing rows.
 *
 * Key handling:
 *   - Master key comes from process.env.SECRETS_KEY (32+ chars).
 *   - Per-process derived via scrypt; we cache the derived key in module
 *     scope, so the cost is paid once per process boot.
 *   - If SECRETS_KEY is missing in production we throw — refusing to
 *     encrypt is much safer than silently using a weak/empty key. In
 *     development we fall back to a fixed dev key so local work is easy.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard
const SALT = Buffer.from("homenshop-secrets-v1"); // public, just for KDF domain separation
const VERSION = "v1";

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.SECRETS_KEY;
  if (!raw || raw.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SECRETS_KEY is required in production (32+ chars). Refusing to encrypt with a weak key.",
      );
    }
    console.warn(
      "[secrets] SECRETS_KEY not set — using a development fallback. Do NOT use this in prod.",
    );
  }

  const seed = raw && raw.length >= 32
    ? raw
    : "DEV_INSECURE_SECRETS_KEY_PLACEHOLDER_32CHARS_MIN";

  cachedKey = scryptSync(seed, SALT, 32);
  return cachedKey;
}

/** Encrypt a UTF-8 string. Returns a single token suitable for a DB column. */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

/** Decrypt a token produced by encrypt(). Throws on tamper or wrong key. */
export function decrypt(token: string): string {
  const parts = token.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Invalid encrypted token format.");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, "base64url");
  const authTag = Buffer.from(tagB64, "base64url");
  const ct = Buffer.from(ctB64, "base64url");

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]);
  return decrypted.toString("utf8");
}

/** Convenience: encrypt a JSON-serializable value. */
export function encryptJson(value: unknown): string {
  return encrypt(JSON.stringify(value));
}

/** Convenience: decrypt and JSON.parse. */
export function decryptJson<T = unknown>(token: string): T {
  return JSON.parse(decrypt(token)) as T;
}
