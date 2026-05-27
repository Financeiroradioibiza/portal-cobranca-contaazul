import bcrypt from "bcryptjs";
import { findPortalUser, getPortalUsers, isPortalAuthDisabled } from "@/lib/auth/users";

/**
 * Confirma a senha do portal para ações destructivas (como remover uma competência).
 * Com sessão válida (`sessionUsername`): compara com o bcrypt desse usuário.
 * Sem sessão apenas em modo `PORTAL_AUTH_DISABLED` (desenvolvimento): aceita a senha
 * se corresponder a qualquer usuário registado (`getPortalUsers`).
 */
export async function verifyPortalPasswordReauth(
  passwordRaw: string,
  sessionUsername: string | null,
): Promise<boolean> {
  const password = typeof passwordRaw === "string" ? passwordRaw : "";
  if (!password) return false;

  if (sessionUsername) {
    const user = findPortalUser(sessionUsername);
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
