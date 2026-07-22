import crypto from "crypto";

const KEY_BYTES = 32;
const IV_BYTES = 12;

export function hasCredentialKey() {
  return Boolean(process.env.CREDENTIAL_ENCRYPTION_KEY);
}

function getCredentialKey() {
  const value = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!value) {
    throw new Error("缺少 CREDENTIAL_ENCRYPTION_KEY，无法安全保存 API Key");
  }

  const decoded = Buffer.from(value, "base64");
  if (decoded.length === KEY_BYTES) return decoded;

  const utf8 = Buffer.from(value, "utf8");
  if (utf8.length === KEY_BYTES) return utf8;

  throw new Error("CREDENTIAL_ENCRYPTION_KEY 必须是 32 字节密钥或 32 字节 base64");
}

export function encryptSecret(plainText) {
  if (!plainText) return null;

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", getCredentialKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);

  return {
    encryptedApiKey: encrypted.toString("base64"),
    apiKeyIv: iv.toString("base64"),
    apiKeyAuthTag: cipher.getAuthTag().toString("base64"),
    apiKeyLast4: plainText.slice(-4),
  };
}

export function decryptSecret({ encryptedApiKey, apiKeyIv, apiKeyAuthTag }) {
  if (!encryptedApiKey || !apiKeyIv || !apiKeyAuthTag) return "";

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getCredentialKey(),
    Buffer.from(apiKeyIv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(apiKeyAuthTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedApiKey, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function maskApiKey(value) {
  if (!value) return "";
  const last4 = value.length <= 4 ? value : value.slice(-4);
  return `••••••••${last4}`;
}

export function redactSecrets(value) {
  if (value == null) return value;
  if (typeof value === "string") {
    return value
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
      .replace(/sk-[A-Za-z0-9_-]+/g, "sk-[REDACTED]")
      .replace(/AIza[0-9A-Za-z_-]+/g, "AIza[REDACTED]");
  }
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        if (/key|secret|token|authorization|encrypted|iv|authtag/i.test(key)) {
          return [key, "[REDACTED]"];
        }
        return [key, redactSecrets(item)];
      }),
    );
  }
  return value;
}
