import { prisma } from "@/lib/prisma";
import { parseStringArrayJson } from "@/lib/chamados/chamadoUtils";
import { sendPushToEmails } from "@/lib/push/sendPush";
import { chamadosMobilePushUrl } from "@/lib/push/chamadosPushUrls";

const MAX_LATE_MS = 12 * 60 * 60 * 1000;

function fmtHoraAlarme(d: Date): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    }).format(d);
  } catch {
    return "";
  }
}

/** Dispara push de alarme quando `inicio_em` chega (poll via agenda/resumo). */
export async function flushAgendaCompromissoAlarms(): Promise<void> {
  const now = new Date();
  const rows = await prisma.portalAgendaCompromisso.findMany({
    where: {
      alarmeAtivo: true,
      alarmeNotificado: false,
      inicioEm: { lte: now },
    },
    orderBy: { inicioEm: "asc" },
    take: 40,
  });

  for (const row of rows) {
    const lateMs = now.getTime() - row.inicioEm.getTime();
    if (lateMs > MAX_LATE_MS) {
      await prisma.portalAgendaCompromisso.update({
        where: { id: row.id },
        data: { alarmeNotificado: true },
      });
      continue;
    }

    const guests = parseStringArrayJson(row.participantesJson);
    const emails = [row.criadoPorEmail, ...guests];
    const hora = fmtHoraAlarme(row.inicioEm);
    const body = hora ? `${hora} · ${row.titulo}` : row.titulo;

    try {
      await sendPushToEmails(emails, {
        title: "⏰ Compromisso agora",
        body: body.slice(0, 240),
        url: chamadosMobilePushUrl({ view: "agenda" }),
        tag: `compromisso-alarm-${row.id}`,
        alarm: true,
      });
    } catch (e) {
      console.error("[compromisso-alarm] push", row.id, e);
    }

    await prisma.portalAgendaCompromisso.update({
      where: { id: row.id },
      data: { alarmeNotificado: true },
    });
  }
}
