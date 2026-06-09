import {
  getOrCreatePdvCadastro,
  updatePdvCadastro,
  type ProducaoPdvCadastroDto,
} from "@/lib/cadastros/producaoPdvCadastroService";
import {
  csvGetPdvCadastroDetail,
  type CsvPdvCadastroDetail,
} from "@/lib/radioPainel/exportClientesCsv";
import { buildPdvPainelPayload, type PdvPainelResponse } from "@/lib/radioPainel/pdvPayload";
import { getPainelSessionCookie, painelHtml } from "@/lib/radioPainel/session";

export type PainelCadastroImportResult = {
  imported: boolean;
  source: "painel" | "csv" | "mixed" | "none";
  fields: string[];
  warning?: string;
};

function painelEnabled(): boolean {
  const v = process.env.RADIO_PAINEL_ENABLED?.trim().toLowerCase() ?? "";
  return v === "1" || v === "true" || v === "yes";
}

function cleanPanelText(v: string | undefined | null): string {
  const t = (v ?? "").trim();
  if (!t || t === "—" || t === "..." || t === "..") return "";
  return t;
}

function joinPhones(fixo: string, movel: string): string {
  const parts = [fixo, movel].map((s) => s.trim()).filter(Boolean);
  return parts.join(" / ");
}

function pickText(...vals: Array<string | undefined | null>): string {
  for (const v of vals) {
    const t = cleanPanelText(v);
    if (t) return t;
  }
  return "";
}

async function fetchLivePainelPdv(
  painelPdvId: number,
  painelClienteId: number,
): Promise<PdvPainelResponse | null> {
  if (!painelEnabled()) return null;
  try {
    const { cookie, base } = await getPainelSessionCookie();
    const html = await painelHtml(
      cookie,
      base,
      `/adm/pdv/edit?pdv=${painelPdvId}&cliente=${painelClienteId}`,
    );
    return buildPdvPainelPayload(html, String(painelPdvId), String(painelClienteId));
  } catch (e) {
    console.warn("[painel-cadastro-import] live_fetch_failed", painelPdvId, e);
    return null;
  }
}

function buildImportPatch(
  live: PdvPainelResponse | null,
  csv: CsvPdvCadastroDetail | null,
): Partial<Omit<ProducaoPdvCadastroDto, "rioPdvKey" | "cobrancaFromCa">> | null {
  if (!live && !csv) return null;

  const resp = live?.responsavel;
  const patch: Partial<Omit<ProducaoPdvCadastroDto, "rioPdvKey" | "cobrancaFromCa">> = {
    nome: pickText(live?.nomePdv, csv?.pdvNome),
    razaoSocial: pickText(live?.razaoSocial, csv?.razaoSocial),
    cnpj: pickText(live?.cnpj, csv?.cnpj),
    cep: pickText(live?.cep, csv?.cep),
    endereco: pickText(live?.endereco, csv?.endereco),
    numero: pickText(live?.numero, csv?.numero),
    complemento: pickText(live?.complemento, csv?.complemento),
    bairro: pickText(live?.bairro, csv?.bairro),
    cidade: pickText(live?.cidade, csv?.cidade),
    estado: pickText(live?.estado, csv?.estado),
    contatoLojaNome: cleanPanelText(resp?.nomeCompleto),
    contatoLojaEmail: cleanPanelText(resp?.email),
    contatoLojaTelefone: joinPhones(
      cleanPanelText(resp?.telefoneFixo),
      cleanPanelText(resp?.telefoneMovel),
    ),
  };

  const programacao = pickText(live?.programacaoMusical, csv?.programacaoMusical);
  if (programacao) patch.programacaoMusical = programacao;

  if (csv) {
    patch.placaCarro = csv.placaCarro;
    patch.controlarPlayer = csv.controlarPlayer;
    patch.controlarPlaylist = csv.controlarPlaylist;
    patch.statusPlayer = csv.statusPlayer;
  } else if (live) {
    patch.placaCarro = live.placaCarro;
    patch.controlarPlayer = live.controlarPlayer;
    patch.controlarPlaylist = live.controlarPlaylist;
    patch.statusPlayer = live.statusPlayer;
  }

  const hasData = Object.entries(patch).some(([, v]) => {
    if (typeof v === "boolean") return true;
    if (typeof v === "string") return v.trim().length > 0;
    return false;
  });
  return hasData ? patch : null;
}

function listImportedFields(
  patch: Partial<Omit<ProducaoPdvCadastroDto, "rioPdvKey" | "cobrancaFromCa">>,
): string[] {
  const fields: string[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === "boolean") fields.push(k);
    else if (typeof v === "string" && v.trim()) fields.push(k);
  }
  return fields;
}

/**
 * Importa cadastro do painel legado para ProducaoPdvCadastro.
 * Não altera contato cobrança (vem da Conta Azul / planilha Rio).
 */
export async function importProducaoCadastroFromPainel(
  rioCompPdvId: string,
  painelPdvId: number,
  painelClienteId: number,
): Promise<PainelCadastroImportResult> {
  const [live, csv] = await Promise.all([
    fetchLivePainelPdv(painelPdvId, painelClienteId),
    Promise.resolve(
      csvGetPdvCadastroDetail(String(painelPdvId), painelClienteId)
        ?? csvGetPdvCadastroDetail(String(painelPdvId)),
    ),
  ]);

  const patch = buildImportPatch(live, csv);
  if (!patch) {
    return {
      imported: false,
      source: "none",
      fields: [],
      warning: live || csv ? undefined : "sem_dados_painel",
    };
  }

  await getOrCreatePdvCadastro(rioCompPdvId, { refreshCobranca: true });
  await updatePdvCadastro(rioCompPdvId, patch);

  const source: PainelCadastroImportResult["source"] =
    live && csv ? "mixed"
    : live ? "painel"
    : "csv";

  return {
    imported: true,
    source,
    fields: listImportedFields(patch),
  };
}
