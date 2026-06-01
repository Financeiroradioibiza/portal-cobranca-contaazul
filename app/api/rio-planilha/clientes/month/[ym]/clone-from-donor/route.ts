import { NextResponse } from "next/server";
import { formatYearMonthLabel, parseYearMonthParam } from "@/lib/manualReminders/yearMonth";
import {
  cloneRioCompMonthFromDonor,
  revertRioCompMonthToDonorClone,
} from "@/lib/rio/cloneRioCompMonth";
import { donorYearMonthFor, isRioTurnoverMonth } from "@/lib/rio/rioTurnover";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ ym: string }> };

/**
 * POST — repõe a competência a partir do mês civil anterior (ex.: jun/2026 ← mai/2026).
 * Se o mês destino estiver vazio, clona; se já tiver linhas, substitui pelo conteúdo do doador.
 */
export async function POST(_req: Request, context: Ctx) {
  const { ym: raw } = await context.params;
  const ym = parseYearMonthParam(raw);
  if (ym == null) {
    return NextResponse.json({ error: "invalid_year_month" }, { status: 400 });
  }

  if (!isRioTurnoverMonth(ym)) {
    return NextResponse.json({ error: "not_turnover_month" }, { status: 400 });
  }

  const donorYm = donorYearMonthFor(ym);
  const target = await prisma.rioCompMonth.findUnique({
    where: { yearMonth: ym },
    include: { _count: { select: { linhas: true } } },
  });

  try {
    if (!target) {
      const full = await cloneRioCompMonthFromDonor(ym);
      return NextResponse.json({
        ok: true,
        mode: "clone_new_month" as const,
        donorYearMonth: full.donorYearMonth,
        closedDonor: full.closedDonor,
        grupos: full.grupos,
        linhas: full.linhas,
        message: `${formatYearMonthLabel(ym)} criado a partir de ${formatYearMonthLabel(full.donorYearMonth)}.`,
      });
    }

    if (target.closedAt) {
      return NextResponse.json({ error: "month_closed" }, { status: 403 });
    }

    if (target._count.linhas === 0) {
      const full = await cloneRioCompMonthFromDonor(ym);
      return NextResponse.json({
        ok: true,
        mode: "clone_empty" as const,
        donorYearMonth: full.donorYearMonth,
        grupos: full.grupos,
        linhas: full.linhas,
        message: `${formatYearMonthLabel(ym)} preenchido com a cópia de ${formatYearMonthLabel(donorYm)}.`,
      });
    }

    const full = await revertRioCompMonthToDonorClone(ym);
    return NextResponse.json({
      ok: true,
      mode: "replace" as const,
      donorYearMonth: full.donorYearMonth,
      grupos: full.grupos,
      linhas: full.linhas,
      message: `${formatYearMonthLabel(ym)} reposto a partir de ${formatYearMonthLabel(donorYm)} (${full.linhaCount} linhas).`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "clone_failed";
    const status =
      msg.startsWith("donor_month_not_found") ? 404
      : msg === "target_month_not_empty" ? 409
      : 502;
    return NextResponse.json({ error: msg, donorYearMonth: donorYm }, { status });
  }
}
