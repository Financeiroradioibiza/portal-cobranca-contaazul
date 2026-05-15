import { verifySync } from "otplib";

/**
 * Valida código TOTP (Google Authenticator, 6 dígitos, SHA1, 30s).
 */
export function verifyTotp(secret: string, token: string): boolean {
  const clean = token.replace(/\s/g, "");
  if (!/^\d{6,8}$/.test(clean)) return false;
  const result = verifySync({
    secret,
    token: clean,
    epochTolerance: 30,
  });
  return result.valid;
}
