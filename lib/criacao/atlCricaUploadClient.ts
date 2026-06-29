import { defaultUploadCompetenciaTag } from "@/lib/criacao/uploadCompetenciaTag";

type Ticket = { itemId: string; arquivoNome: string; token: string; exp: number };

export type AtlCricaUploadLote = {
  programacaoId: string;
  pastaId: string;
  pastaNome: string;
  programacaoNome: string;
  arquivos: File[];
};

function uploadTagFromCompetencia(competencia: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(competencia.trim());
  if (m) return `${m[2]}/${m[1]!.slice(-2)}`;
  return defaultUploadCompetenciaTag();
}

export async function submitAtlCricaFileUpload(opts: {
  titulo: string;
  competencia: string;
  clienteRef: string;
  clienteNome: string;
  lotes: AtlCricaUploadLote[];
  onProgress?: (done: number, total: number, label?: string) => void;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const lotesComArquivos = opts.lotes.filter((l) => l.arquivos.length > 0);
  if (lotesComArquivos.length === 0) return { ok: true };

  const uploadTag = uploadTagFromCompetencia(opts.competencia);
  const totalUpload = lotesComArquivos.reduce((n, l) => n + l.arquivos.length, 0);
  let done = 0;

  const res = await fetch("/api/criacao/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      titulo: opts.titulo,
      lotes: lotesComArquivos.map((l) => ({
        titulo: `ATL CRICA · ${l.pastaNome}`,
        destinoTipo: "pasta" as const,
        clienteRef: opts.clienteRef,
        clienteNome: opts.clienteNome,
        programacaoId: l.programacaoId,
        pastaId: l.pastaId,
        uploadTagNome: uploadTag,
        arquivos: l.arquivos.map((f) => ({ nome: f.name, sizeBytes: f.size })),
      })),
    }),
  });

  if (!res.ok) return { ok: false, error: "Falha ao enfileirar upload." };

  const data = (await res.json()) as {
    ingestUrl: string;
    jobs: Array<{ jobId: string; titulo: string; tickets: Ticket[] }>;
  };

  const falhas: string[] = [];
  for (let i = 0; i < lotesComArquivos.length; i++) {
    const lote = lotesComArquivos[i]!;
    const job = data.jobs[i];
    if (!job) {
      falhas.push(...lote.arquivos.map((f) => f.name));
      done += lote.arquivos.length;
      opts.onProgress?.(done, totalUpload, lote.pastaNome);
      continue;
    }
    const ticketByNome = new Map(job.tickets.map((t) => [t.arquivoNome, t]));
    for (const f of lote.arquivos) {
      opts.onProgress?.(done, totalUpload, lote.pastaNome);
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
  }

  if (falhas.length > 0) {
    return {
      ok: false,
      error: `${totalUpload - falhas.length}/${totalUpload} enviados. Falharam: ${falhas.slice(0, 5).join(", ")}${falhas.length > 5 ? "…" : ""}`,
    };
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
