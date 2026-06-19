import { prisma } from "@/lib/prisma";
import { getValidAccessToken } from "@/lib/contaazul/session";
import {
  billingEmailJoined,
  cobrancaFaturamentoBlock,
  fetchPersonDetail,
} from "@/lib/contaazul/personBilling";
import { isLinhaAsPdvKey, linhaAsPdvKey } from "@/lib/cadastros/producaoHierarchy";
import { isRioCaPersonLinked } from "@/lib/rio/rioCaPersonLink";
import type { ProducaoPlayerStatus } from "@prisma/client";
import { newPlayerInstalacaoToken } from "@/lib/player/pdvInstalacaoToken";

export type ProducaoPdvCadastroDto = {
  rioPdvKey: string;
  nome: string;
  programacaoMusical: string;
  versaoPlayer: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  estado: string;
  cidade: string;
  razaoSocial: string;
  cnpj: string;
  placaCarro: boolean;
  controlarPlayer: boolean;
  controlarPlaylist: boolean;
  statusPlayer: "Ativo" | "Inativo";
  contatoLojaNome: string;
  contatoLojaEmail: string;
  contatoLojaTelefone: string;
  contatoCobrancaNome: string;
  contatoCobrancaEmail: string;
  contatoCobrancaTelefone: string;
  playerInstalacaoToken: string;
  playerInstaladoEm: string | null;
  cobrancaFromCa: boolean;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function cobrancaPhonesFromCa(raw: unknown): string {
  const block = cobrancaFaturamentoBlock(raw);
  if (!block) return "";
  const tel = block.telefone ?? block.Telefone ?? block.telefones;
  if (typeof tel === "string") return tel.trim();
  if (Array.isArray(tel)) {
    return tel
      .map((t) => (typeof t === "string" ? t : str((t as { numero?: string }).numero)))
      .filter(Boolean)
      .join("; ");
  }
  return "";
}

function cobrancaNomeFromCa(raw: unknown): string {
  const block = cobrancaFaturamentoBlock(raw);
  if (!block) return "";
  return (
    str(block.nome) ||
    str(block.nome_contato) ||
    str(block.nomeContato) ||
    str(block.responsavel) ||
    ""
  );
}

async function fetchCobrancaFromCaLinha(rioLinhaId: string): Promise<{
  nome: string;
  email: string;
  telefone: string;
} | null> {
  const token = await getValidAccessToken();
  if (!token) return null;

  const linha = await prisma.rioCompClienteLinha.findUnique({
    where: { id: rioLinhaId },
    select: { caPersonId: true, emailCobranca: true, razaoSocial: true, nomeFantasia: true },
  });
  if (!linha || !isRioCaPersonLinked(linha.caPersonId)) return null;

  try {
    const detail = await fetchPersonDetail(token, linha.caPersonId);
    const email = billingEmailJoined(detail) || linha.emailCobranca || "";
    const nome =
      cobrancaNomeFromCa(detail) ||
      linha.razaoSocial ||
      linha.nomeFantasia ||
      "";
    const telefone = cobrancaPhonesFromCa(detail);
    return { nome, email, telefone };
  } catch {
    return {
      nome: linha.razaoSocial || linha.nomeFantasia || "",
      email: linha.emailCobranca || "",
      telefone: "",
    };
  }
}

function rowToDto(
  row: NonNullable<Awaited<ReturnType<typeof prisma.producaoPdvCadastro.findUnique>>>,
  cobrancaFromCa: boolean,
): ProducaoPdvCadastroDto {
  return {
    rioPdvKey: row.rioPdvKey,
    nome: row.nome,
    programacaoMusical: row.programacaoMusical,
    versaoPlayer: row.versaoPlayer,
    cep: row.cep,
    endereco: row.endereco,
    numero: row.numero,
    complemento: row.complemento,
    bairro: row.bairro,
    estado: row.estado,
    cidade: row.cidade,
    razaoSocial: row.razaoSocial,
    cnpj: row.cnpj,
    placaCarro: row.placaCarro,
    controlarPlayer: row.controlarPlayer,
    controlarPlaylist: row.controlarPlaylist,
    statusPlayer: row.statusPlayer,
    contatoLojaNome: row.contatoLojaNome,
    contatoLojaEmail: row.contatoLojaEmail,
    contatoLojaTelefone: row.contatoLojaTelefone,
    contatoCobrancaNome: row.contatoCobrancaNome,
    contatoCobrancaEmail: row.contatoCobrancaEmail,
    contatoCobrancaTelefone: row.contatoCobrancaTelefone,
    playerInstalacaoToken: row.playerInstalacaoToken,
    playerInstaladoEm: row.playerInstaladoEm?.toISOString() ?? null,
    cobrancaFromCa,
  };
}

async function defaultSeedForKey(
  rioPdvKey: string,
  refreshCobranca: boolean,
): Promise<{
  nome: string;
  documento: string | null;
  razaoSocial: string;
  rioLinhaId: string;
  cobranca: { nome: string; email: string; telefone: string } | null;
}> {
  if (isLinhaAsPdvKey(rioPdvKey)) {
    const realLinhaId = rioPdvKey.replace(/^linha:/, "");
    const linha = await prisma.rioCompClienteLinha.findUnique({
      where: { id: realLinhaId },
      select: {
        id: true,
        nomeFantasia: true,
        razaoSocial: true,
        documento: true,
      },
    });
    const cobranca = refreshCobranca ? await fetchCobrancaFromCaLinha(realLinhaId) : null;
    return {
      nome: linha?.nomeFantasia?.trim() || "Sem nome",
      documento: linha?.documento ?? null,
      razaoSocial: linha?.razaoSocial?.trim() || linha?.nomeFantasia || "",
      rioLinhaId: linha?.id ?? realLinhaId,
      cobranca,
    };
  }

  const pdv = await prisma.rioCompPdv.findUnique({
    where: { id: rioPdvKey },
    include: {
      cliente: { select: { id: true, nomeFantasia: true, razaoSocial: true } },
    },
  });
  const cobranca =
    refreshCobranca && pdv?.cliente.id ?
      await fetchCobrancaFromCaLinha(pdv.cliente.id)
    : null;
  return {
    nome: pdv?.nome?.trim() || pdv?.cliente.nomeFantasia || "Sem nome",
    documento: pdv?.documento ?? null,
    razaoSocial: pdv?.cliente.razaoSocial || pdv?.cliente.nomeFantasia || "",
    rioLinhaId: pdv?.cliente.id ?? "",
    cobranca,
  };
}

export async function getOrCreatePdvCadastro(
  rioPdvKey: string,
  opts?: { refreshCobranca?: boolean },
): Promise<ProducaoPdvCadastroDto> {
  const refreshCobranca = opts?.refreshCobranca !== false;
  let row = await prisma.producaoPdvCadastro.findUnique({ where: { rioPdvKey } });

  if (!row) {
    const seed = await defaultSeedForKey(rioPdvKey, refreshCobranca);
    row = await prisma.producaoPdvCadastro.create({
      data: {
        rioPdvKey,
        nome: seed.nome,
        razaoSocial: seed.razaoSocial,
        cnpj: seed.documento ?? "",
        playerInstalacaoToken: newPlayerInstalacaoToken(),
        contatoCobrancaNome: seed.cobranca?.nome ?? "",
        contatoCobrancaEmail: seed.cobranca?.email ?? "",
        contatoCobrancaTelefone: seed.cobranca?.telefone ?? "",
      },
    });
    return rowToDto(row, Boolean(seed.cobranca));
  }

  if (refreshCobranca) {
    const seed = await defaultSeedForKey(rioPdvKey, true);
    if (seed.cobranca) {
      row = await prisma.producaoPdvCadastro.update({
        where: { rioPdvKey },
        data: {
          contatoCobrancaNome: seed.cobranca.nome,
          contatoCobrancaEmail: seed.cobranca.email,
          contatoCobrancaTelefone: seed.cobranca.telefone,
        },
      });
      return rowToDto(row, true);
    }
  }

  return rowToDto(row, false);
}

export async function updatePdvCadastro(
  rioPdvKey: string,
  patch: Partial<Omit<ProducaoPdvCadastroDto, "rioPdvKey" | "cobrancaFromCa">>,
): Promise<ProducaoPdvCadastroDto> {
  await getOrCreatePdvCadastro(rioPdvKey, { refreshCobranca: false });

  const statusPlayer: ProducaoPlayerStatus | undefined =
    patch.statusPlayer === "Inativo" ? "Inativo"
    : patch.statusPlayer === "Ativo" ? "Ativo"
    : undefined;

  const row = await prisma.producaoPdvCadastro.update({
    where: { rioPdvKey },
    data: {
      ...(patch.nome !== undefined ? { nome: patch.nome } : {}),
      ...(patch.programacaoMusical !== undefined ?
        { programacaoMusical: patch.programacaoMusical }
      : {}),
      ...(patch.versaoPlayer !== undefined ? { versaoPlayer: patch.versaoPlayer } : {}),
      ...(patch.cep !== undefined ? { cep: patch.cep } : {}),
      ...(patch.endereco !== undefined ? { endereco: patch.endereco } : {}),
      ...(patch.numero !== undefined ? { numero: patch.numero } : {}),
      ...(patch.complemento !== undefined ? { complemento: patch.complemento } : {}),
      ...(patch.bairro !== undefined ? { bairro: patch.bairro } : {}),
      ...(patch.estado !== undefined ? { estado: patch.estado } : {}),
      ...(patch.cidade !== undefined ? { cidade: patch.cidade } : {}),
      ...(patch.razaoSocial !== undefined ? { razaoSocial: patch.razaoSocial } : {}),
      ...(patch.cnpj !== undefined ? { cnpj: patch.cnpj } : {}),
      ...(patch.placaCarro !== undefined ? { placaCarro: patch.placaCarro } : {}),
      ...(patch.controlarPlayer !== undefined ? { controlarPlayer: patch.controlarPlayer } : {}),
      ...(patch.controlarPlaylist !== undefined ?
        { controlarPlaylist: patch.controlarPlaylist }
      : {}),
      ...(statusPlayer !== undefined ? { statusPlayer } : {}),
      ...(patch.contatoLojaNome !== undefined ? { contatoLojaNome: patch.contatoLojaNome } : {}),
      ...(patch.contatoLojaEmail !== undefined ? { contatoLojaEmail: patch.contatoLojaEmail } : {}),
      ...(patch.contatoLojaTelefone !== undefined ?
        { contatoLojaTelefone: patch.contatoLojaTelefone }
      : {}),
      ...(patch.contatoCobrancaNome !== undefined ?
        { contatoCobrancaNome: patch.contatoCobrancaNome }
      : {}),
      ...(patch.contatoCobrancaEmail !== undefined ?
        { contatoCobrancaEmail: patch.contatoCobrancaEmail }
      : {}),
      ...(patch.contatoCobrancaTelefone !== undefined ?
        { contatoCobrancaTelefone: patch.contatoCobrancaTelefone }
      : {}),
    },
  });

  return rowToDto(row, false);
}
