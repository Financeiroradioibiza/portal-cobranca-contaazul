import { getConfig, setConfig } from "@/lib/config/portalConfigService";
import { getValidAccessToken } from "@/lib/contaazul/session";
import { isOcSmtpConfigured } from "@/lib/email/ocSmtp";
import {
  appendEnvioManualLog,
  listEnvioManualAgendamentos,
  markAgendamentoSent,
  replaceEnvioManualAgendamentos,
} from "@/lib/enviosManuais/agendamentoStore";
import { dispatchEnvioManualAgendamento } from "@/lib/enviosManuais/envioManualDispatch";
import type { EnvioManualAgendamentoDto } from "@/lib/enviosManuais/types";
import { currentBrazilDayOfMonth, currentBrazilYYYYMMDD } from "@/lib/manualReminders/yearMonth";

const RESET_KEY = "envio_manual.ultimo_reset_ymd";

function cronBatchSize(): number {
  const n = Number(process.env.ENVIOS_MANUAIS_CRON_BATCH ?? "1");
  return Number.isFinite(n) && n >= 1 ? Math.min(5, Math.floor(n)) : 1;
}

async function resetRecorrentesSeNovoDia(todayYmd: number): Promise<EnvioManualAgendamentoDto[]> {
  const todayKey = String(todayYmd);
  const last = (await getConfig(RESET_KEY))?.trim() ?? "";
  let rows = await listEnvioManualAgendamentos();
  if (last !== todayKey) {
    rows = rows.map((a) => (a.rec && a.sent ? { ...a, sent: false } : a));
    await replaceEnvioManualAgendamentos(rows);
    await setConfig(RESET_KEY, todayKey, "envio-manual-cron");
  }
  return rows;
}

export async function runEnvioManualCronBatch(): Promise<{
  ok: true;
  dia: number;
  processados: number;
  restantes: number;
  resultados: { id: string; client: string; ok: boolean; error?: string }[];
}> {
  if (!isOcSmtpConfigured()) {
    throw new Error("smtp_not_configured");
  }
  const token = await getValidAccessToken();
  if (!token) throw new Error("conta_azul_disconnected");

  const now = new Date();
  const diaHoje = currentBrazilDayOfMonth(now);
  const todayYmd = currentBrazilYYYYMMDD(now);
  const rows = await resetRecorrentesSeNovoDia(todayYmd);

  const fila = rows.filter((a) => a.day === diaHoje && !a.sent);
  const lote = fila.slice(0, cronBatchSize());
  const restantes = fila.length - lote.length;

  const resultados: { id: string; client: string; ok: boolean; error?: string }[] = [];

  for (const row of lote) {
    try {
      await dispatchEnvioManualAgendamento(token, row, "Envio automático");
      resultados.push({ id: row.id, client: row.client, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "send_failed";
      await appendEnvioManualLog({
        client: row.client,
        emails: row.emails.join(", "),
        ref: "Envio automático",
        ok: false,
        aviso: msg.slice(0, 480),
        sandbox: true,
      });
      await markAgendamentoSent(row.id);
      resultados.push({ id: row.id, client: row.client, ok: false, error: msg });
    }
  }

  return { ok: true, dia: diaHoje, processados: lote.length, restantes, resultados };
}
