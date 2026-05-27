import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getValidAccessToken } from "@/lib/contaazul/session";
import { parseYearMonthParam } from "@/lib/manualReminders/yearMonth";
import { matchRioImportRowsByDocumento, refreshRioMonthLinkedFromCa } from "@/lib/rio/rioCaPersonLink";
import { getRioCompMonthWithLinhas } from "@/lib/rio/rioClienteCompService";

const CA_HINT_PT =
  "Sem sessão OAuth Conta Azul no servidor. Abra o painel principal (/), reconecte o Conta Azul neste mesmo domínio.";

type Ctx = { params: Promise<{ ym: string }> };

/**
 * POST body opcional:
 * `{ "matchByDocument": true }` — tenta vincular linhas importadas pelo CNPJ/CPF;
 * sem body — só atualiza e-mail/razão/etc. das linhas já vinculadas à CA.
 */
export async function POST(req: Request, context: Ctx) {
  const { ym: rawYm } = await context.params;
  const ym = parseYearMonthParam(rawYm);
  if (ym == null) {
    return NextResponse.json({ error: "invalid_year_month" }, { status: 400 });
  }

  let matchByDocument = false;
  try {
    const b = (await req.json()) as { matchByDocument?: unknown };
    matchByDocument = b?.matchByDocument === true;
  } catch {
    matchByDocument = false;
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
    const matchStats = matchByDocument ?
      await matchRioImportRowsByDocumento(month.id, token)
    : null;
    const refreshStats = await refreshRioMonthLinkedFromCa(month.id, token);
    const full = await getRioCompMonthWithLinhas(ym);

    return NextResponse.json({
      ok: true,
      refreshStats,
      matchStats,
      grupos: full?.grupos ?? [],
      linhas: full?.linhas ?? [],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
