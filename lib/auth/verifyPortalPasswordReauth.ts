import bcrypt from "bcryptjs";
import { findPortalUserByEmail, getPortalUsers, isPortalAuthDisabled } from "@/lib/auth/users";

/**
 * Confirma a senha do portal para ações destructivas (como remover uma competência).
 * Com sessão válida: compara com o bcrypt do e-mail logado.
 */
export async function verifyPortalPasswordReauth(
  passwordRaw: string,
  sessionEmail: string | null,
): Promise<boolean> {
  const password = typeof passwordRaw === "string" ? passwordRaw : "";
  if (!password) return false;

  if (sessionEmail) {
    const user = findPortalUserByEmail(sessionEmail);
    if (!user) return false;
    return bcrypt.compare(password, user.passwordHash).catch(() => false);
  }

  if (isPortalAuthDisabled()) {
    for (const u of getPortalUsers()) {
      const ok = await bcrypt.compare(password, u.passwordHash).catch(() => false);
      if (ok) return true;
    }
  }

  return false;
}
