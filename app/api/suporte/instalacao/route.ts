import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { isOcSmtpConfigured, sendEmailViaSmtp } from "@/lib/email/ocSmtp";
import { buildInstalacaoEmail } from "@/lib/suporte/instalacaoEmail";
import {
  buildInstallLink,
  gerarSenhaTemporaria,
  listEnviosForPdv,
  registrarEnvio,
  resolveInstalacaoPdv,
  type InstalacaoPlataforma,
  type InstalacaoTipo,
} from "@/lib/suporte/instalacaoService";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEST_EMAIL = "rafael@radioibiza.com.br";

function parseId(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.trunc(raw);
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    const n = Number(raw.trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

function parseTipo(raw: unknown): InstalacaoTipo | null {
  return raw === "padrao_cliente" || raw === "pdv_login" || raw === "pdv_senha_temp" ? raw : null;
}

function parsePlataforma(raw: unknown): InstalacaoPlataforma | null {
  return raw === "windows" || raw === "mobile" ? raw : null;
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

  try {
    if (action === "enviar_teste") {
      if (!isOcSmtpConfigured()) {
        return NextResponse.json({ ok: false, error: "smtp_nao_configurado" }, { status: 400 });
      }
      const email = buildInstalacaoEmail({
        tipo: "pdv_senha_temp",
        plataforma: "windows",
        clienteNome: "Teste portal",
        pdvNome: "Teste portal 01",
        codigoDisplay: "316.001",
        link: buildInstallLink("pdv_senha_temp", "windows", { portalClienteId: 316, portalPdvId: 316001 }),
        senhaTemporaria: "TESTE123",
      });
      await sendEmailViaSmtp({
        to: [TEST_EMAIL],
        subject: `[TESTE] ${email.subject}`,
        text: email.text,
        html: email.html,
      });
      return NextResponse.json({ ok: true, to: TEST_EMAIL });
    }

    const portalClienteId = parseId(body.portalClienteId);
    const portalPdvId = parseId(body.portalPdvId);
    if (portalClienteId == null || portalPdvId == null) {
      return NextResponse.json({ ok: false, error: "cliente_pdv_invalido" }, { status: 400 });
    }

    if (action === "contexto") {
      const ctx = await resolveInstalacaoPdv(portalClienteId, portalPdvId);
      if (!ctx) return NextResponse.json({ ok: false, error: "pdv_nao_encontrado" }, { status: 404 });
      return NextResponse.json({
        ok: true,
        contexto: {
          portalClienteId: ctx.portalClienteId,
          portalPdvId: ctx.portalPdvId,
          codigoDisplay: ctx.codigoDisplay,
          clienteNome: ctx.clienteNome,
          pdvNome: ctx.pdvNome,
          contatoLojaNome: ctx.contatoLojaNome,
          contatoLojaEmail: ctx.contatoLojaEmail,
          contatoLojaTelefone: ctx.contatoLojaTelefone,
        },
      });
    }

    if (action === "listar_log") {
      const rows = await listEnviosForPdv(portalClienteId, portalPdvId, 30);
      return NextResponse.json({ ok: true, rows });
    }

    const tipo = parseTipo(body.tipo);
    const plataforma = parsePlataforma(body.plataforma);
    if (!tipo || !plataforma) {
      return NextResponse.json({ ok: false, error: "tipo_plataforma_invalido" }, { status: 400 });
    }

    const ctx = await resolveInstalacaoPdv(portalClienteId, portalPdvId);
    if (!ctx) return NextResponse.json({ ok: false, error: "pdv_nao_encontrado" }, { status: 404 });

    const link = buildInstallLink(tipo, plataforma, { portalClienteId, portalPdvId });

    if (action === "gerar_link") {
      let senhaTemporaria: string | undefined;
      if (tipo === "pdv_senha_temp") {
        senhaTemporaria = await gerarSenhaTemporaria(portalClienteId, portalPdvId, actorFrom(session));
      }
      return NextResponse.json({ ok: true, link, senhaTemporaria });
    }

    if (action === "registrar_copia") {
      await registrarEnvio({
        portalClienteId,
        portalPdvId,
        tipo,
        plataforma,
        canal: "link",
        destinoEmail: "",
        link,
        enviadoPor: actorFrom(session),
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "enviar_email") {
      if (!isOcSmtpConfigured()) {
        return NextResponse.json({ ok: false, error: "smtp_nao_configurado" }, { status: 400 });
      }
      const custom = typeof body.email === "string" ? body.email.trim() : "";
      const destino = custom || ctx.contatoLojaEmail;
      if (!destino || !EMAIL_RE.test(destino)) {
        return NextResponse.json({ ok: false, error: "email_invalido" }, { status: 400 });
      }

      const senhaTemporaria =
        typeof body.senhaTemporaria === "string" && body.senhaTemporaria.trim()
          ? body.senhaTemporaria.trim()
          : tipo === "pdv_senha_temp"
            ? await gerarSenhaTemporaria(portalClienteId, portalPdvId, actorFrom(session))
            : undefined;

      const email = buildInstalacaoEmail({
        tipo,
        plataforma,
        clienteNome: ctx.clienteNome,
        pdvNome: ctx.pdvNome,
        codigoDisplay: ctx.codigoDisplay,
        link,
        senhaTemporaria,
      });

      await sendEmailViaSmtp({
        to: [destino],
        subject: email.subject,
        text: email.text,
        html: email.html,
      });

      await registrarEnvio({
        portalClienteId,
        portalPdvId,
        tipo,
        plataforma,
        canal: "email",
        destinoEmail: destino,
        link,
        enviadoPor: actorFrom(session),
      });

      return NextResponse.json({ ok: true, to: destino, senhaTemporaria });
    }

    return NextResponse.json({ ok: false, error: "acao_desconhecida" }, { status: 400 });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[suporte/instalacao POST]", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
