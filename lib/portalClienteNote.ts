/**
 * Observações internas por cliente: histórico com carimbo de data/hora (Brasil).
 * Usado pelo dashboard ao sair da caixa de texto ou ao encerrar a página.
 */

const STAMP_ZONE = "America/Sao_Paulo";

export function formatPortalNoteStampBr(now = new Date()): string {
  const dtf = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: STAMP_ZONE,
  });
  return `${dtf.format(now)} (Horário Brasília)`;
}

export type PersistNoteComposeResult =
  /** Nada novo a gravar neste flush (texto igual ao snapshot no foco / sem incremento útil). */
  | { action: "skip" }
  /** Substitui o blob guardado pelo conteúdo actual (edição estrutural fora da regra append). */
  | { action: "replace"; note: string }
  /** Concatena entrada datada ao conteúdo persistido antes desta edição (append no fim da sessão de foco). */
  | { action: "append"; note: string };

/**
 * Decide como persistir a observação quando o campo perde foco ou a página fecha.
 *
 * `lastPersisted` — último texto confirmado pelo servidor neste navegador.
 * `snapshotOnFocus` — valor do campo ao ganhar foco (início da “sessão de edição”).
 * `draft` — valor atual.
 */
export function composePersistClienteNote(params: {
  lastPersisted: string;
  snapshotOnFocus?: string | undefined | null;
  draft: string;
  now?: Date;
}): PersistNoteComposeResult {
  const { lastPersisted, draft, snapshotOnFocus } = params;
  const now = params.now ?? new Date();
  const stamp = `[${formatPortalNoteStampBr(now)}]`;

  const resolvedSnap =
    typeof snapshotOnFocus === "string" ? snapshotOnFocus : lastPersisted;

  /** Sem alterações desde que o campo ganhou foco. */
  if (draft === resolvedSnap || draft.trim() === resolvedSnap.trim()) {
    return { action: "skip" };
  }

  /** O utilizador apenas acrescentou texto após o snapshot de foco. */
  if (draft.startsWith(resolvedSnap)) {
    let increment = draft.slice(resolvedSnap.length);
    increment = increment.replace(/^\uFEFF?(\r?\n)+/, "");
    if (!increment.trim()) {
      return { action: "skip" };
    }
    const base = lastPersisted.replace(/\s+$/u, "");
    const block = `${stamp}\n${increment.replace(/\s+$/u, "")}`;
    const appended = base ? `${base}\n\n${block}` : block;
    if (appended.trim() === lastPersisted.trim()) {
      return { action: "skip" };
    }
    return { action: "append", note: appended };
  }

  /** Edição estrutural (mudou dentro do texto antigo ou apagou), guardamos o texto completo visto pelo utilizador. */
  if (draft.trim() === lastPersisted.trim()) {
    return { action: "skip" };
  }
  return { action: "replace", note: draft };
}
