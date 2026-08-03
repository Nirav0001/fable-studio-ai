import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { env } from "../config/env";

/**
 * AES-256-GCM sealed box for provider secrets at rest. The key is derived from
 * JWT_SECRET (the production boot guard already refuses weak/default values),
 * so encrypted rows are useless without the server's secret.
 *
 * Format: "enc1:<iv b64>:<tag b64>:<ciphertext b64>". Empty input ⇄ "".
 */
const KEY = scryptSync(env.jwtSecret, "fable-provider-keys-v1", 32);
const PREFIX = "enc1";

export function seal(plain: string): string {
  if (!plain) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/** Decrypt a sealed value. Any tamper/format/key mismatch ⇒ "" (treated as unset). */
export function unseal(sealed: string): string {
  if (!sealed) return "";
  try {
    const [prefix, ivB64, tagB64, ctB64] = sealed.split(":");
    if (prefix !== PREFIX || !ivB64 || !tagB64 || !ctB64) return "";
    const decipher = createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}
