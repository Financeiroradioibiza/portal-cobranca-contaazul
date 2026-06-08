import { NextResponse } from "next/server";

const FRIENDLY: Record<string, { status: number; message: string }> = {
  month_closed: {
    status: 409,
    message: "Competência fechada — não dá para alterar PDVs neste mês. Abra o mês ativo (ex.: jun/2026).",
  },
  month_not_found: { status: 404, message: "Competência não encontrada." },
  line_not_found: { status: 404, message: "Cliente não encontrado nesta competência." },
};

export type RioApiErrorContext = {
  route: string;
  ym?: number;
  linhaId?: string;
};

function newDebugId(): string {
  return `rio_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function serializeThrown(e: unknown): {
  name?: string;
  message: string;
  prismaCode?: string;
  stack?: string;
} {
  if (e instanceof Error) {
    const prisma = e as Error & { code?: string };
    return {
      name: e.name,
      message: e.message,
      prismaCode: typeof prisma.code === "string" ? prisma.code : undefined,
      stack: e.stack?.split("\n").slice(0, 12).join("\n"),
    };
  }
  return { message: String(e) };
}

function buildDebug(e: unknown, ctx?: RioApiErrorContext) {
  const id = newDebugId();
  const thrown = serializeThrown(e);
  console.error(`[rio-api] ${id}`, ctx?.route, thrown.message, e);
  return {
    id,
    at: new Date().toISOString(),
    route: ctx?.route,
    ym: ctx?.ym,
    linhaId: ctx?.linhaId,
    ...thrown,
  };
}

export function rioRouteErrorResponse(e: unknown, ctx?: RioApiErrorContext): NextResponse {
  const code = e instanceof Error ? e.message : "erro";
  const debug = buildDebug(e, ctx);
  const known = FRIENDLY[code];
  if (known) {
    return NextResponse.json(
      { ok: false, error: code, message: known.message, debug },
      { status: known.status },
    );
  }
  const prismaInternal =
    typeof code === "string" &&
    /internal error|Can't reach database|P1001|P1017|connection/i.test(code);
  return NextResponse.json(
    {
      ok: false,
      error: prismaInternal ? "database_unreachable" : "server_error",
      message: prismaInternal ?
        "Banco indisponível no servidor (confira DATABASE_URL no Netlify e se o Neon está ativo)."
      : "Erro interno ao salvar. Tente de novo ou avise o suporte.",
      debug,
    },
    { status: 500 },
  );
}
