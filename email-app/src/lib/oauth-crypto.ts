import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGO = "aes-256-gcm";
const SALT = "email-control-oauth-v1";

function key(secret: string): Buffer {
  return scryptSync(secret, SALT, 32);
}

export function sealOAuthPayload(secret: string, payload: Record<string, unknown>): string {
  const k = key(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, k, iv);
  const json = JSON.stringify(payload);
  const enc = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function unsealOAuthPayload(
  secret: string,
  sealed: string
): Record<string, unknown> | null {
  try {
    const buf = Buffer.from(sealed, "base64url");
    if (buf.length < 29) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const k = key(secret);
    const decipher = createDecipheriv(ALGO, k, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    const o = JSON.parse(dec.toString("utf8")) as Record<string, unknown>;
    return o && typeof o === "object" ? o : null;
  } catch {
    return null;
  }
}
