import { NextResponse } from "next/server";
import { getPortalSession, requirePortalSession } from "@/lib/auth/portalAccess";
import { isOcSmtpConfigured, sendEmailViaSmtp } from "@/lib/email/ocSmtp";
import {
  getMusicboardConfig,
  markMusicboardEnviado,
} from "@/lib/musicboard/musicboardConfigService";
import { buildMusicboardRewindData } from "@/lib/musicboard/musicboardDataService";
import { renderRewindHtml, renderRewindPlainText } from "@/lib/musicboard/rewindTemplate";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseId(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.trunc(raw);
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    const n = Number(raw.trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

function parseEmails(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (!EMAIL_RE.test(t)) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function actorFrom(session: { email: string; displayName?: string }): string {
  return (session.displayName?.trim() || session.email || "").slice(0, 120);
}

/** POST /api/musicboard/send — envia REWIND por e-mail. */
export async function POST(request: Request) {
  let session;
  try {
    session = requirePortalSession(await getPortalSession());
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!isOcSmtpConfigured()) {
    return NextResponse.json({ ok: false, error: "smtp_nao_configurado" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const portalClienteId = parseId(body.portalClienteId);
  if (portalClienteId == null) {
    return NextResponse.json({ ok: false, error: "cliente_invalido" }, { status: 400 });
  }

  const config = await getMusicboardConfig(portalClienteId);
  const to = parseEmails(body.to);
  const recipients = to.length > 0 ? to : (config?.emails ?? []);
  if (recipients.length === 0) {
    return NextResponse.json({ ok: false, error: "email_invalido" }, { status: 400 });
  }

  try {
    const data = await buildMusicboardRewindData({ portalClienteId, config });
    const html = renderRewindHtml(data);
    const text = renderRewindPlainText(data);
    const subject = `Radio Ibiza REWIND — ${data.clienteNome} · ${data.periodoLabel}`;

    await sendEmailViaSmtp({
      to: recipients,
      subject,
      text,
      html,
      mailProfile: "suporte",
    });

    if (config) {
      await markMusicboardEnviado(portalClienteId, actorFrom(session));
    }

    return NextResponse.json({
      ok: true,
      enviadoPara: recipients,
      subject,
    });
  } catch (e) {
    console.error("[musicboard/send POST]", e);
    const msg = e instanceof Error ? e.message : "server_error";
    if (msg === "cliente_nao_encontrado") {
      return NextResponse.json({ ok: false, error: msg }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
