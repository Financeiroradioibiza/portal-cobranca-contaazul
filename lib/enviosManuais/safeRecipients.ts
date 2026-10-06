import { parseEmailAddresses } from "@/lib/format";

export const ENVIOS_MANUAIS_TEST_EMAIL = "rafael@radioibiza.com.br";

/** Enquanto `ENVIOS_MANUAIS_LIVE` ≠ `1`, todo envio vai só para o e-mail de teste. */
export function enviosManuaisLiveEnabled(): boolean {
  return process.env.ENVIOS_MANUAIS_LIVE === "1";
}

export function resolveEnvioManualRecipients(requestedRaw: string[]): {
  to: string[];
  sandbox: boolean;
  original: string[];
} {
  const original = parseEmailAddresses(requestedRaw.join(", "));
  if (enviosManuaisLiveEnabled() && original.length) {
    return { to: original, sandbox: false, original };
  }
  return { to: [ENVIOS_MANUAIS_TEST_EMAIL], sandbox: true, original };
}
