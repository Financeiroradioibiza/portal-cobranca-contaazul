import { normalizePortalEmail } from "@/lib/auth/users";

export type ProgramacaoDonoRef = {
  criativoUserId?: string | null;
};

/** Dono criativo = e-mail normalizado em `criativoUserId` (mesma regra do painel Criador). */
export function programacaoOwnedByEmail(
  prog: ProgramacaoDonoRef,
  sessionEmail: string,
): boolean {
  const owner = normalizePortalEmail(prog.criativoUserId ?? "");
  if (!owner) return false;
  return owner === normalizePortalEmail(sessionEmail);
}
