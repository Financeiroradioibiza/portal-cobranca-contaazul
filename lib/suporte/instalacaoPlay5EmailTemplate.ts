import fs from "node:fs";
import path from "node:path";
import { portalPublicAsset } from "@/lib/brand";

let cachedTemplate: string | null = null;

function loadTemplate(): string {
  if (!cachedTemplate) {
    cachedTemplate = fs.readFileSync(
      path.join(process.cwd(), "lib/suporte/templates/instalacao-play5-v3.html"),
      "utf8",
    );
  }
  return cachedTemplate;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderInstalacaoPlay5EmailHtml(input: {
  clienteNome: string;
  pdvNome: string;
  codigoDisplay: string;
  codigoPlay: string;
  playUrl: string;
}): string {
  const heroBanner = portalPublicAsset("/email/instalacao-play5-hero-banner.png");

  return loadTemplate()
    .replace(/\{\{ASSET_instalacao-play5-hero-banner\.png\}\}/g, esc(heroBanner))
    .replace(/\{\{CLIENTE_NOME\}\}/g, esc(input.clienteNome))
    .replace(/\{\{PDV_NOME\}\}/g, esc(input.pdvNome))
    .replace(/\{\{CODIGO_DISPLAY\}\}/g, esc(input.codigoDisplay))
    .replace(/\{\{CODIGO_PLAY\}\}/g, esc(input.codigoPlay))
    .replace(/\{\{PLAY_URL\}\}/g, esc(input.playUrl));
}
