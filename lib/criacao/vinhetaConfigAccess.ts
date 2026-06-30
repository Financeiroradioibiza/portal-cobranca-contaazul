import { normalizePortalEmail } from "@/lib/auth/users";

const VINHETA_CONFIG_EMAIL = "rafael@radioibiza.com.br";

/** Configuração avançada de vinhetas IA — somente Rafael Gasparian. */
export function isVinhetaConfigAdmin(session: {
  email: string;
  displayName?: string | null;
}): boolean {
  const email = normalizePortalEmail(session.email);
  if (email === VINHETA_CONFIG_EMAIL) return true;
  const name = (session.displayName ?? "").trim().toLowerCase();
  return name.includes("rafael") && name.includes("gasparian");
}
