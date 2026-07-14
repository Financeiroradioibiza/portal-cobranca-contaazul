export type AtualizacaoLogExportFaixa = {
  musicaId: string;
  titulo: string;
  artista: string;
  pastaNome: string;
};

export type AtualizacaoLogExportCronograma = {
  agendamentoId: string;
  alvoTipo: string;
  alvoNome: string;
  resumo: string;
};

export type AtualizacaoLogExportData = {
  rotuloLog: string;
  codigo: string;
  revision: number;
  disparadaEm: string;
  disparadaPor: string;
  clienteNomeLog?: string;
  pdvsLog?: string;
  programacaoNomeLog?: string;
  diff: {
    entraram: AtualizacaoLogExportFaixa[];
    sairam: AtualizacaoLogExportFaixa[];
    cronogramasEntraram?: AtualizacaoLogExportCronograma[];
    cronogramasSairam?: AtualizacaoLogExportCronograma[];
  };
};

function fmtData(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return iso;
  }
}

function faixaLine(f: AtualizacaoLogExportFaixa): string {
  const pasta = f.pastaNome ? `[${f.pastaNome}] ` : "";
  const artista = f.artista ? ` — ${f.artista}` : "";
  return `${pasta}${f.titulo}${artista}`;
}

function cronogramaLine(c: AtualizacaoLogExportCronograma): string {
  const alvo = c.alvoTipo === "vinheta" ? "Vinheta" : "Pasta";
  return `[${alvo}: ${c.alvoNome}] ${c.resumo}`;
}

/** Abre janela de impressão (Salvar como PDF) com logo Radio Ibiza e detalhes da atualização. */
export function printAtualizacaoLogPdf(log: AtualizacaoLogExportData): void {
  const ent = log.diff?.entraram ?? [];
  const sai = log.diff?.sairam ?? [];
  const cEnt = log.diff?.cronogramasEntraram ?? [];
  const cSai = log.diff?.cronogramasSairam ?? [];

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${log.rotuloLog ?? log.codigo} — Log de atualização</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; color: #1e293b; margin: 0; padding: 32px; font-size: 12px; line-height: 1.45; }
    .logo { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; border-bottom: 2px solid #1b5e37; padding-bottom: 16px; }
    .logo-star { width: 28px; height: 28px; background: #1b5e37; clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%); }
    .logo-name { font-size: 20px; font-weight: 800; letter-spacing: 0.08em; color: #1b5e37; }
    .logo-sub { font-size: 10px; color: #64748b; letter-spacing: 0.12em; text-transform: uppercase; }
    h1 { font-size: 16px; margin: 0 0 4px; }
    .meta { color: #64748b; margin-bottom: 20px; }
    .meta p { margin: 2px 0; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
    .box h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 8px; }
    .ent h2 { color: #047857; }
    .sai h2 { color: #b91c1c; }
    .cron-ent h2 { color: #0369a1; }
    .cron-sai h2 { color: #b45309; }
    .section { margin-top: 16px; }
    ul { margin: 0; padding-left: 16px; }
    li { margin-bottom: 3px; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <div class="logo">
    <div class="logo-star"></div>
    <div>
      <div class="logo-name">RADIO IBIZA</div>
      <div class="logo-sub">Log de atualização de programação</div>
    </div>
  </div>
  <h1>${escapeHtml(log.rotuloLog ?? log.codigo)}</h1>
  <div class="meta">
    ${log.clienteNomeLog ? `<p><strong>Cliente:</strong> ${escapeHtml(log.clienteNomeLog)}</p>` : ""}
    ${log.pdvsLog ? `<p><strong>PDV(s):</strong> ${escapeHtml(log.pdvsLog)}</p>` : ""}
    ${log.programacaoNomeLog ? `<p><strong>Programação:</strong> ${escapeHtml(log.programacaoNomeLog)}</p>` : ""}
    <p><strong>Revisão:</strong> ${log.revision} · <strong>Disparada em:</strong> ${escapeHtml(fmtData(log.disparadaEm))}</p>
    <p><strong>Por:</strong> ${escapeHtml(log.disparadaPor)}</p>
  </div>
  <div class="grid">
    <div class="box ent">
      <h2>Faixas entraram (${ent.length})</h2>
      ${ent.length ? `<ul>${ent.map((f) => `<li>${escapeHtml(faixaLine(f))}</li>`).join("")}</ul>` : "<p>—</p>"}
    </div>
    <div class="box sai">
      <h2>Faixas saíram (${sai.length})</h2>
      ${sai.length ? `<ul>${sai.map((f) => `<li>${escapeHtml(faixaLine(f))}</li>`).join("")}</ul>` : "<p>—</p>"}
    </div>
  </div>
  ${
    cEnt.length + cSai.length > 0 ?
      `<div class="grid section">
    <div class="box cron-ent">
      <h2>Cronogramas criados (${cEnt.length})</h2>
      ${cEnt.length ? `<ul>${cEnt.map((c) => `<li>${escapeHtml(cronogramaLine(c))}</li>`).join("")}</ul>` : "<p>—</p>"}
    </div>
    <div class="box cron-sai">
      <h2>Cronogramas apagados (${cSai.length})</h2>
      ${cSai.length ? `<ul>${cSai.map((c) => `<li>${escapeHtml(cronogramaLine(c))}</li>`).join("")}</ul>` : "<p>—</p>"}
    </div>
  </div>`
    : ""
  }
</body>
</html>`;

  const w = window.open("", "_blank");
  if (!w) {
    window.alert("Permita pop-ups para exportar o PDF.");
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  w.onload = () => {
    w.print();
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
