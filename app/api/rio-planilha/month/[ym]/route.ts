import { NextResponse } from "next/server";
import type { RioChargeMode, RioPlanilhaBand, RioPlanilhaRowKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseYearMonthParam } from "@/lib/manualReminders/yearMonth";
import { ensureRioMonth, replaceRioMonthRows, type RioRowSaveInput } from "@/lib/rio/rioPlanilhaService";
import { sortRioPlanilhaRows } from "@/lib/rio/sortLinhas";

type Ctx = { params: Promise<{ ym: string }> };

const BANDS = new Set<RioPlanilhaBand>(["canceladas", "novos", "ativos"]);
const KINDS = new Set<RioPlanilhaRowKind>(["secao", "grupo", "pdv"]);
const CHARGES = new Set<RioChargeMode>(["herda_grupo", "cliente_ca_proprio"]);

function pickBand(v: unknown): RioPlanilhaBand | null {
  return typeof v === "string" && BANDS.has(v as RioPlanilhaBand) ? (v as RioPlanilhaBand) : null;
}

function pickKind(v: unknown): RioPlanilhaRowKind | null {
  return typeof v === "string" && KINDS.has(v as RioPlanilhaRowKind) ? (v as RioPlanilhaRowKind) : null;
}

function pickCharge(v: unknown): RioChargeMode {
  return typeof v === "string" && CHARGES.has(v as RioChargeMode) ? (v as RioChargeMode) : "herda_grupo";
}

function parsePutRows(raw: unknown): RioRowSaveInput[] | { error: string } {
  if (!Array.isArray(raw)) return { error: "rows_not_array" };
  if (raw.length > 5000) return { error: "too_many_rows" };
  const out: RioRowSaveInput[] = [];

  let i = 0;
  for (const r of raw) {
    i++;
    if (typeof r !== "object" || r === null) return { error: `bad_row@${i}` };
    const rec = r as Record<string, unknown>;
    const clientKey = typeof rec.clientKey === "string" ? rec.clientKey.trim() : "";
    if (!clientKey) return { error: `missing_clientKey@${i}` };

    const band = pickBand(rec.band);
    const kind = pickKind(rec.kind);
    if (!band || !kind) return { error: `bad_band_or_kind@${i}` };

    out.push({
      clientKey,
      parentClientKey:
        typeof rec.parentClientKey === "string" ? rec.parentClientKey.trim() || null : null,
      band,
      kind,
      tituloSecao: typeof rec.tituloSecao === "string" ? rec.tituloSecao : null,
      marca: typeof rec.marca === "string" ? rec.marca : "",
      numOrdem: typeof rec.numOrdem === "number" ? rec.numOrdem : null,
      pdvNome: typeof rec.pdvNome === "string" ? rec.pdvNome : "",
      cnpjDocumento:
        typeof rec.cnpjDocumento === "string" ? rec.cnpjDocumento : rec.cnpjDocumento === null ? null : null,
      status: typeof rec.status === "string" ? rec.status : "",
      valorTexto:
        typeof rec.valorTexto === "string" ? rec.valorTexto : rec.valorTexto === null ? null : null,
      qtdeTexto:
        typeof rec.qtdeTexto === "string" ? rec.qtdeTexto : rec.qtdeTexto === null ? null : null,
      categoria: typeof rec.categoria === "string" ? rec.categoria : "",
      email: typeof rec.email === "string" ? rec.email : rec.email === null ? null : null,
      dataInstall:
        typeof rec.dataInstall === "string" ? rec.dataInstall : rec.dataInstall === null ? null : null,
      grupoCobranca: typeof rec.grupoCobranca === "string" ? rec.grupoCobranca : "",
      razao: typeof rec.razao === "string" ? rec.razao : "",
      dataCancel:
        typeof rec.dataCancel === "string" ? rec.dataCancel : rec.dataCancel === null ? null : null,
      notes: typeof rec.notes === "string" ? rec.notes : "",
      contaAzulPersonId:
        typeof rec.contaAzulPersonId === "string"
          ? rec.contaAzulPersonId.trim() || null
          : rec.contaAzulPersonId === null
            ? null
            : null,
      chargeMode: pickCharge(rec.chargeMode),
      sortOrder: typeof rec.sortOrder === "number" ? rec.sortOrder : 0,
    });
  }
  return out;
}

export async function GET(_req: Request, context: Ctx) {
  const { ym: rawYm } = await context.params;
  const ym = parseYearMonthParam(rawYm);
  if (ym == null) {
    return NextResponse.json({ error: "invalid_year_month" }, { status: 400 });
  }

  try {
    const month = await ensureRioMonth(prisma, ym);
    return NextResponse.json({
      month: {
        id: month.id,
        yearMonth: month.yearMonth,
        linhas: sortRioPlanilhaRows(month.linhas),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro_db";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(request: Request, context: Ctx) {
  const { ym: rawYm } = await context.params;
  const ym = parseYearMonthParam(rawYm);
  if (ym == null) {
    return NextResponse.json({ error: "invalid_year_month" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = parsePutRows(body.rows);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    await ensureRioMonth(prisma, ym);
    const linhas = await replaceRioMonthRows(prisma, ym, parsed);
    return NextResponse.json({
      ok: true,
      month: { yearMonth: ym },
      linhas: sortRioPlanilhaRows(linhas),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro_save";
    const lower = msg.toLowerCase();
    const status =
      lower.includes("not_found") || lower.includes("invalida") || lower.includes("parent")
        ? 400
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
