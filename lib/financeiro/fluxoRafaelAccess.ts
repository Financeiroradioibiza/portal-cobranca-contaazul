import { normalizePortalEmail } from "@/lib/auth/users";

const FLUXO_RAFAEL_EMAIL = "rafael@radioibiza.com.br";

/** Fluxo de caixa interno — somente Rafael Gasparian. */
export function isFluxoRafaelAdmin(session: {
  email: string;
  displayName?: string | null;
}): boolean {
  const email = normalizePortalEmail(session.email);
  if (email === FLUXO_RAFAEL_EMAIL) return true;
  const name = (session.displayName ?? "").trim().toLowerCase();
  return name.includes("rafael") && name.includes("gasparian");
}
