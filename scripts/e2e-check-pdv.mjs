/** Checagem ponta a ponta de um PDV (ex.: 316.001). Uso: node scripts/e2e-check-pdv.mjs 316.001 */
import { PrismaClient } from "@prisma/client";

const PORTAL_PDV_SEQ_MULTIPLIER = 1000;

function parseDisplay(display) {
  const m = /^(\d+)\.(\d{1,3})$/.exec(String(display).trim());
  if (!m) return null;
  const clienteId = Number(m[1]);
  const seq = Number(m[2]);
  return clienteId * PORTAL_PDV_SEQ_MULTIPLIER + seq;
}

function formatDisplay(portalPdvId) {
  const clienteId = Math.floor(portalPdvId / PORTAL_PDV_SEQ_MULTIPLIER);
  const seq = portalPdvId % PORTAL_PDV_SEQ_MULTIPLIER;
  return `${clienteId}.${String(seq).padStart(3, "0")}`;
}

const display = process.argv[2] ?? "316.001";
const portalPdvId = parseDisplay(display);
if (!portalPdvId) {
  console.error("ID inválido:", display);
  process.exit(1);
}

const prisma = new PrismaClient();
const cloud2Base =
  process.env.CLOUD2_PUBLIC_URL?.replace(/\/$/, "") || "https://cloud2.radioibiza.app.br";

try {
  const layout = await prisma.cadastroProducaoLayout.findUnique({
    where: { yearMonth: 0 },
    select: { yearMonth: true, portalPdvIdsByRioPdvKey: true },
  });
  const idsMap =
    layout?.portalPdvIdsByRioPdvKey && typeof layout.portalPdvIdsByRioPdvKey === "object"
      ? layout.portalPdvIdsByRioPdvKey
      : {};
  const rioKey = Object.entries(idsMap).find(([, id]) => Number(id) === portalPdvId)?.[0] ?? null;

  const portalClienteId = Math.floor(portalPdvId / PORTAL_PDV_SEQ_MULTIPLIER);
  const login = await prisma.clientePlayerLogin.findFirst({
    where: { portalClienteId, active: true },
    select: { email: true, clienteNome: true },
  });

  const cadastro = rioKey
    ? await prisma.producaoPdvCadastro.findUnique({ where: { rioPdvKey: rioKey } })
    : null;

  const programacao = cadastro?.programacaoMusical
    ? await prisma.programacao.findFirst({
        where: { nome: cadastro.programacaoMusical, publicada: true },
        select: { id: true, nome: true, publicada: true },
      })
    : null;

  console.log("=== E2E check", display, "===");
  console.log("portalPdvId:", portalPdvId, "portalClienteId:", portalClienteId);
  console.log("layoutYm:", layout?.yearMonth ?? null, "rioPdvKey:", rioKey);
  console.log("login:", login ? { nome: login.clienteNome, email: login.email } : "AUSENTE");
  console.log(
    "cadastro:",
    cadastro
      ? {
          nome: cadastro.nome,
          programacaoMusical: cadastro.programacaoMusical,
          controlarPlayer: cadastro.controlarPlayer,
          controlarPlaylist: cadastro.controlarPlaylist,
          statusPlayer: cadastro.statusPlayer,
          token: cadastro.playerInstalacaoToken,
          contatoCobranca: {
            nome: cadastro.contatoCobrancaNome,
            email: cadastro.contatoCobrancaEmail,
            tel: cadastro.contatoCobrancaTelefone,
          },
          contatoLoja: {
            nome: cadastro.contatoLojaNome,
            email: cadastro.contatoLojaEmail,
            tel: cadastro.contatoLojaTelefone,
          },
        }
      : "AUSENTE",
  );
  console.log("programacaoPublicada:", programacao ?? "NÃO ENCONTRADA / NÃO PUBLICADA");

  if (login?.email && process.env.E2E_PLAYER_PASSWORD) {
    const res = await fetch(`${cloud2Base}/api/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: login.email, password: process.env.E2E_PLAYER_PASSWORD }),
    });
    const data = await res.json();
    console.log("webservice login:", data);
  } else {
    console.log("webservice login: skip (defina E2E_PLAYER_PASSWORD para testar)");
  }

  if (cadastro?.playerInstalacaoToken) {
    const token = cadastro.playerInstalacaoToken;
    for (const path of [`/api/loginByToken/?token=${encodeURIComponent(token)}`, `/api/playlist/?token=${encodeURIComponent(token)}`]) {
      const res = await fetch(cloud2Base + path);
      const text = await res.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text.slice(0, 200);
      }
      console.log(path, "status", res.status, parsed);
    }
  }
} finally {
  await prisma.$disconnect();
}
