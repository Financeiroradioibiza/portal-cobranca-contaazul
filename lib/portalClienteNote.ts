/**
 * Observações internas por cliente: histórico com carimbo de data/hora (Brasil).
 * Usado pelo dashboard ao sair da caixa de texto ou ao encerrar a página.
 */

const STAMP_ZONE = "America/Sao_Paulo";

/** Linha de abertura de bloco gravado pelo portal. */
const STAMP_LINE_RE =
  /^\[\d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d{2}:\d{2} \(Horário Brasília\)\]$/;

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

function stampMsFromBlock(block: string): number | null {
  const firstLine = block.split(/\r?\n/)[0]?.trim() ?? "";
  const m = firstLine.match(
    /^\[(\d{1,2})\/(\d{1,2})\/(\d{4}), (\d{1,2}):(\d{2}):(\d{2})/,
  );
  if (!m) return null;
  const [, dd, mm, yyyy, h, mi, s] = m;
  return new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(h),
    Number(mi),
    Number(s),
  ).getTime();
}

/** Divide o histórico em blocos (cada bloco começa com `[data/hora]` quando foi append automático). */
export function parsePortalNoteBlocks(note: string): string[] {
  const trimmed = note.trim();
  if (!trimmed) return [];

  const blocks: string[] = [];
  let current = "";

  for (const line of trimmed.split(/\r?\n/)) {
    if (STAMP_LINE_RE.test(line.trim()) && current.trim()) {
      blocks.push(current.trim());
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }

  if (current.trim()) blocks.push(current.trim());
  return blocks;
}

export function sortPortalNoteBlocksNewestFirst(blocks: string[]): string[] {
  return [...blocks].sort((a, b) => {
    const ta = stampMsFromBlock(a);
    const tb = stampMsFromBlock(b);
    if (ta == null && tb == null) return 0;
    if (ta == null) return 1;
    if (tb == null) return -1;
    return tb - ta;
  });
}

/** Exibe o histórico com o contato mais recente no topo (inclui dados antigos gravados ao contrário). */
export function formatPortalNoteForDisplay(note: string): string {
  const blocks = parsePortalNoteBlocks(note);
  if (blocks.length <= 1) return note.trim();
  return sortPortalNoteBlocksNewestFirst(blocks).join("\n\n");
}

function prependPortalNoteBlock(base: string, block: string): string {
  const normalizedBase = formatPortalNoteForDisplay(base);
  return normalizedBase.trim() ? `${block}\n\n${normalizedBase}` : block;
}

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

  /** Novo texto no topo (ordem de exibição: mais recente primeiro). */
  if (resolvedSnap && draft.endsWith(resolvedSnap)) {
    let increment = draft.slice(0, draft.length - resolvedSnap.length);
    increment = increment.replace(/(\r?\n)+$/u, "").trim();
    if (!increment) {
      return { action: "skip" };
    }
    const block = `${stamp}\n${increment.replace(/\s+$/u, "")}`;
    const appended = prependPortalNoteBlock(resolvedSnap, block);
    if (appended.trim() === formatPortalNoteForDisplay(lastPersisted).trim()) {
      return { action: "skip" };
    }
    return { action: "append", note: appended };
  }

  /** Acrescentou texto após o snapshot de foco (fim do campo). */
  if (draft.startsWith(resolvedSnap)) {
    let increment = draft.slice(resolvedSnap.length);
    increment = increment.replace(/^\uFEFF?(\r?\n)+/, "");
    if (!increment.trim()) {
      return { action: "skip" };
    }
    const block = `${stamp}\n${increment.replace(/\s+$/u, "")}`;
    const appended = prependPortalNoteBlock(resolvedSnap, block);
    if (appended.trim() === formatPortalNoteForDisplay(lastPersisted).trim()) {
      return { action: "skip" };
    }
    return { action: "append", note: appended };
  }

  /** Edição estrutural (mudou dentro do texto antigo ou apagou), guardamos o texto completo visto pelo utilizador. */
  if (draft.trim() === formatPortalNoteForDisplay(lastPersisted).trim()) {
    return { action: "skip" };
  }
  return { action: "replace", note: formatPortalNoteForDisplay(draft) };
}
