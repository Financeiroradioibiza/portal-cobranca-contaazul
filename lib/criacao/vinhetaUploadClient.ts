const VINHETA_UPLOAD_ERRORS: Record<string, string> = {
  ingest_desabilitado: "Upload indisponível — configure CRIACAO_INGEST_SECRET no portal.",
  ticket_falhou: "Não foi possível obter ticket de upload.",
  token_invalido: "Ticket expirado — tente enviar de novo.",
  token_ausente: "Upload rejeitado (token ausente).",
  arquivo_ausente: "Nenhum arquivo selecionado.",
  formato_invalido: "Use arquivo MP3.",
  vinheta_nao_encontrada: "Vinheta não encontrada.",
  upload_falhou: "Falha ao enviar o áudio.",
};

export function vinhetaUploadErrorMessage(code: string): string {
  return VINHETA_UPLOAD_ERRORS[code] ?? `Falha ao enviar áudio: ${code}`;
}

/** Envia MP3 direto ao cloud2 (multipart). */
export async function uploadVinhetaAudio(vinhetaId: string, file: File): Promise<void> {
  const tk = await fetch(`/api/criacao/vinhetas/${vinhetaId}/upload-ticket`, { method: "POST" });
  const ticket = (await tk.json().catch(() => ({}))) as {
    error?: string;
    ingestUrl?: string;
    token?: string;
  };
  if (!tk.ok) throw new Error(ticket.error ?? "ticket_falhou");

  const fd = new FormData();
  fd.append("token", ticket.token ?? "");
  fd.append("file", file, file.name);

  const up = await fetch(ticket.ingestUrl ?? "", { method: "POST", body: fd });
  const body = (await up.json().catch(() => ({}))) as { error?: string };
  if (!up.ok) throw new Error(body.error ?? "upload_falhou");
}
