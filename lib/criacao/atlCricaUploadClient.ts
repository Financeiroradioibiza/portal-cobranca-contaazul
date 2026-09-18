import { buildAtlCricaPastaUploadTag } from "@/lib/criacao/atlCricaUploadTag";

type Ticket = { itemId: string; arquivoNome: string; token: string; exp: number };

export type AtlCricaUploadLote = {
  programacaoId: string;
  pastaId: string;
  pastaNome: string;
  programacaoNome: string;
  arquivos: File[];
  clienteRef?: string;
  clienteNome?: string;
  /** Dono da programação — define iniciais da tag ([LA] …). */
  criativoUserId?: string | null;
};

async function uploadErrorFromResponse(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
  if (data?.message) return data.message;
  if (res.status === 504) return "Portal demorou demais (504). Confira a Fila antes de enviar de novo.";
  return "Falha ao enfileirar upload.";
}

async function uploadOneAtlCricaLote(
  opts: {
    titulo: string;
    lote: AtlCricaUploadLote & { clienteRef: string; clienteNome: string };
  },
  onProgress?: (done: number, total: number, label?: string) => void,
  progress?: { done: number; total: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const l = opts.lote;
  const res = await fetch("/api/criacao/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      titulo: opts.titulo,
      lotes: [
        {
          titulo: `ATL CRICA · ${l.pastaNome}`,
          destinoTipo: "pasta" as const,
          clienteRef: l.clienteRef,
          clienteNome: l.clienteNome,
          programacaoId: l.programacaoId,
          pastaId: l.pastaId,
          uploadTagNome: buildAtlCricaPastaUploadTag(l.pastaNome),
          tagCriativoUserId: l.criativoUserId?.trim() || undefined,
          arquivos: l.arquivos.map((f) => ({ nome: f.name, sizeBytes: f.size })),
        },
      ],
    }),
  });

  if (!res.ok) {
    return { ok: false, error: await uploadErrorFromResponse(res) };
  }

  const data = (await res.json()) as {
    ingestUrl: string;
    jobs: Array<{ jobId: string; titulo: string; tickets: Ticket[] }>;
  };

  const job = data.jobs[0];
  if (!job) {
    return { ok: false, error: `Job não criado para pasta ${l.pastaNome}.` };
  }

  const ticketByNome = new Map(job.tickets.map((t) => [t.arquivoNome, t]));
  const falhas: string[] = [];
  let done = progress?.done ?? 0;
  const total = progress?.total ?? l.arquivos.length;

  for (const f of l.arquivos) {
    onProgress?.(done, total, l.pastaNome);
    const ticket = ticketByNome.get(f.name.slice(0, 500));
    if (!ticket) {
      falhas.push(f.name);
      done += 1;
      continue;
    }
    const fd = new FormData();
    fd.append("token", ticket.token);
    fd.append("file", f, f.name);
    try {
      const up = await fetch(data.ingestUrl, { method: "POST", body: fd });
      if (!up.ok) falhas.push(f.name);
    } catch {
      falhas.push(f.name);
    }
    done += 1;
  }

  if (falhas.length > 0) {
    return {
      ok: false,
      error: `${l.arquivos.length - falhas.length}/${l.arquivos.length} enviados em ${l.pastaNome}. Falharam: ${falhas.slice(0, 5).join(", ")}${falhas.length > 5 ? "…" : ""}`,
    };
  }
  return { ok: true };
}

export async function submitAtlCricaFileUpload(opts: {
  titulo: string;
  competencia: string;
  clienteRef: string;
  clienteNome: string;
  lotes: AtlCricaUploadLote[];
  onProgress?: (done: number, total: number, label?: string) => void;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return submitAtlCricaImportUpload({
    titulo: opts.titulo,
    competencia: opts.competencia,
    lotes: opts.lotes.map((l) => ({
      ...l,
      clienteRef: l.clienteRef ?? opts.clienteRef,
      clienteNome: l.clienteNome ?? opts.clienteNome,
    })),
    onProgress: opts.onProgress,
  });
}

export async function submitAtlCricaImportUpload(opts: {
  titulo: string;
  competencia: string;
  lotes: Array<AtlCricaUploadLote & { clienteRef: string; clienteNome: string }>;
  onProgress?: (done: number, total: number, label?: string) => void;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const lotesComArquivos = opts.lotes.filter((l) => l.arquivos.length > 0);
  if (lotesComArquivos.length === 0) return { ok: true };

  const totalUpload = lotesComArquivos.reduce((n, l) => n + l.arquivos.length, 0);
  let done = 0;

  for (let i = 0; i < lotesComArquivos.length; i++) {
    const lote = lotesComArquivos[i]!;
    opts.onProgress?.(done, totalUpload, `${i + 1}/${lotesComArquivos.length} · ${lote.pastaNome}`);

    const result = await uploadOneAtlCricaLote(
      { titulo: opts.titulo, lote },
      opts.onProgress,
      { done, total: totalUpload },
    );
    if (!result.ok) {
      return {
        ok: false,
        error: `${result.error} (lote ${i + 1}/${lotesComArquivos.length}). Lotes anteriores podem já estar na Fila.`,
      };
    }
    done += lote.arquivos.length;
  }

  return { ok: true };
}

export async function addBibliotecaMusicasToPastas(
  items: Array<{ pastaId: string; musicaIds: string[] }>,
): Promise<void> {
  for (const item of items) {
    if (item.musicaIds.length === 0) continue;
    await fetch(`/api/criacao/pastas/${encodeURIComponent(item.pastaId)}/musicas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ musicaIds: item.musicaIds }),
    });
  }
}

export async function abrirProgramacoesAtlCrica(programacaoIds: string[]): Promise<void> {
  for (const programacaoId of programacaoIds) {
    await fetch("/api/criacao/atl-crica/abrir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programacaoId }),
    });
  }
}

export async function marcarSubidoAtlCrica(programacaoIds: string[], competencia: string): Promise<void> {
  if (programacaoIds.length === 0) return;
  await fetch("/api/criacao/atl-crica/marcar-subido", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ programacaoIds, competencia }),
  });
}
