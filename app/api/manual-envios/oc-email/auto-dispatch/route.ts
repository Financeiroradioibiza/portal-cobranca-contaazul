import { NextResponse } from "next/server";
import { ManualReminderRowStatus } from "@prisma/client";
import { authorizeOcAutoDispatchCron } from "@/lib/manualReminders/ocAutoDispatchAuth";
import { isOcSmtpConfigured } from "@/lib/email/ocSmtp";
import { prisma } from "@/lib/prisma";
import {
  currentBrazilDayOfMonth,
  currentBrazilYYYYMMDD,
  currentBrazilYearMonth,
} from "@/lib/manualReminders/yearMonth";
import { parseOcEmailRecipients } from "@/lib/manualReminders/ocEmailRender";
import { manualReminderLinhaComMesApiSelect } from "@/lib/manualReminders/manualLinhaApiSelect";
import { transmitOcReminderSmtp } from "@/lib/manualReminders/ocReminderSend";
import type { OcRowWithMonth } from "@/lib/manualReminders/ocReminderSend";

export const dynamic = "force-dynamic";

/**
 * Cron: envia pedido de OC automático apenas no dia `emissionDay` (fusão Brasil),
 * apenas para linhas com status pendente + solicitar_pedir_oc; marca solicitado_ordem após SMTP OK.
 *
 * Headers: Authorization: Bearer <OC_EMAIL_CRON_SECRET ou CRON_SECRET>
 */
async function handle(request: Request) {
  const auth = authorizeOcAutoDispatchCron(request);
  if (!auth.ok) return auth.response;

  if (!isOcSmtpConfigured()) {
    return NextResponse.json(
      {
        error: "smtp_not_configured",
        message:
          "Configure OC_EMAIL_SMTP_HOST, OC_EMAIL_SMTP_USER, OC_EMAIL_SMTP_PASS e OC_EMAIL_FROM para enviar e-mails OC.",
      },
      { status: 503 },
    );
  }

  const now = new Date();
  const ym = currentBrazilYearMonth(now);
  const dom = currentBrazilDayOfMonth(now);
  const todayYmd = currentBrazilYYYYMMDD(now);

  const rows = await prisma.manualReminderRow.findMany({
    where: {
      month: { yearMonth: ym },
      emissionDay: dom,
      status: ManualReminderRowStatus.pendente,
      solicitarPedirOc: true,
      OR: [{ autoOcSentYmd: null }, { autoOcSentYmd: { not: todayYmd } }],
    },
    select: manualReminderLinhaComMesApiSelect,
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  const results: { rowId: string; ok: boolean; error?: string }[] = [];
  let disparados = 0;

  for (const row of rows) {
    if (!parseOcEmailRecipients(row.emailCobranca ?? "").length) {
      results.push({ rowId: row.id, ok: false, error: "no_valid_email" });
      continue;
    }

    if (row.anexarListagemClientesOc && !row.listagemClienteArquivoNome?.trim()) {
      results.push({
        rowId: row.id,
        ok: false,
        error: "missing_listagem_attachment",
      });
      continue;
    }

    try {
      await transmitOcReminderSmtp(row as OcRowWithMonth);
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 500) : "smtp_failed";
      results.push({ rowId: row.id, ok: false, error: msg });
      continue;
    }

    const upd = await prisma.manualReminderRow.updateMany({
      where: {
        id: row.id,
        status: ManualReminderRowStatus.pendente,
        OR: [{ autoOcSentYmd: null }, { autoOcSentYmd: { not: todayYmd } }],
      },
      data: {
        status: ManualReminderRowStatus.solicitado_ordem,
        autoOcSentYmd: todayYmd,
      },
    });

    if (upd.count >= 1) {
      disparados += 1;
      results.push({ rowId: row.id, ok: true });
    } else {
      results.push({
        rowId: row.id,
        ok: false,
        error: "row_changed_after_send",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    brasilia: {
      yearMonth: ym,
      dayOfMonth: dom,
      ymd: todayYmd,
    },
    elegiveis: rows.length,
    disparados,
    results,
  });
}

export function GET(request: Request) {
  return handle(request);
}

export function POST(request: Request) {
  return handle(request);
}
