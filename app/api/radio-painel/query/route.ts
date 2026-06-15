import { NextResponse } from "next/server";
import { requireConsultaPainelSession } from "@/lib/auth/portalAccess";
import {
  csvMatchClientesPorTexto,
  csvMatchPdvsPorTexto,
} from "@/lib/radioPainel/exportClientesCsv";
import { buildClientePainelPayload } from "@/lib/radioPainel/clientePayload";
import { resolveClienteNome } from "@/lib/radioPainel/clienteSearch";
import { buildPdvPainelPayload } from "@/lib/radioPainel/pdvPayload";
import { getPainelSessionCookie, painelHtml } from "@/lib/radioPainel/session";

export const runtime = "nodejs";
export const maxDuration = 55;

function painelEnabled(): boolean {
  const v = process.env.RADIO_PAINEL_ENABLED?.trim().toLowerCase() ?? "";
  return v === "1" || v === "true" || v === "yes";
}

export async function POST(request: Request) {
  try {
    await requireConsultaPainelSession();
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!painelEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Integração Radio Painel desligada (RADIO_PAINEL_ENABLED=1 no Netlify ou .env.local).",
      },
      { status: 503 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const body =
    typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};

  let modeRaw = "";
  try {
    const { cookie, base } = await getPainelSessionCookie();
    const mode = typeof body.mode === "string" ? body.mode.trim() : "";
    modeRaw = mode;

    if (mode === "clienteNome") {
      const nome = typeof body.nome === "string" ? body.nome.trim() : "";
      if (!nome) {
        return NextResponse.json({ error: "nome_obrigatorio" }, { status: 400 });
      }

      const candCsv = csvMatchClientesPorTexto(nome);
      let candidatos = candCsv.map((c) => ({
        clienteId: c.clienteId,
        textoLinha: c.textoLinha,
      }));

      if (candidatos.length === 0 && process.env.RADIO_PAINEL_HTML_SEARCH_FALLBACK === "1") {
        candidatos = await resolveClienteNome(cookie, base, nome);
      }

      if (candidatos.length === 0) {
        return NextResponse.json({
          ok: true,
          tipo: "cliente_vazio",
          candidatos: [],
          fonte: "csv",
          aviso:
            "Sem correspondencia na planilha data/export-clientes.csv (troque arquivo ou ajuste o texto). Exporte novamente em /adm/exports. Opcao RADIO_PAINEL_HTML_SEARCH_FALLBACK=1 tenta lista HTML do painel.",
        });
      }

      if (candidatos.length === 1) {
        const cid = candidatos[0].clienteId;
        const html = await painelHtml(cookie, base, `/adm/clientes/edit?cliente=${cid}`);
        return NextResponse.json({
          ok: true,
          tipo: "cliente",
          resultado: buildClientePainelPayload(html, cid),
          candidatos,
          fonte: candCsv.length ? "csv" : "html_lista",
        });
      }

      return NextResponse.json({
        ok: true,
        tipo: "cliente_escolha",
        candidatos,
        fonte: candCsv.length ? "csv" : "html_lista",
      });
    }

    if (mode === "clienteId") {
      let id = "";
      if (typeof body.clienteId === "string") id = body.clienteId.trim();
      else if (typeof body.clienteId === "number") id = String(Math.trunc(body.clienteId));

      if (!/^\d+$/.test(id)) {
        return NextResponse.json({ error: "clienteId_invalido" }, { status: 400 });
      }
      const html = await painelHtml(cookie, base, `/adm/clientes/edit?cliente=${id}`);
      return NextResponse.json({
        ok: true,
        tipo: "cliente",
        resultado: buildClientePainelPayload(html, id),
      });
    }

    if (mode === "pdvNome") {
      const nome = typeof body.nome === "string" ? body.nome.trim() : "";
      if (!nome) {
        return NextResponse.json({ error: "nome_obrigatorio" }, { status: 400 });
      }

      const candidatos = csvMatchPdvsPorTexto(nome);
      if (candidatos.length === 0) {
        return NextResponse.json({
          ok: true,
          tipo: "pdv_vazio",
          candidatos: [],
          fonte: "csv",
          aviso:
            "Sem PDV correspondente na planilha (data/export-clientes.csv). Exporte atualizado pelo painel /adm/exports.",
        });
      }

      if (candidatos.length === 1) {
        const cid = candidatos[0].clienteId;
        const pid = candidatos[0].pdvId;
        const html = await painelHtml(
          cookie,
          base,
          `/adm/pdv/edit?pdv=${pid}&cliente=${cid}`,
        );
        return NextResponse.json({
          ok: true,
          tipo: "pdv",
          resultado: buildPdvPainelPayload(html, pid, cid),
          candidatos,
          fonte: "csv",
        });
      }

      return NextResponse.json({
        ok: true,
        tipo: "pdv_escolha",
        candidatos,
        fonte: "csv",
      });
    }

    if (mode === "pdv") {
      let pdvId = "";
      if (typeof body.pdvId === "string") pdvId = body.pdvId.trim();
      else if (typeof body.pdvId === "number") pdvId = String(Math.trunc(body.pdvId));

      let clienteExtras = "";
      if (typeof body.clienteId === "string") clienteExtras = body.clienteId.trim();
      else if (typeof body.clienteId === "number" && Number.isFinite(body.clienteId)) {
        clienteExtras = String(Math.trunc(body.clienteId));
      }

      if (!/^\d+$/.test(pdvId)) {
        return NextResponse.json({ error: "pdvId_invalido" }, { status: 400 });
      }

      const path =
        clienteExtras && /^\d+$/.test(clienteExtras)
          ? `/adm/pdv/edit?pdv=${pdvId}&cliente=${clienteExtras}`
          : `/adm/pdv/edit?pdv=${pdvId}`;

      const html = await painelHtml(cookie, base, path);
      return NextResponse.json({
        ok: true,
        tipo: "pdv",
        resultado: buildPdvPainelPayload(
          html,
          pdvId,
          clienteExtras || undefined,
        ),
      });
    }

    return NextResponse.json(
      {
        error: "mode_invalido",
        recebido: modeRaw || null,
        opcoes: ["clienteNome", "clienteId", "pdvNome", "pdv"],
      },
      { status: 400 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "painel_erro";
    console.error("[radio-painel]", modeRaw, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
