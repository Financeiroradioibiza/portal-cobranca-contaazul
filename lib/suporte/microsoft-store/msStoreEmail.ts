import { COMPANY_NAME } from "@/lib/brand";
import { MICROSOFT_STORE_LISTING_URL, msStorePlayerPublicOrigin } from "./msStoreConstants";

export function buildMsStoreInstalacaoEmail(input: {
  clienteNome: string;
  pdvNome: string;
  codigoDisplay: string;
  codigoMsStore: string;
}): { subject: string; text: string; html: string } {
  const storeUrl = MICROSOFT_STORE_LISTING_URL;
  const appUrl = `${msStorePlayerPublicOrigin()}/instalar-msstore?ibiza_app=msstore`;
  const subject = `${COMPANY_NAME} — Player na Microsoft Store (${input.pdvNome})`;

  const passos = [
    "Abra a Microsoft Store neste e-mail e instale «Rádio Ibiza Player» no Windows.",
    "Abra o app pelo Menu Iniciar e digite o código MS8 abaixo (uso único).",
    "Aguarde o download da programação e confirme os dados da loja.",
  ];

  const text = [
    "Olá!",
    "",
    `Instalação Microsoft Store — ${COMPANY_NAME}`,
    "",
    `Cliente: ${input.clienteNome}`,
    `PDV: ${input.pdvNome} (${input.codigoDisplay})`,
    "",
    "Código MS8:",
    input.codigoMsStore,
    "",
    "Microsoft Store:",
    storeUrl,
    "",
    "App (após instalar da loja):",
    appUrl,
    "",
    ...passos.map((p, i) => `${i + 1}. ${p}`),
    "",
    `Equipe ${COMPANY_NAME}`,
  ].join("\n");

  const html = `<!DOCTYPE html><html lang="pt-BR"><body style="font-family:Segoe UI,sans-serif;background:#111;color:#eee;padding:24px">
<h1 style="color:#f0abfc">Microsoft Store — Player ${COMPANY_NAME}</h1>
<p><strong>Cliente:</strong> ${escapeHtml(input.clienteNome)}<br/>
<strong>PDV:</strong> ${escapeHtml(input.pdvNome)} (${escapeHtml(input.codigoDisplay)})</p>
<p style="font-size:22px;font-family:monospace;letter-spacing:0.15em;color:#f5d0fe"><strong>${escapeHtml(input.codigoMsStore)}</strong></p>
<p><a href="${escapeHtml(storeUrl)}" style="color:#86efac">Abrir Microsoft Store</a></p>
<ol>${passos.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ol>
</body></html>`;

  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
