import type { PainelMatchMethod } from "@prisma/client";
import { NextResponse } from "next/server";
import { upsertPainelPdvLink } from "@/lib/cadastros/painelPdvLinkService";

export const runtime = "nodejs";

const METHODS = new Set<PainelMatchMethod>([
  "cnpj",
  "nome_pdv",
  "nome_cliente",
  "manual",
]);

function parsePainelId(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}

export async function PUT(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const rioCompPdvId =
    typeof body.rioCompPdvId === "string" ? body.rioCompPdvId.trim() : "";
  const painelPdvId = parsePainelId(body.painelPdvId);
  const painelClienteId = parsePainelId(body.painelClienteId);

  if (!rioCompPdvId) {
    return NextResponse.json({ error: "rio_comp_pdv_id_obrigatorio" }, { status: 400 });
  }
  if (painelPdvId == null || painelClienteId == null) {
    return NextResponse.json({ error: "painel_ids_invalidos" }, { status: 400 });
  }

  let matchMethod: PainelMatchMethod = "manual";
  if (typeof body.matchMethod === "string" && METHODS.has(body.matchMethod as PainelMatchMethod)) {
    matchMethod = body.matchMethod as PainelMatchMethod;
  }

  const verified = body.verified === true;

  try {
    const { link, cadastroImport } = await upsertPainelPdvLink({
      rioCompPdvId,
      painelPdvId,
      painelClienteId,
      matchMethod,
      verified,
    });
    return NextResponse.json({ ok: true, link, cadastroImport });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    const conflict =
      e && typeof e === "object" && "conflict" in e
        ? (e as { conflict?: unknown }).conflict
        : undefined;
    const status =
      msg === "rio_pdv_not_found" ? 404
      : msg.startsWith("painel_") ? 400
      : 500;
    return NextResponse.json(
      { ok: false, error: msg, ...(conflict ? { conflict } : {}) },
      { status },
    );
  }
}
