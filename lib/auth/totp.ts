import { generateSecret, verifySync } from "otplib";

export function generatePortalTotpSecret(): string {
  return generateSecret();
}

/** Valida código de 6 dígitos do Google Authenticator (TOTP). */
export function verifyPortalTotp(codeRaw: string, secretRaw: string): boolean {
  const token = String(codeRaw ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(token)) return false;
  const secret = String(secretRaw ?? "")
    .replace(/\s/g, "")
    .toUpperCase();
  if (secret.length < 16) return false;
  try {
    const result = verifySync({ token, secret, epochTolerance: 1 });
    return result.valid === true;
  } catch {
    return false;
  }
}
