import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/contaazul/session";
import { parseYearMonthParam } from "@/lib/manualReminders/yearMonth";
import {
  RIO_VIRADA_LINHAS_BATCH,
  assertViradaMonthOpen,
  hydrateViradaMonth,
  viradaApplyLinhasBatch,
  viradaFinalizeNovos,
  viradaPrepareCaPage,
  viradaPrepareReset,
} from "@/lib/rio/rioViradaBatched";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ ym: string }> };

type Body =
  | { phase: "reset" }
  | { phase: "ca_page"; page: number }
  | { phase: "linhas"; offset: number; limit?: number; includeContracts?: boolean; includePersonDetails?: boolean }
  | { phase: "novos"; includeContracts?: boolean; includePersonDetails?: boolean };

export async function POST(req: Request, context: Ctx) {
  const token = await getValidAccessToken();
  if (!token) {
    return NextResponse.json({ error: "conta_azul_disconnected" }, { status: 401 });
  }

  const { ym: raw } = await context.params;
  const ym = parseYearMonthParam(raw);
  if (ym == null) {
    return NextResponse.json({ error: "invalid_year_month" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    if (body.phase === "reset") {
      const month = await assertViradaMonthOpen(ym);
      await viradaPrepareReset(month.id);
      return NextResponse.json({ ok: true, phase: "reset" });
    }

    if (body.phase === "ca_page") {
      const page = Math.max(1, Math.floor(Number(body.page) || 1));
      const r = await viradaPrepareCaPage(token, ym, page);
      return NextResponse.json({ ok: true, phase: "ca_page", ...r });
    }

    if (body.phase === "linhas") {
      const offset = Math.max(0, Math.floor(Number(body.offset) || 0));
      const limit = Math.min(
        25,
        Math.max(1, Math.floor(Number(body.limit) || RIO_VIRADA_LINHAS_BATCH)),
      );
      const r = await viradaApplyLinhasBatch(token, ym, offset, limit, {
        includeContracts: Boolean(body.includeContracts),
        includePersonDetails: Boolean(body.includePersonDetails),
      });
      return NextResponse.json({ ok: true, phase: "linhas", ...r });
    }

    if (body.phase === "novos") {
      const r = await viradaFinalizeNovos(token, ym, {
        includeContracts: Boolean(body.includeContracts),
        includePersonDetails: Boolean(body.includePersonDetails),
      });
      const full = await hydrateViradaMonth(ym);
      const month = await prisma.rioCompMonth.findUnique({ where: { yearMonth: ym } });
      return NextResponse.json({
        ok: true,
        phase: "novos",
        virada: true,
        novos: r.novos,
        viradaStats: r.stats,
        month,
        grupos: full.grupos,
        linhas: full.linhas,
        count: full.linhas.length,
      });
    }

    return NextResponse.json({ error: "unknown_phase" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "virada_failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
