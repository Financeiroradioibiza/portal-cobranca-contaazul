import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getValidAccessToken } from "@/lib/contaazul/session";
import { parseYearMonthParam } from "@/lib/manualReminders/yearMonth";
import { applyCaPersonToRioLinha, isRioCaPersonLinked } from "@/lib/rio/rioCaPersonLink";

const CA_HINT_PT =
  "Sem sessão OAuth Conta Azul no servidor. Abra o painel principal (/), reconecte o Conta Azul neste mesmo domínio e tente vincular de novo.";

type Ctx = { params: Promise<{ ym: string; linhaId: string }> };

/**
 * POST body `{ personId?: string | null }` — vincula ou desvincula a pessoa CA e atualiza
 * e-mail / razão / documento a partir do cadastro. Omitir `personId` só atualiza quem já está vinculado.
 */
export async function POST(req: Request, context: Ctx) {
  const { ym: rawYm, linhaId } = await context.params;
  const ym = parseYearMonthParam(rawYm);
  if (ym == null || !linhaId?.trim()) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  let body: {
    personId?: unknown;
    caNomeLista?: unknown;
    includePersonDetails?: unknown;
    includeContracts?: unknown;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const token = await getValidAccessToken();
  if (!token) {
    return NextResponse.json({
      connected: false as const,
      message: CA_HINT_PT,
      linha: null,
    });
  }

  const month = await prisma.rioCompMonth.findUnique({
    where: { yearMonth: ym },
    select: { id: true },
  });
  if (!month) {
    return NextResponse.json({ error: "month_not_found" }, { status: 404 });
  }

  const linhaBefore = await prisma.rioCompClienteLinha.findFirst({
    where: { id: linhaId, monthId: month.id },
    select: { id: true, caPersonId: true },
  });
  if (!linhaBefore) {
    return NextResponse.json({ error: "line_not_found" }, { status: 404 });
  }

  let personId: string | null = linhaBefore.caPersonId;
  if (typeof body.personId === "string" && body.personId.trim()) {
    personId = body.personId.trim();
  } else if (body.personId === null || body.personId === "") {
    personId = null;
  } else if (!("personId" in body)) {
    if (!isRioCaPersonLinked(linhaBefore.caPersonId)) {
      return NextResponse.json({ error: "line_not_linked_to_ca" }, { status: 400 });
    }
    personId = linhaBefore.caPersonId;
  }

  try {
    const caNomeLista = typeof body.caNomeLista === "string" ? body.caNomeLista : undefined;
    const linha = await applyCaPersonToRioLinha(linhaId, month.id, personId, token, {
      includePersonDetails:
        "includePersonDetails" in body ? Boolean(body.includePersonDetails) : true,
      includeContracts: "includeContracts" in body ? Boolean(body.includeContracts) : true,
      caNomeLista,
    });
    return NextResponse.json({
      connected: true as const,
      linha,
      billingEmailsEmptyHint:
        personId && !linha.emailCobranca?.trim() ?
          "Pessoa vinculada, mas sem e-mail de cobrança/faturamento no cadastro CA."
        : null,
      contractValorEmptyHint:
        personId && !linha.valorClienteTexto?.trim() && !linha.valorPdvUnitarioTexto?.trim() ?
          "Sem valor em contrato ATIVO na CA — informe «Valor por PDV» no cliente expandido."
        : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ca_erro";
    if (msg.startsWith("ca_person_already_linked|")) {
      const [, clashLinhaId, detail, clashGrupoNome, clashSystemTag] = msg.split("|");
      return NextResponse.json(
        {
          connected: true as const,
          error: "ca_person_already_linked",
          detail: detail?.trim() || null,
          clashLinhaId: clashLinhaId?.trim() || null,
          clashGrupoNome: clashGrupoNome?.trim() || null,
          clashSystemTag: clashSystemTag?.trim() || null,
        },
        { status: 409 },
      );
    }
    if (msg === "ca_person_inactive") {
      return NextResponse.json(
        {
          connected: true as const,
          error: "ca_person_inactive",
          detail: "Só é possível vincular clientes ativos na Conta Azul.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { connected: true as const, errorDetail: msg, linha: null },
      { status: 502 },
    );
  }
}
