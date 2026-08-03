/** Painel Vercel (agendamentos boleto + NFS-e Conta Azul) — embed no portal. */
export const ENVIOS_MANUAIS_EXTERNAL_URL =
  process.env.NEXT_PUBLIC_ENVIOS_MANUAIS_URL?.trim() || "https://radioibiza.vercel.app/";

export function enviosManuaisFrameOrigin(): string {
  try {
    return new URL(ENVIOS_MANUAIS_EXTERNAL_URL).origin;
  } catch {
    return "https://radioibiza.vercel.app";
  }
}
