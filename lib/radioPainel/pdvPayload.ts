import type { ContatoView } from "./clientePayload";
import {
  cakeDataLeafField,
  groupIndexedRowsExactModel,
  indexedModelNamesFromFlat,
  pickFromModel,
  scrapeCakeDataFields,
} from "./scrapeCake";

export type PdvPainelResponse = {
  tipo: "pdv";
  pdvId: string;
  clienteId?: string | null;
  nomePdv: string;
  cnpj: string;
  responsavel: {
    nomeCompleto: string;
    email: string;
    telefoneFixo: string;
    telefoneMovel: string;
  };
  contatosExtras: ContatoView[];
  googleMapsQuery: string;
  googleMapsUrl: string;
};

const MODELOS_PDV_BASE = ["Pdv", "Pdvs", "PontoDeVenda"] as const;

/** Model indexado no formulário relacionado ao PDV / contatos (evita matriz cliente genérica só `Cliente`). */
function modelTouchesPdvContext(modelName: string): boolean {
  return /Pdv|Ponto|Gerente|Respons|PdvsCliente|PdvCliente|ClienteContatos|ContatosPdvs|ContatosExClientesPdvs|ContatosExtraPdvs|ContatosPdv|SubPdv|Estabelecimento|Unidade|LojaPdv|OperadorPdvs/i.test(modelName);
}

function modeloUnionParaContato(flat: Record<string, string>): string[] {
  const dyn = indexedModelNamesFromFlat(flat).filter(modelTouchesPdvContext);
  const set = new Set<string>(MODELOS_PDV_BASE);
  dyn.forEach((m) => set.add(m));
  return [...set];
}

function looksLikePersonName(val: string): boolean {
  const t = val.normalize("NFC").trim();
  if (!t || t.length > 120) return false;
  if (/[<>]|\/\//.test(t)) return false;
  if (/^\d+[.,\-/]+\d+[.,\-/]+/.test(t)) return false;
  if (/^\(?\d{2}\)?\s*\d{4,}-?\d+$/.test(t)) return false;
  if (/\d/.test(t)) return false;
  const parts = t.split(/\s+/).filter((p) => /^[A-Za-zÀ-ÿ.'-]+$/.test(p));
  return parts.length >= 2 || (parts.length === 1 && parts[0].length >= 4);
}

function digitsOnlyChars(val: string): string {
  return val.replace(/\D/g, "");
}

function looksLikeBrazilPhoneDigits(d: string): boolean {
  return d.length >= 10 && d.length <= 13;
}

/**
 * Fallback: varre chaves data[…] ligadas ao Pdv/contato e escolhe nome / mail / tel por pontuação.
 */
function responsavelFromFlatHeuristic(
  flat: Record<string, string>,
  nomePdv: string,
  cnpjFormatadoOuRaw: string,
): { nomeCompleto: string; email: string; telefoneFixo: string; telefoneMovel: string } {
  const nomePdvN = nomePdv.replace(/\s+/g, " ").trim().toLowerCase();
  const cnpjD = digitsOnlyChars(cnpjFormatadoOuRaw);

  let bestNome = { score: 0, v: "" };
  let bestMail = { score: 0, v: "" };
  let bestFix = { score: 0, v: "" };
  let bestMob = { score: 0, v: "" };

  const nomeIgnoreLeaf =
    /\b(?:cnpj|cpf|cgc|fantasia|razao|ie|rg|cep|usuario|senha)/i;

  function pathNome(fullKey: string): number {
    let s = 0;
    if (/respons[aá]vel/i.test(fullKey)) s += 100;
    if (/ClienteContatos.*Pdv|PdvsCliente|PdvCliente|PontoDeVenda/i.test(fullKey)) s += 70;
    if (/ClienteContatosPdvsCliente|ClienteContatosPdv/i.test(fullKey)) s += 85;
    if (/contatosextra|ClienteContatosEx/i.test(fullKey)) s -= 35;
    if (/data\[Pdv\]|\[\s*Pdv\s*\]/i.test(fullKey)) s += 60;
    if (/gerente|supervisor/i.test(fullKey)) s += 55;
    return s;
  }

  function pathFone(fullKey: string): number {
    return pathNome(fullKey);
  }

  for (const [fullKey, raw] of Object.entries(flat)) {
    const val = raw?.trim();
    if (!val || val === "—" || val.length > 220) continue;
    if (!/^data\[/.test(fullKey)) continue;
    if (
      !/[Pp][Dd][Vv]|[Pp]onto|[Gg]erente|[Rr]espons|[Cc]liente[Cc]ontatos|[Cc]ontatosPdvs|[Cc]ontatoPdvs|[Pp][Dd]vs[Cc]liente/i.test(
        fullKey,
      )
    ) {
      continue;
    }

    const leaf = cakeDataLeafField(fullKey);
    if (!leaf) continue;
    const ll = leaf.toLowerCase();

    if (nomeIgnoreLeaf.test(ll)) continue;
    if (/\bendereco|cep|numero|cidade|bairro|estado|referencia|complemento|logradouro|rua|latitude|longitude|pais|cnae/i.test(ll)) continue;
    if (/\bnomefantasia|\bnomePdvsCliente\b|^fantasiaPdvs|^nomeClientePdv$|^nomeEstabelecimento|^nomecomercial/i.test(leaf)) continue;

    if (looksLikePersonName(val)) {
      const vNorm = val.toLowerCase().replace(/\s+/g, " ").trim();
      if (nomePdvN.length >= 4 && vNorm === nomePdvN) continue;
      let scr =
        pathNome(fullKey)
        + (/\bnomecompleto|nomeRespons|nomeGerente|nomeClienteContatos|nomeContatoPdvs|^dscNome/i.test(leaf)
          ? 30
          : 0);
      if (/^nomeClienteContatosPdvs|^nomeRespons|^nomeGerentePdvs|^nomeCompletoResp/i.test(leaf)) scr += 25;
      if (scr >= bestNome.score || !bestNome.v) {
        bestNome = { score: scr, v: val };
      }
    }

    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      let scr =
        pathNome(fullKey)
        + (/\bmail|email|e_mail\b/i.test(ll) ? 40 : 0)
        + (/\bClienteContatosPdvs|Respons|ClienteContatosPdv|^emailGerente/i.test(fullKey) ? 20 : 0);
      if (/contatoextra|ContatosExtra/i.test(fullKey)) scr -= 20;
      if (scr > bestMail.score || (scr === bestMail.score && !bestMail.v)) {
        bestMail = { score: scr, v: val };
      }
    }

    const dTel = digitsOnlyChars(val);
    if (looksLikeBrazilPhoneDigits(dTel)) {
      if (cnpjD && dTel === cnpjD && dTel.length >= 14) continue;

      const lk = `${leaf}|${fullKey}`;
      const isMovelLeaf =
        /movel|cel|whatsapp|^foneClienteContatosPdvsCliente7|^foneClienteContatosPdvsCliente5|^foneClienteResponsavelPdvCliente2|\bfoneCel\b/i.test(lk);
      const isFixLeaf =
        /\bfixo\b|\btelefone\b|foneFixo|^foneClienteContatosPdvsCliente(?:2|3|4|6)\b|^foneClienteContatosPdvsCliente[^57]|foneFixoPdvs/i.test(lk);

      if (isMovelLeaf) {
        const scr = pathFone(fullKey) + 22;
        if (scr >= bestMob.score || !bestMob.v) bestMob = { score: scr, v: val };
      }
      if (isFixLeaf) {
        const scr = pathFone(fullKey) + 22;
        if (scr >= bestFix.score || !bestFix.v) bestFix = { score: scr, v: val };
      }
      if (!isMovelLeaf && !isFixLeaf) {
        const scr = pathFone(fullKey) + 6;
        if (scr >= bestFix.score || !bestFix.v) bestFix = { score: scr, v: val };
      }
    }
  }

  if (bestMob.v === bestFix.v && bestMob.v) bestMob = { score: 0, v: "" };

  return {
    nomeCompleto: bestNome.v,
    email: bestMail.v,
    telefoneFixo: bestFix.v,
    telefoneMovel: bestMob.v,
  };
}

function pickPrimeiro(
  flat: Record<string, string>,
  modelos: readonly string[],
  campos: string[],
): string {
  for (const m of modelos) {
    const v = pickFromModel(flat, m, campos);
    if (v.trim()) return v.trim();
  }
  return "";
}

function linhaContatoExtras(row: Record<string, string>): ContatoView {
  const gv = (...keys: string[]) => {
    for (const k of keys) {
      const x = row[k]?.trim();
      if (x && x.length < 480) return x;
    }
    return "";
  };
  return {
    setorOuCargo: gv("setorContatoExtra", "cargoContatoCliente", "cargoContatoExtra", "setorExtrav"),
    nomeCompleto: gv(
      "nomeCompletoContatoCliente",
      "nomeCompletoContatoExtraPdvsCliente",
      "nomeCompletoContatoPdvsCliente",
      "nomeContatoCliente",
      "nomeClienteExtra",
      "nomeContatoPdvsCliente",
      "nomeExtraPdvsCliente",
      "nomeCompletoPdvsCliente",
      "nomeClienteContatosPdvsCliente",
      "nome",
    ),
    telefoneFixo: gv(
      "foneFixoCliente",
      "foneContatoCliente",
      "foneCliente",
      "telefoneCliente",
      "fone",
      "foneComercialCliente",
      "foneFixoContatoExtraPdvsCliente",
      "foneFixoPdvsCliente",
      "foneFixoPdvsCliente2",
      "foneClienteContatosPdvsCliente",
    ),
    telefoneMovel: gv(
      "foneMovelCliente",
      "foneCelCliente",
      "foneMovelCliente2",
      "celularCliente",
      "foneCelularCliente",
      "foneMovel",
      "foneMovelContatoExtraPdvsCliente",
      "foneMovelPdvsCliente",
      "foneMovelPdvsCliente2",
      "foneClienteCelPdvsCliente",
      "foneCelPdvsCliente",
    ),
    email: gv(
      "emailContatoCliente",
      "emailCliente",
      "emailContatoExtraPdvsCliente",
      "emailPdvsCliente",
      "emailClienteContatosPdvsCliente",
      "email",
    ),
  };
}

/** Quando o Cake usa nomes de campo que não casam com `linhaContatoExtras`, inferimos contato pela forma dos valores / do leaf. */
function inferContatoViewFromIndexedRow(row: Record<string, string>): ContatoView {
  let bestNome = { score: -1, v: "" };
  let bestMail = { score: -1, v: "" };
  let bestFix = { score: -1, v: "" };
  let bestMob = { score: -1, v: "" };
  let bestSetor = { score: -1, v: "" };

  const nomeIgnoreLeaf =
    /\b(?:cnpj|cpf|cgc|fantasia|razao|ie|rg|cep|usuario|senha)\b/i;

  function leafCargoScore(leaf: string): number {
    let s = 35;
    if (/extra/i.test(leaf.toLowerCase())) s += 15;
    return s;
  }

  function leafNomeScore(leaf: string): number {
    const compact = leaf.replace(/_/g, "");
    let s = 0;
    if (/nomecompleto|nomecontato|nomecliente|nomeresp|dscnome/i.test(compact)) s += 40;
    if (/extra/i.test(leaf.toLowerCase())) s += 10;
    return s;
  }

  function leafMailScore(leaf: string): number {
    const ll = leaf.toLowerCase();
    let s = 0;
    if (/\bmail|email|e_mail\b/.test(ll)) s += 40;
    if (/extra/.test(ll)) s += 10;
    return s;
  }

  for (const [leaf, raw] of Object.entries(row)) {
    const val = raw?.trim();
    if (!val || val === "—" || val.length > 480) continue;
    const ll = leaf.toLowerCase();

    if (/\bendereco|cep|cidade|bairro|complemento|logradouro|latitude|longitude|pais|cnae\b/i.test(ll)) continue;
    if (nomeIgnoreLeaf.test(ll)) continue;
    if (/^id$/i.test(leaf)) continue;

    if (
      /cargo|setor|fun[cç][aã]o|departamento/i.test(leaf)
      && val.length <= 160
      && !/^\d+$/.test(val)
    ) {
      const scr = leafCargoScore(leaf);
      if (scr > bestSetor.score || (scr === bestSetor.score && !bestSetor.v)) bestSetor = { score: scr, v: val };
    }

    if (looksLikePersonName(val)) {
      let scr = leafNomeScore(leaf);
      if (/\bnomefantasia|^fantasia/i.test(leaf)) scr -= 100;
      if (scr >= bestNome.score || !bestNome.v) bestNome = { score: scr, v: val };
    }

    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      const scr = leafMailScore(leaf);
      if (scr > bestMail.score || (scr === bestMail.score && !bestMail.v)) bestMail = { score: scr, v: val };
    }

    const dTel = digitsOnlyChars(val);
    if (looksLikeBrazilPhoneDigits(dTel)) {
      const lk = leaf;
      const isMovelLeaf =
        /movel|cel|whatsapp|^foneClienteContatosPdvsCliente7|^foneClienteContatosPdvsCliente5|^foneClienteResponsavelPdvCliente2|\bfoneCel\b/i.test(lk);
      const isFixLeaf =
        /\bfixo\b|\btelefone\b|foneFixo|^foneClienteContatosPdvsCliente(?:2|3|4|6)\b|^foneClienteContatosPdvsCliente[^57]|foneFixoPdvs/i.test(lk);

      if (isMovelLeaf) {
        const scr = 22;
        if (scr >= bestMob.score || !bestMob.v) bestMob = { score: scr, v: val };
      }
      if (isFixLeaf) {
        const scr = 22;
        if (scr >= bestFix.score || !bestFix.v) bestFix = { score: scr, v: val };
      }
      if (!isMovelLeaf && !isFixLeaf) {
        const scr = 6;
        if (scr >= bestFix.score || !bestFix.v) bestFix = { score: scr, v: val };
      }
    }
  }

  if (bestMob.v === bestFix.v && bestMob.v) bestMob = { score: -1, v: "" };

  return {
    setorOuCargo: bestSetor.v,
    nomeCompleto: bestNome.v,
    telefoneFixo: bestFix.v,
    telefoneMovel: bestMob.v,
    email: bestMail.v,
  };
}

function linhaContatoExtrasOuInferido(row: Record<string, string>): ContatoView {
  const explicit = linhaContatoExtras(row);
  if (
    explicit.email
    || explicit.nomeCompleto
    || explicit.telefoneFixo
    || explicit.telefoneMovel
    || explicit.setorOuCargo.trim()
  ) {
    return explicit;
  }
  return inferContatoViewFromIndexedRow(row);
}

/**
 * Radio Ibiza (Cake): contato extra em `data[Pdv][nome-completo-extra][]`, `data[Pdv][email-extra][]`,
 * etc. (`[]` em vez de `[0][campo]`). Antes ficava invisível para `groupIndexedRowsExactModel`.
 */
const RE_PDV_CAMPO_EXTRA_SUFIXO = /^data\[(Pdv|Pdvs|PontoDeVenda)]\[(.+)](\[\]|\[\d+\])$/i;

function slotPdvBracketSuffix(bracketTail: string): string {
  if (bracketTail === "[]") return "0";
  const digits = /^\[(\d+)]$/.exec(bracketTail);
  return digits?.[1] ?? "0";
}

function mapLeadPdvModeloParaContato(leaf: string):
  | "nomeCompleto"
  | "email"
  | "telefoneFixo"
  | "telefoneMovel"
  | "setorOuCargo"
  | null {
  if (!/-extra/i.test(leaf)) return null;
  const f = leaf.toLowerCase();

  if (/setor|cargo|fun[cç]|departamento/.test(f)) return "setorOuCargo";

  /** “nome-*-extra”: distinguir antes de “email-extra” onde “mail” aparece só no domínio. */
  if (/\bnome|^nome-|completo|dsc.?nome|\bfantasia-extra\b/.test(f) && !/email|^mail|^e_?mail/.test(f)) {
    return "nomeCompleto";
  }

  if (/email|^mail|^e_?mail/.test(f)) return "email";

  if (/movel|móvel|cel|mobile|whatsapp/.test(f)) return "telefoneMovel";

  if (/tel|fixo|fone|telefone/.test(f)) return "telefoneFixo";

  return null;
}

function extrairContatosExtrasDataPdvSufixoExtra(flat: Record<string, string>): ContatoView[] {
  /** slot → campo parcial */
  const acc = new Map<string, Partial<Record<ContatoViewKey, string>>>();
  type ContatoViewKey = keyof ContatoView;

  for (const [k, rawVal] of Object.entries(flat)) {
    const m = RE_PDV_CAMPO_EXTRA_SUFIXO.exec(k.trim());
    if (!m) continue;
    const campo = m[2];
    const lead = mapLeadPdvModeloParaContato(campo);
    if (!lead) continue;

    const v = rawVal?.trim();
    if (!v || v === "—") continue;

    const slot = slotPdvBracketSuffix(m[3]);
    if (!acc.has(slot)) acc.set(slot, {});
    const row = acc.get(slot)!;

    /** Último valor por slot vence duplicados de HTML. */
    row[lead] = v.length < 480 ? v : `${v.slice(0, 476)}…`;
  }

  const out: ContatoView[] = [];
  for (const row of acc.values()) {
    out.push({
      setorOuCargo: row.setorOuCargo ?? "",
      nomeCompleto: row.nomeCompleto ?? "",
      telefoneFixo: row.telefoneFixo ?? "",
      telefoneMovel: row.telefoneMovel ?? "",
      email: row.email ?? "",
    });
  }
  return out;
}

/** Modelos com campos diretos `data[Model][campo]` — alguns Cakes colocam o “contato extra” aqui sem `[][n][]`. */
const MODELOS_PDV_SHELL_SEM_INDICE = ["PdvsCliente", "PdvCliente", "ClientePdvsCliente"] as const;

function aggregateSinIndiceFields(
  flat: Record<string, string>,
  model: string,
): Record<string, string> {
  const row: Record<string, string> = {};
  const prefix = `data[${model}][`;
  for (const [k, raw] of Object.entries(flat)) {
    if (!k.startsWith(prefix)) continue;
    const inner = k.slice(prefix.length);
    if (/^\d+\]\[/.test(inner)) continue;
    const field = inner.replace(/\]$/, "");
    if (!field.trim() || /^\d+$/.test(field)) continue;
    row[field] = raw ?? "";
  }
  return row;
}

/** Só mantém leaves que o Cake marca como linha secundária / contato extra (evita duplicar o bloco inteiro PDV cliente). */
function slimTwoTierRowParaPossivelExtra(row: Record<string, string>): Record<string, string> {
  /** Não incluir dados do responsável só por terem “ClienteContatos…” no nome. */
  const extraLeaf =
    /\bextras?\b|ClienteContatosEx|ClienteContatosExtra|ClienteContatosExtras|ContatosExtraPdvs|ClienteContatosExPdvsCliente|ClienteContatosExClientesPdvsCliente|ClienteContatosExtraPdvs|ClienteContatosExtrasPdvs|ClienteContatoExtraPdvs|ClienteContatosExPdvs|ContatoClienteExtraPdvsCliente|ClienteContatoExtraPdvsCliente|Cliente2Pdvs|contatoCliente2|^segundo|emailContatoExtra|nomeCompletoContatoExtra|nomeContatoExtra|foneFixoContatoExtra|foneMovelContatoExtra|mailClienteContatosEx|mailClienteExtra|emailClienteExtra|nomeClienteExtra|foneClienteExtra|^mailContatoPdvs|^emailCliente2|^nomeCompletoCliente2|^mailCliente2|(?:mailCliente|mailContato|emailCliente|emailContato|nomeCompleto|foneMovel|foneFixo)\w*PdvsCliente2\b|(?:mailCliente|mailContato|emailCliente|emailContato|nomeCompleto|foneMovel|foneFixo)\w*PdvCliente2\b/i;
  const out: Record<string, string> = {};
  for (const [leaf, raw] of Object.entries(row)) {
    const val = raw?.trim();
    if (!val || val === "—") continue;
    if (!extraLeaf.test(leaf)) continue;
    out[leaf] = val;
  }
  return out;
}

function modelosExtrasRepetidos(flat: Record<string, string>): string[] {
  const set = new Set<string>();
  for (const k of Object.keys(flat)) {
    const m = /^data\[([^\]]+)\]\[(\d+)\]\[/i.exec(k);
    if (
      !m
      || (!/ClienteContatos|ClienteContato|extra|Extra|contato|ContatosPdvs|ContatosPdv|^ContatosEx|^ContatosExtra/i.test(
          m[1],
        ))
    )
      continue;
    set.add(m[1]);
  }
  return [...set];
}

function agrupaUnicos(contatos: ContatoView[]): ContatoView[] {
  const seen = new Set<string>();
  const out: ContatoView[] = [];
  for (const c of contatos) {
    const sig = `${c.nomeCompleto}|${c.email}|${c.telefoneFixo}|${c.telefoneMovel}|${c.setorOuCargo}`;
    if (!sig.replace(/\|/g, "").trim()) continue;
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(c);
  }
  return out;
}

function mapsUrl(parts: readonly string[]): string {
  const q = parts.map((x) => x.trim()).filter(Boolean).join(", ");
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : "";
}

export function buildPdvPainelPayload(
  html: string,
  pdvId: string,
  clienteLinkId?: string | null,
): PdvPainelResponse {
  const flat = scrapeCakeDataFields(html);
  const modelosContact = modeloUnionParaContato(flat);

  const nomePdv = pickPrimeiro(flat, MODELOS_PDV_BASE, [
    "nomePdv",
    "nomeFantasiaPdv",
    "nomeClientePdv",
    "nomeFantasiaClientePdv",
    "fantasiaPdvsCliente",
    "nomeEstabelecimentoPdv",
    "nomeComercialPdv",
    "nomePdvsCliente",
    "fantasiaPdvsCliente2",
    "nome",
  ]);

  const cnpj = pickPrimeiro(flat, MODELOS_PDV_BASE, [
    "cnpjPdv",
    "cnpjClientePdv",
    "cnpjCliente",
    "cnpj",
    "numerocpfCnpjPdvCliente",
    "numerocgcPdvCliente",
  ]);

  const endereco = pickPrimeiro(flat, MODELOS_PDV_BASE, [
    "nomeEnderecoPdvsCliente",
    "nomeEnderecoPdvCliente",
    "ruaPdvsCliente",
    "nomeRuaPdvCliente",
    "nomeRuaPdvsCliente",
    "logradouroPdvCliente",
    "enderecoPdvsCliente",
    "endercoPdvsCliente",
    "numeroPdvsCliente",
    "endeCompletoPdvsCliente",
    "enderecoCompletoPdvsCliente",
    "enderecoPdvCliente",
    "endereco",
    "enderecoCompletoPdv",
    "logradouro",
    "enderecoCliente",
  ]);

  const bairro = pickPrimeiro(flat, MODELOS_PDV_BASE, [
    "bairroPdvCliente",
    "nomeBairroPdvsCliente",
    "nomeBairroPdvCliente",
    "nomeBairroCliente",
    "bairroEstabelecimentoPdv",
    "bairro",
    "bairroCliente",
  ]);

  const nomeCompletoResp = pickPrimeiro(flat, modelosContact, [
    "nomeCompletoResponsavelPdvCliente",
    "nomeCompletoResponsavelPdvsCliente",
    "nomeCompletoContatoResponsavelPdvsCliente",
    "nomeClienteContatosPdvsCliente",
    "nomeResponsavelPdvCliente",
    "nomeResponsavelPdvsCliente",
    "nomeResponsavelPdv",
    "nomeGerentePdvsCliente",
    "nomeGerenteClientePdvsCliente",
    "dscNomeGerentePdvsCliente",
    "nomeRepresentantePdvsCliente",
    "nomeCompletoCliente",
    "nomeClienteResponsavelPdvCliente",
    "nomeContatoCliente",
  ]);

  const emailResp = pickPrimeiro(flat, modelosContact, [
    "emailClienteContatosPdvsCliente",
    "emailResponsavelPdvCliente",
    "emailResponsavelPdvsCliente",
    "emailClienteResponsavelPdvCliente",
    "emailContatoCliente",
    "mailCliente",
    /** genéricos por último (evitar confundir com e-mail institucional) */
    "emailCliente",
    "email",
    "emailContatoExtraPdvsCliente",
    "emailPdvsCliente",
  ]);

  const telFixResp = pickPrimeiro(flat, modelosContact, [
    "foneClienteContatosPdvsCliente",
    "foneClienteResponsavelPdvCliente",
    "foneResponsavelPdvsCliente",
    "foneResponsavelPdvCliente",
    "foneClienteContatosPdvsCliente2",
    "foneClienteContatosPdvsCliente4",
    "foneClienteContatosPdvsCliente3",
    "foneFixoPdvsCliente",
    "foneFixoPdvsCliente2",
    "foneFixoPdvCliente",
    "foneClienteContatosPdvsCliente6",
    "foneCliente",
    "fone",
    "telefoneCliente",
  ]);

  const telMobResp = pickPrimeiro(flat, modelosContact, [
    "foneMovelPdvsCliente",
    "foneClienteResponsavelPdvCliente2",
    "foneClienteContatosPdvsCliente7",
    "foneClienteContatosPdvsCliente5",
    "foneMovelPdvsCliente2",
    "foneMovelPdvCliente",
    "foneClienteCelPdvsCliente",
    "foneCelPdvsCliente",
    "celularPdvsCliente",
    "foneMovel",
    "celular",
  ]);

  const respHeur = responsavelFromFlatHeuristic(
    flat,
    nomePdv || "",
    cnpj || "",
  );

  const responsavel = {
    nomeCompleto: nomeCompletoResp.trim() || respHeur.nomeCompleto,
    email: emailResp.trim() || respHeur.email,
    telefoneFixo: telFixResp.trim() || respHeur.telefoneFixo,
    telefoneMovel: telMobResp.trim() || respHeur.telefoneMovel,
  };

  const ehIgualResp = (c: ContatoView) =>
    c.email === responsavel.email
    && c.nomeCompleto === responsavel.nomeCompleto
    && c.telefoneFixo === responsavel.telefoneFixo
    && c.telefoneMovel === responsavel.telefoneMovel;

  const contatosExtras: ContatoView[] = [];
  for (const modelo of modelosExtrasRepetidos(flat)) {
    for (const row of groupIndexedRowsExactModel(flat, modelo)) {
      const c = linhaContatoExtrasOuInferido(row);
      if (!(c.email || c.nomeCompleto || c.telefoneFixo || c.telefoneMovel || c.setorOuCargo.trim())) continue;
      if (ehIgualResp(c)) continue;
      contatosExtras.push(c);
    }
  }

  for (const modeloFixo of [
    "ClienteContatosPdvsCliente",
    "ClienteContatosExtraPdvsCliente",
    "ClienteContatoExtraPdvsCliente",
    "ClienteContatosExtrasPdvsCliente",
    "ClienteContatosPdvCliente",
    "ContatosPdvsCliente",
    "ContatosExtraPdvsCliente",
    "ContatoExtraPdvsCliente",
    "ClienteContatosExClientesPdvsCliente",
  ]) {
    for (const row of groupIndexedRowsExactModel(flat, modeloFixo)) {
      const c = linhaContatoExtrasOuInferido(row);
      if (!(c.email || c.nomeCompleto || c.telefoneFixo || c.telefoneMovel || c.setorOuCargo.trim())) continue;
      if (ehIgualResp(c)) continue;
      contatosExtras.push(c);
    }
  }

  /**
   * Modelos Cake `data[Model][idx][campo]` cujo nome traz “contato” (antes filtrávamos só padrões
   * pré-definidos; nomes tipo `ContatoClienteExtraPdvsCliente` ficavam fora da lista).
   */
  for (const modelo of indexedModelNamesFromFlat(flat)) {
    if (/^Pdv$|^Pdvs$|^PontoDeVenda$/i.test(modelo)) continue;
    if (!/contato/i.test(modelo)) continue;
    for (const row of groupIndexedRowsExactModel(flat, modelo)) {
      const c = linhaContatoExtrasOuInferido(row);
      if (!(c.email || c.nomeCompleto || c.telefoneFixo || c.telefoneMovel || c.setorOuCargo.trim())) continue;
      if (ehIgualResp(c)) continue;
      contatosExtras.push(c);
    }
  }

  /** Segunda linha de contato apenas em campos não indexados sob PdvsCliente / PdvCliente. */
  for (const shell of MODELOS_PDV_SHELL_SEM_INDICE) {
    const skinny = slimTwoTierRowParaPossivelExtra(aggregateSinIndiceFields(flat, shell));
    if (Object.keys(skinny).length === 0) continue;
    const c = linhaContatoExtrasOuInferido(skinny);
    if (!(c.email || c.nomeCompleto || c.telefoneFixo || c.telefoneMovel || c.setorOuCargo.trim())) continue;
    if (ehIgualResp(c)) continue;
    contatosExtras.push(c);
  }

  /** Ibiza Cake: bloco “Contato extra” em **data[Pdv][*-extra][]** (não há matriz [n][]). */
  for (const c of extrairContatosExtrasDataPdvSufixoExtra(flat)) {
    if (!(c.email || c.nomeCompleto || c.telefoneFixo || c.telefoneMovel || c.setorOuCargo.trim())) continue;
    if (ehIgualResp(c)) continue;
    contatosExtras.push(c);
  }

  const googleMapsQuery = [nomePdv, endereco, bairro].filter(Boolean).join(", ");
  const googleMapsUrl = mapsUrl([nomePdv, endereco, bairro]);

  return {
    tipo: "pdv",
    pdvId,
    clienteId: clienteLinkId ?? null,
    nomePdv: nomePdv || "—",
    cnpj: cnpj || "—",
    responsavel,
    contatosExtras: agrupaUnicos(contatosExtras),
    googleMapsQuery,
    googleMapsUrl,
  };
}
