import { parseEmailAddresses } from "@/lib/format";

export const ENVIOS_MANUAIS_TEST_EMAIL = "rafael@radioibiza.com.br";

/** Cron automático: só envia aos e-mails cadastrados com `ENVIOS_MANUAIS_LIVE=1`. */
export function enviosManuaisLiveEnabled(): boolean {
  return process.env.ENVIOS_MANUAIS_LIVE === "1";
}

/** `live` = botão Enviar manualmente (portal). `cron` = respeita ENV. `test` = sempre sandbox. */
export type EnvioManualDelivery = "test" | "live" | "cron";

export function resolveEnvioManualRecipients(
  requestedRaw: string[],
  delivery: EnvioManualDelivery = "cron",
): {
  to: string[];
  sandbox: boolean;
  original: string[];
} {
  const original = parseEmailAddresses(requestedRaw.join(", "));
  const useCadastrados =
    delivery === "live" || (delivery === "cron" && enviosManuaisLiveEnabled());
  if (useCadastrados && original.length) {
    return { to: original, sandbox: false, original };
  }
  return { to: [ENVIOS_MANUAIS_TEST_EMAIL], sandbox: true, original };
}
