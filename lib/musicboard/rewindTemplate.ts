import type { MusicboardRewindData } from "@/lib/musicboard/musicboardDataService";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat("pt-BR").format(n);
}

function coverCell(track: { coverUrl: string; titulo: string; artista: string }, i: number): string {
  const alt = esc(`${track.titulo} — ${track.artista}`);
  if (track.coverUrl) {
    return `<td width="33%" style="padding:4px;"><img src="${esc(track.coverUrl)}" width="100%" style="display:block; border-radius:8px;" alt="${alt}"></td>`;
  }
  const colors = ["E93A7D", "FF7A3D", "9B6BFF"];
  const color = colors[i % 3]!;
  return `<td width="33%" style="padding:4px;"><img src="https://placehold.co/200x200/${color}/0D0B14?text=+${i + 1}" width="100%" style="display:block; border-radius:8px;" alt="${alt}"></td>`;
}

function gridRows(tracks: MusicboardRewindData["topTracks"]): string {
  const rows: string[] = [];
  for (let r = 0; r < 3; r++) {
    const cells = tracks.slice(r * 3, r * 3 + 3).map((t, i) => coverCell(t, r * 3 + i));
    rows.push(`<tr>${cells.join("")}</tr>`);
  }
  return rows.join("\n");
}

/** HTML completo do moodboard REWIND (e-mail / impressão PDF). */
export function renderRewindHtml(data: MusicboardRewindData): string {
  const top = data.topTrack;
  const topCover = top?.coverUrl ?? "https://placehold.co/280x280/E93A7D/0D0B14?text=TOP+1";
  const topTitulo = top?.titulo ?? "—";
  const topArtista = top?.artista ?? "—";
  const topCount = top?.likes ?? 0;

  const depoimentoBlock =
    data.depoimentoTexto.trim()
      ? `<tr><td style="padding:0 40px 40px 40px;" align="center">
  <p style="margin:0; font-family:Georgia, serif; font-style:italic; font-size:19px; line-height:1.6; color:#F5EFE8;">
    “${esc(data.depoimentoTexto)}”
  </p>
  ${
    data.depoimentoAutor.trim()
      ? `<p style="margin:14px 0 0 0; font-family:Arial, sans-serif; font-size:12px; letter-spacing:2px; color:#9B6BFF; text-transform:uppercase;">${esc(data.depoimentoAutor)}</p>`
      : ""
  }
</td></tr>`
      : "";

  const lojasHint =
    data.lojasSample.length > 0
      ? `<p style="margin:8px 0 0; font-family:Arial,sans-serif; font-size:11px; color:#9B6BFF;">${esc(data.lojasSample.slice(0, 4).join(" · "))}</p>`
      : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ibiza Rewind — ${esc(data.clienteNome)}</title>
</head>
<body style="margin:0; padding:0; background-color:#0D0B14;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0D0B14;">
<tr><td align="center" style="padding:32px 12px;">

<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px; width:100%;">

<tr><td style="padding:48px 40px 8px 40px;" align="center">
  <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:12px; letter-spacing:4px; color:#9B6BFF; text-transform:uppercase;">
    Radio Ibiza apresenta
  </p>
  <h1 style="margin:16px 0 0 0; font-family:'Arial Black', Arial, sans-serif; font-size:52px; line-height:1.05; color:#F5EFE8;">
    REWIND<span style="color:#E93A7D;">.</span>
  </h1>
  <p style="margin:12px 0 0 0; font-family:Arial, Helvetica, sans-serif; font-size:16px; color:#F5EFE8;">
    A trilha sonora da <strong style="color:#FF7A3D;">${esc(data.clienteNome)}</strong> · ${esc(data.periodoLabel)}
  </p>
  <p style="margin:6px 0 0; font-family:Arial,sans-serif; font-size:12px; color:#9B6BFF;">Programação: ${esc(data.programacaoNome)}</p>
</td></tr>

<tr><td align="center" style="padding:24px 40px;">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td width="10" height="18" style="background:#9B6BFF;"></td><td width="6"></td>
    <td width="10" height="34" style="background:#E93A7D;"></td><td width="6"></td>
    <td width="10" height="24" style="background:#FF7A3D;"></td><td width="6"></td>
    <td width="10" height="40" style="background:#E93A7D;"></td><td width="6"></td>
    <td width="10" height="16" style="background:#9B6BFF;"></td>
  </tr></table>
</td></tr>

<tr><td style="padding:24px 40px 40px 40px;" align="center">
  <p style="margin:0; font-family:Georgia, 'Times New Roman', serif; font-style:italic; font-size:22px; line-height:1.5; color:#F5EFE8;">
    “O futuro do branding é <span style="color:#E93A7D;">multissensorial</span>.<br>
    E começa pelo som.”
  </p>
</td></tr>

<tr><td style="padding:0 40px;">
  <p style="margin:0 0 4px 0; font-family:Arial, sans-serif; font-size:12px; letter-spacing:3px; color:#9B6BFF; text-transform:uppercase;">O que mais tocou</p>
  <h2 style="margin:0 0 20px 0; font-family:'Arial Black', Arial, sans-serif; font-size:26px; color:#F5EFE8;">Seu semestre em 9 capas</h2>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${gridRows(data.topTracks)}
  </table>
</td></tr>

<tr><td style="padding:40px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#1A1426,#0D0B14); background-color:#1A1426; border-radius:14px;">
    <tr>
      <td width="160" style="padding:20px;">
        <img src="${esc(topCover)}" width="140" style="display:block; border-radius:10px;" alt="Capa do top 1">
      </td>
      <td style="padding:20px 24px 20px 0;">
        <p style="margin:0; font-family:Arial, sans-serif; font-size:11px; letter-spacing:3px; color:#FF7A3D; text-transform:uppercase;">A mais curtida</p>
        <p style="margin:8px 0 4px 0; font-family:'Arial Black', Arial, sans-serif; font-size:20px; color:#F5EFE8;">${esc(topTitulo)}</p>
        <p style="margin:0; font-family:Arial, sans-serif; font-size:14px; color:#9B6BFF;">${esc(topArtista)}</p>
        <p style="margin:14px 0 0 0; font-family:'Arial Black', Arial, sans-serif; font-size:30px; color:#E93A7D;">${fmtNum(topCount)}x</p>
        <p style="margin:2px 0 0 0; font-family:Arial, sans-serif; font-size:12px; color:#F5EFE8;">curtidas nas suas lojas</p>
        ${lojasHint}
      </td>
    </tr>
  </table>
</td></tr>

<tr><td style="padding:0 40px 40px 40px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td width="33%" align="center" style="padding:18px 8px; background-color:#1A1426; border-radius:12px;">
        <p style="margin:0; font-family:'Arial Black', Arial, sans-serif; font-size:26px; color:#FF7A3D;">${fmtNum(data.stats.horasCuradas)}h</p>
        <p style="margin:6px 0 0 0; font-family:Arial, sans-serif; font-size:12px; color:#F5EFE8;">de música curada</p>
      </td>
      <td width="8"></td>
      <td width="33%" align="center" style="padding:18px 8px; background-color:#1A1426; border-radius:12px;">
        <p style="margin:0; font-family:'Arial Black', Arial, sans-serif; font-size:26px; color:#E93A7D;">${fmtNum(data.stats.lojasVibrando)}</p>
        <p style="margin:6px 0 0 0; font-family:Arial, sans-serif; font-size:12px; color:#F5EFE8;">lojas vibrando</p>
      </td>
      <td width="8"></td>
      <td width="33%" align="center" style="padding:18px 8px; background-color:#1A1426; border-radius:12px;">
        <p style="margin:0; font-family:'Arial Black', Arial, sans-serif; font-size:26px; color:#9B6BFF;">${fmtNum(data.stats.faixasNarrativa)}</p>
        <p style="margin:6px 0 0 0; font-family:Arial, sans-serif; font-size:12px; color:#F5EFE8;">faixas na narrativa</p>
      </td>
    </tr>
  </table>
</td></tr>

${depoimentoBlock}

<tr><td style="padding:0 40px 40px 40px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-left:4px solid #E93A7D;">
    <tr><td style="padding:4px 0 4px 20px;">
      <p style="margin:0 0 8px 0; font-family:Arial, sans-serif; font-size:12px; letter-spacing:3px; color:#FF7A3D; text-transform:uppercase;">A narrativa por trás</p>
      <p style="margin:0; font-family:Arial, sans-serif; font-size:15px; line-height:1.7; color:#F5EFE8;">
        ${esc(data.narrativaCurador)}
        <br><br><em style="color:#9B6BFF;">Dados reconhecem padrões. Curadoria reconhece contexto.</em>
      </p>
    </td></tr>
  </table>
</td></tr>

<tr><td align="center" style="padding:8px 40px 48px 40px; border-top:1px solid #241D33;">
  <p style="margin:32px 0 0 0; font-family:'Arial Black', Arial, sans-serif; font-size:22px; color:#F5EFE8;">
    Som não é detalhe.<br><span style="color:#E93A7D;">É posicionamento.</span>
  </p>
  <p style="margin:20px 0 0 0; font-family:Arial, sans-serif; font-size:13px; color:#9B6BFF;">
    Radio Ibiza · Identidade musical para marcas<br>
    <a href="https://radioibiza.com.br" style="color:#FF7A3D; text-decoration:none;">radioibiza.com.br</a>
  </p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

export function renderRewindPlainText(data: MusicboardRewindData): string {
  const lines = [
    `Radio Ibiza REWIND — ${data.clienteNome}`,
    `Período: ${data.periodoLabel}`,
    "",
    "Top faixas curtidas:",
    ...data.topTracks
      .filter((t) => t.likes > 0)
      .map((t, i) => `${i + 1}. ${t.artista} — ${t.titulo} (${t.likes} curtidas)`),
    "",
    `Horas curadas: ${data.stats.horasCuradas}h | Lojas: ${data.stats.lojasVibrando} | Faixas: ${data.stats.faixasNarrativa}`,
    "",
    data.narrativaCurador,
    "",
    "Radio Ibiza · radioibiza.com.br",
  ];
  return lines.join("\n");
}

/** Abre janela de impressão (Salvar como PDF). */
export function printRewindPdf(html: string, title: string): void {
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.document.title = title;
  w.focus();
  setTimeout(() => {
    w.print();
  }, 400);
}
