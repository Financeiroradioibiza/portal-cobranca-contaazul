import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getValidAccessToken } from "@/lib/contaazul/session";
import { parseYearMonthParam } from "@/lib/manualReminders/yearMonth";
import {
  RIO_CA_REFRESH_BATCH_SIZE,
  matchRioImportRowsByDocumentoBatch,
  refreshRioMonthLinkedFromCaBatch,
} from "@/lib/rio/rioCaPersonLink";

const CA_HINT_PT =
  "Sem sessão OAuth Conta Azul no servidor. Abra o painel principal (/), reconecte o Conta Azul neste mesmo domínio.";

type Ctx = { params: Promise<{ ym: string }> };

/**
 * POST body:
 * `{ "offset": 0, "limit": 10, "mode": "refresh" | "match" }`
 * — atualiza vínculos CA em lotes (evita timeout). `match` = casar CNPJ/CPF só no lote.
 */
export async function POST(req: Request, context: Ctx) {
  const { ym: rawYm } = await context.params;
  const ym = parseYearMonthParam(rawYm);
  if (ym == null) {
    return NextResponse.json({ error: "invalid_year_month" }, { status: 400 });
  }

  let offset = 0;
  let limit = RIO_CA_REFRESH_BATCH_SIZE;
  let mode: "refresh" | "match" = "refresh";
  try {
    const b = (await req.json()) as {
      offset?: unknown;
      limit?: unknown;
      mode?: unknown;
      /** legado */
      matchByDocument?: unknown;
    };
    if (typeof b?.offset === "number" && Number.isFinite(b.offset) && b.offset >= 0) {
      offset = Math.floor(b.offset);
    }
    if (typeof b?.limit === "number" && Number.isFinite(b.limit) && b.limit > 0) {
      limit = Math.min(25, Math.floor(b.limit));
    }
    if (b?.mode === "match" || b?.matchByDocument === true) mode = "match";
    else if (b?.mode === "refresh") mode = "refresh";
  } catch {
    /* defaults */
  }

  const token = await getValidAccessToken();
  if (!token) {
    return NextResponse.json({ connected: false, message: CA_HINT_PT }, { status: 401 });
  }

  const month = await prisma.rioCompMonth.findUnique({
    where: { yearMonth: ym },
    select: { id: true },
  });
  if (!month) {
    return NextResponse.json({ error: "month_not_found" }, { status: 404 });
  }

  try {
    if (mode === "match") {
      const batch = await matchRioImportRowsByDocumentoBatch(month.id, token, offset, limit);
      return NextResponse.json({
        ok: true,
        mode: "match" as const,
        matchStats: {
          matched: batch.matched,
          ambiguous: batch.ambiguous,
          notFound: batch.notFound,
        },
        progress: batch.progress,
        updatedLinhas: batch.updatedLinhas,
      });
    }

    const batch = await refreshRioMonthLinkedFromCaBatch(month.id, token, offset, limit);
    return NextResponse.json({
      ok: true,
      mode: "refresh" as const,
      refreshStats: {
        updated: batch.updated,
        failed: batch.failed,
        batchSize: batch.progress.batchTo - batch.progress.batchFrom + 1,
      },
      progress: batch.progress,
      updatedLinhas: batch.updatedLinhas,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
