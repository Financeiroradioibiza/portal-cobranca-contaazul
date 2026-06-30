import { isAtlCricaAbertura } from "@/lib/criacao/atlCricaConstants";

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function AtlCricaAberturaAviso({
  abertaPor,
  abertaEm,
  criativoNomeDb,
  compact,
}: {
  abertaPor: string;
  abertaEm?: string | null;
  criativoNomeDb?: string;
  compact?: boolean;
}) {
  if (!isAtlCricaAbertura(abertaPor)) return null;
  const dono = criativoNomeDb?.trim() || "Sem dono";
  return (
    <div
      className={
        "rounded-lg border border-violet-300 bg-violet-50/90 dark:border-violet-800 dark:bg-violet-950/40 " +
        (compact ? "px-2.5 py-2 text-[11px]" : "px-3 py-2.5 text-xs")
      }
    >
      <div className="font-bold text-violet-900 dark:text-violet-100">Abertura via ATL CRICA</div>
      <div className="mt-0.5 text-violet-800 dark:text-violet-200">
        Dono: <strong>{dono}</strong>
        {abertaEm ?
          <span className="text-violet-700 dark:text-violet-300"> · {fmtWhen(abertaEm)}</span>
        : null}
      </div>
      {!compact ?
        <p className="mt-1 text-[10px] text-violet-700 dark:text-violet-300">
          Produção: faixas entram nas pastas após a fila (só revise se houver duplicata). Feche a programação aqui.
        </p>
      : null}
    </div>
  );
}
