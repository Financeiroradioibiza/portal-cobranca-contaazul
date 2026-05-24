import { NextResponse } from "next/server";

const MIN_SECRET_LEN = 16;

/** Segredo para cron / ferramentas que disparam OC automático (variável forte, nunca commits). */
export function ocAutoDispatchCronSecret(): string | null {
  const s = (process.env.OC_EMAIL_CRON_SECRET ?? process.env.CRON_SECRET ?? "").trim();
  return s.length >= MIN_SECRET_LEN ? s : null;
}

export function authorizeOcAutoDispatchCron(request: Request): { ok: true } | { ok: false; response: NextResponse } {
  const secret = ocAutoDispatchCronSecret();
  if (!secret) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "cron_secret_not_configured", message: "Defina OC_EMAIL_CRON_SECRET (≥16 caracteres) ou CRON_SECRET." },
        { status: 503 },
      ),
    };
  }
  const auth = (request.headers.get("authorization") ?? "").trim();
  if (auth !== `Bearer ${secret}`) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true };
}
