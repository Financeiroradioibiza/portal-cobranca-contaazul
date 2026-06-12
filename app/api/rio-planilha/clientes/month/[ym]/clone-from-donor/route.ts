import { NextResponse } from "next/server";
import { formatYearMonthLabel, parseYearMonthParam } from "@/lib/manualReminders/yearMonth";
import {
  RIO_CLONE_DONOR_BATCH_SIZE,
  cloneDonorFinish,
  cloneDonorLinhasBatch,
  cloneDonorReset,
} from "@/lib/rio/cloneRioCompMonthBatched";
import { carryProducaoLayoutFromDonor } from "@/lib/cadastros/producaoLayoutCarryService";
import { isRioTurnoverMonth } from "@/lib/rio/rioTurnover";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ ym: string }> };

type Body =
  | { phase: "reset"; closeDonorWhenDone?: boolean }
  | { phase: "linhas"; offset: number; limit?: number }
  | { phase: "finish" };

/**
 * POST — copia o mês anterior em lotes (evita timeout Netlify).
 * reset → linhas (offset 0, 10, 20…) → finish
 */
export async function POST(req: Request, context: Ctx) {
  const { ym: raw } = await context.params;
  const ym = parseYearMonthParam(raw);
  if (ym == null) {
    return NextResponse.json({ error: "invalid_year_month" }, { status: 400 });
  }

  if (!isRioTurnoverMonth(ym)) {
    return NextResponse.json({ error: "not_turnover_month" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    if (body.phase === "reset") {
      const r = await cloneDonorReset(ym, {
        closeDonorWhenDone: Boolean(body.closeDonorWhenDone),
      });
      return NextResponse.json({
        ok: true,
        phase: "reset",
        batchSize: RIO_CLONE_DONOR_BATCH_SIZE,
        ...r,
        message: `MARCAs copiadas. ${r.totalLinhas} clientes a copiar em lotes de ${RIO_CLONE_DONOR_BATCH_SIZE}.`,
      });
    }

    if (body.phase === "linhas") {
      const offset = Math.max(0, Math.floor(Number(body.offset) || 0));
      const r = await cloneDonorLinhasBatch(ym, offset, body.limit ?? RIO_CLONE_DONOR_BATCH_SIZE);
      return NextResponse.json({
        ok: true,
        phase: "linhas",
        batchSize: RIO_CLONE_DONOR_BATCH_SIZE,
        ...r,
      });
    }

    if (body.phase === "finish") {
      const full = await cloneDonorFinish(ym);
      const layoutCarry = await carryProducaoLayoutFromDonor(full.donorYearMonth, ym);
      return NextResponse.json({
        ok: true,
        phase: "finish",
        mode: "batched" as const,
        donorYearMonth: full.donorYearMonth,
        closedDonor: full.closedDonor,
        layoutCarry,
        grupos: full.grupos,
        linhas: full.linhas,
        message: `${formatYearMonthLabel(ym)} copiado de ${formatYearMonthLabel(full.donorYearMonth)} (${full.linhaCount} linhas).`,
      });
    }

    return NextResponse.json({ error: "unknown_phase" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "clone_failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
