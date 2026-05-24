import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseYearMonthParam } from "@/lib/manualReminders/yearMonth";
import { getValidAccessToken } from "@/lib/contaazul/session";
import { billingEmailJoined, fetchPersonDetail } from "@/lib/contaazul/personBilling";
import { ensureMonthSnapshot } from "@/lib/manualReminders/monthService";

/** Atualiza e-mails só nas linhas que já tem `contaAzulPersonId`. */
export async function POST(_req: Request, context: { params: Promise<{ ym: string }> }) {
  const { ym: rawYm } = await context.params;
  const ym = parseYearMonthParam(rawYm);
  if (ym == null) {
    return NextResponse.json({ error: "invalid_year_month" }, { status: 400 });
  }

  const token = await getValidAccessToken();
  if (!token) {
    return NextResponse.json({
      connected: false as const,
      message:
        "Sem OAuth Conta Azul no servidor. Conecte no painel principal (/) neste mesmo domínio e tente de novo.",
      atualizados: 0,
      falhas: 0,
      falhas_amostra: [] as string[],
    });
  }

  const snap = await ensureMonthSnapshot(prisma, ym);

  const month = await prisma.manualReminderMonth.findUnique({
    where: { id: snap.id },
    include: { linhas: { where: { NOT: { contaAzulPersonId: null } } } },
  });
  if (!month) {
    return NextResponse.json({ error: "month_not_found" }, { status: 404 });
  }

  let ok = 0;
  let fail = 0;
  const errors: string[] = [];

  for (const ln of month.linhas) {
    const pid = ln.contaAzulPersonId;
    if (!pid) continue;
    try {
      const raw = await fetchPersonDetail(token, pid);
      const email = billingEmailJoined(raw);
      await prisma.manualReminderRow.update({
        where: { id: ln.id },
        data: { emailCobranca: email },
      });
      ok++;
    } catch (e) {
      fail++;
      const msg = e instanceof Error ? e.message : "?";
      if (errors.length < 8) errors.push(`${ln.clienteNome.slice(0, 40)}: ${msg.slice(0, 120)}`);
    }
  }

  return NextResponse.json({
    connected: true as const,
    atualizados: ok,
    falhas: fail,
    falhas_amostra: errors,
  });
}
