import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { isOcSmtpConfigured, sendEmailViaSmtp } from "@/lib/email/ocSmtp";
import {
  formatDestinatarioEmails,
  parseDestinatarioEmails,
} from "@/lib/suporte/parseDestinatarioEmails";
import { registrarEnvio, resolveInstalacaoPdv } from "@/lib/suporte/instalacaoService";
import { loadInstalacaoGeracaoGate } from "@/lib/suporte/instalacaoPdvStatusService";
import { gerarCodigoMsStoreInstalacao } from "@/lib/suporte/microsoft-store/msStoreCodigoService";
import { buildMsStoreInstalacaoEmail } from "@/lib/suporte/microsoft-store/msStoreEmail";

export const runtime = "nodejs";

function parseId(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.trunc(raw);
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    const n = Number(raw.trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

function actorFrom(session: { email: string; displayName?: string }): string {
  return (session.displayName?.trim() || session.email || "").slice(0, 120);
}

export async function POST(request: Request) {
  let session;
  try {
    session = requirePortalSession(await getPortalSession());
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";
  const portalClienteId = parseId(body.portalClienteId);
  const portalPdvId = parseId(body.portalPdvId);

  try {
    if (portalClienteId == null || portalPdvId == null) {
      return NextResponse.json({ ok: false, error: "cliente_pdv_invalido" }, { status: 400 });
    }

    const ctx = await resolveInstalacaoPdv(portalClienteId, portalPdvId);
    if (!ctx) {
      return NextResponse.json({ ok: false, error: "pdv_nao_encontrado" }, { status: 404 });
    }

    const geracaoGate = await loadInstalacaoGeracaoGate({
      rioPdvKey: ctx.rioPdvKey,
      portalPdvId: ctx.portalPdvId,
      playerInstaladoEm: ctx.playerInstaladoEm,
    });

    if (action === "carregar_contexto") {
      return NextResponse.json({
        ok: true,
        geracaoGate,
        contexto: {
          portalClienteId: ctx.portalClienteId,
          portalPdvId: ctx.portalPdvId,
          codigoDisplay: ctx.codigoDisplay,
          clienteNome: ctx.clienteNome,
          pdvNome: ctx.pdvNome,
          contatoLojaEmail: ctx.contatoLojaEmail,
          playerInstaladoEm: ctx.playerInstaladoEm,
          podeGerarCodigo: ctx.podeGerarCodigoPlay,
        },
      });
    }

    if (action === "gerar_codigo") {
      if (!geracaoGate.podeGerarLink && geracaoGate.errorCode) {
        return NextResponse.json(
          { ok: false, error: geracaoGate.errorCode, detail: geracaoGate.motivo },
          { status: 409 },
        );
      }
      try {
        const codigoMsStore = await gerarCodigoMsStoreInstalacao({
          portalClienteId,
          portalPdvId,
          rioPdvKey: ctx.rioPdvKey,
          criadaPor: actorFrom(session),
        });
        await registrarEnvio({
          portalClienteId,
          portalPdvId,
          tipo: "pdv_microsoft_store",
          plataforma: "windows",
          canal: "link",
          destinoEmail: "",
          link: `msstore:${codigoMsStore}`,
          enviadoPor: actorFrom(session),
        });
        return NextResponse.json({ ok: true, codigoMsStore });
      } catch (e) {
        if (e instanceof Error && e.message === "pdv_com_player_instalado") {
          return NextResponse.json({ ok: false, error: "pdv_com_player_instalado" }, { status: 409 });
        }
        throw e;
      }
    }

    if (action === "enviar_email") {
      if (!isOcSmtpConfigured()) {
        return NextResponse.json({ ok: false, error: "smtp_nao_configurado" }, { status: 400 });
      }
      if (!geracaoGate.podeGerarLink && geracaoGate.errorCode) {
        return NextResponse.json(
          { ok: false, error: geracaoGate.errorCode, detail: geracaoGate.motivo },
          { status: 409 },
        );
      }

      const custom = typeof body.email === "string" ? body.email.trim() : "";
      const destinatarios = parseDestinatarioEmails(custom || ctx.contatoLojaEmail);
      if (destinatarios.length === 0) {
        return NextResponse.json({ ok: false, error: "email_invalido" }, { status: 400 });
      }

      let codigoMsStore =
        typeof body.codigoMsStore === "string" && body.codigoMsStore.trim()
          ? body.codigoMsStore.trim()
          : "";
      if (!codigoMsStore) {
        codigoMsStore = await gerarCodigoMsStoreInstalacao({
          portalClienteId,
          portalPdvId,
          rioPdvKey: ctx.rioPdvKey,
          criadaPor: actorFrom(session),
        });
      }

      const email = buildMsStoreInstalacaoEmail({
        clienteNome: ctx.clienteNome,
        pdvNome: ctx.pdvNome,
        codigoDisplay: ctx.codigoDisplay,
        codigoMsStore,
      });

      await sendEmailViaSmtp({
        to: destinatarios,
        subject: email.subject,
        text: email.text,
        html: email.html,
        mailProfile: "suporte",
      });

      await registrarEnvio({
        portalClienteId,
        portalPdvId,
        tipo: "pdv_microsoft_store",
        plataforma: "windows",
        canal: "email",
        destinoEmail: formatDestinatarioEmails(destinatarios),
        link: `msstore:${codigoMsStore}`,
        enviadoPor: actorFrom(session),
      });

      return NextResponse.json({
        ok: true,
        to: formatDestinatarioEmails(destinatarios),
        codigoMsStore,
      });
    }

    return NextResponse.json({ ok: false, error: "acao_invalida" }, { status: 400 });
  } catch (e) {
    console.error("[microsoft-store]", e);
    return NextResponse.json({ ok: false, error: "erro_interno" }, { status: 500 });
  }
}
