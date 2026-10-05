import "server-only";

function chamadosAppOrigin(): string {
  const app =
    process.env.NEXT_PUBLIC_CHAMADOS_APP_URL?.trim() ||
    process.env.CHAMADOS_APP_PUBLIC_ORIGIN?.trim() ||
    "https://chamados.radioibiza.app.br";
  return app.replace(/\/$/, "");
}

/** Deep link app Chamados (site separado). */
export function chamadosMobilePushUrl(query?: {
  conversa?: string;
  chamadoId?: string;
  view?: "agenda" | "chat" | "tickets";
}): string {
  const base = `${chamadosAppOrigin()}/`;
  const qs = new URLSearchParams();
  if (query?.view === "agenda") {
    qs.set("view", "agenda");
  }
  if (query?.conversa?.trim()) {
    qs.set("view", "chat");
    qs.set("conversa", query.conversa.trim());
  }
  if (query?.chamadoId?.trim()) {
    qs.set("view", "tickets");
    qs.set("chamado", query.chamadoId.trim());
  }
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}
