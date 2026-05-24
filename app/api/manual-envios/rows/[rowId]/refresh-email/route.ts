import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getValidAccessToken } from "@/lib/contaazul/session";
import { billingEmailJoined, fetchPersonDetail } from "@/lib/contaazul/personBilling";

const CA_HINT_PT =
  "Sem sessão OAuth Conta Azul no servidor ou o refresh falhou. Abra o painel principal (/), reconecte o Conta Azul neste mesmo domínio e tente vincular de novo.";

function validRowId(id: string): boolean {
  if (!id || id.length > 140) return false;
  return /^c[a-z0-9]+$|^[a-z0-9]{20,}$/.test(id);
}

/**
 * POST: body `{ personId?: string | null }` — se vier `personId`, vincula e preenche e-mail cobrança;
 * se só quiser atualizar e-mail já vinculado, omitir body.
 */
export async function POST(req: Request, context: { params: Promise<{ rowId: string }> }) {
  const { rowId } = await context.params;
  if (!validRowId(rowId)) {
    return NextResponse.json({ error: "invalid_row_id" }, { status: 400 });
  }

  let body: { personId?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const token = await getValidAccessToken();
  if (!token) {
    return NextResponse.json({
      connected: false as const,
      message: CA_HINT_PT,
      row: null,
    });
  }

  const rowBefore = await prisma.manualReminderRow.findUnique({ where: { id: rowId } });
  if (!rowBefore) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let personId = rowBefore.contaAzulPersonId ?? null;

  if (typeof body.personId === "string" && body.personId.trim()) {
    personId = body.personId.trim();
  } else if (body.personId === null || body.personId === "") {
    personId = null;
  }

  try {
    if (!personId) {
      await prisma.manualReminderRow.update({
        where: { id: rowId },
        data: { contaAzulPersonId: null, emailCobranca: null },
      });
      const row = await prisma.manualReminderRow.findUnique({ where: { id: rowId } });
      return NextResponse.json({ connected: true as const, row });
    }

    const raw = await fetchPersonDetail(token, personId);
    const email = billingEmailJoined(raw);

    const row = await prisma.manualReminderRow.update({
      where: { id: rowId },
      data: {
        contaAzulPersonId: personId,
        emailCobranca: email,
      },
    });

    return NextResponse.json({
      connected: true as const,
      row,
      emailPreview: row.emailCobranca,
      /** Diagnóstico leve quando o cadastro não tem contato cobrança preenchido */
      billingEmailsEmptyHint:
        !email ?
          "A pessoa existe no cadastro mas não há e-mails em cobrança/faturamento nem e-mail principal. Complete no Conta Azul."
        : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ca_erro";
    return NextResponse.json(
      {
        connected: true as const,
        errorDetail: msg,
        row: null,
      },
      { status: 502 },
    );
  }
}
