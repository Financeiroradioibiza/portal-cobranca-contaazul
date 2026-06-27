import { getJobDetail } from "@/lib/criacao/filaService";

/** Gera log de texto plano de um lote de upload (por nome/título do job). */
export async function buildUploadJobTextLog(jobId: string): Promise<string | null> {
  const job = await getJobDetail(jobId);
  if (!job) return null;

  const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const lines: string[] = [
    "RADIO IBIZA — Log de upload",
    `Lote: ${job.titulo}`,
    `Gerado em: ${now}`,
  ];
  if (job.clienteNome) lines.push(`Cliente: ${job.clienteNome}`);
  if (job.programacaoNome) lines.push(`Programação: ${job.programacaoNome}`);
  if (job.pastaNome) lines.push(`Pasta: ${job.pastaNome}`);
  if (job.uploadTagNome) lines.push(`Tag: ${job.uploadTagNome}`);
  if (job.criativoNome) lines.push(`Criativo: ${job.criativoNome}`);
  lines.push("", "--- Faixas ---", "");

  for (const it of job.itens) {
    const descartada = (it.erroMsg ?? "").startsWith("Descartada (duplicata confirmada)");
    const status =
      descartada ? "duplicata (descartada)"
      : it.status === "concluido" ? "publicada"
      : it.status;
    lines.push(`• ${it.arquivoNome} — ${status}`);
  }

  lines.push("", `Total: ${job.itens.length} arquivo(s)`);
  return lines.join("\n");
}
