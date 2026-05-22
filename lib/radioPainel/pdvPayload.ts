import type { ContatoView } from "./clientePayload";
import {
  groupIndexedRowsExactModel,
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

const MODELOS_PDV = ["Pdv", "Pdvs", "PontoDeVenda"] as const;

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

function modelosExtrasRepetidos(flat: Record<string, string>): string[] {
  const set = new Set<string>();
  for (const k of Object.keys(flat)) {
    const m = /^data\[([^\]]+)\]\[(\d+)\]\[/i.exec(k);
    if (!m || (!/extra|contato|respons[aá]vel|contatos|^ClienteContatos/i.test(m[1]))) continue;
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

  const nomePdv = pickPrimeiro(flat, MODELOS_PDV, [
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

  const cnpj = pickPrimeiro(flat, MODELOS_PDV, [
    "cnpjPdv",
    "cnpjClientePdv",
    "cnpjCliente",
    "cnpj",
    "numerocpfCnpjPdvCliente",
    "numerocgcPdvCliente",
  ]);

  const endereco = pickPrimeiro(flat, MODELOS_PDV, [
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

  const bairro = pickPrimeiro(flat, MODELOS_PDV, [
    "bairroPdvCliente",
    "nomeBairroPdvsCliente",
    "nomeBairroPdvCliente",
    "nomeBairroCliente",
    "bairroEstabelecimentoPdv",
    "bairro",
    "bairroCliente",
  ]);

  const nomeCompletoResp = pickPrimeiro(flat, MODELOS_PDV, [
    "nomeCompletoResponsavelPdvCliente",
    "nomeCompletoResponsavelPdvsCliente",
    "nomeCompletoContatoResponsavelPdvsCliente",
    "nomeClienteContatosPdvsCliente",
    "nomeResponsavelPdvCliente",
    "nomeResponsavelPdvsCliente",
    "nomeResponsavelPdv",
    "nomeCompletoCliente",
    "nomeClienteResponsavelPdvCliente",
  ]);

  const emailResp = pickPrimeiro(flat, MODELOS_PDV, [
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

  const telFixResp = pickPrimeiro(flat, MODELOS_PDV, [
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

  const telMobResp = pickPrimeiro(flat, MODELOS_PDV, [
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

  const responsavel = {
    nomeCompleto: nomeCompletoResp,
    email: emailResp,
    telefoneFixo: telFixResp,
    telefoneMovel: telMobResp,
  };

  const ehIgualResp = (c: ContatoView) =>
    c.email === responsavel.email
    && c.nomeCompleto === responsavel.nomeCompleto
    && c.telefoneFixo === responsavel.telefoneFixo
    && c.telefoneMovel === responsavel.telefoneMovel;

  const contatosExtras: ContatoView[] = [];
  for (const modelo of modelosExtrasRepetidos(flat)) {
    for (const row of groupIndexedRowsExactModel(flat, modelo)) {
      const c = linhaContatoExtras(row);
      if (!(c.email || c.nomeCompleto || c.telefoneFixo || c.telefoneMovel)) continue;
      if (ehIgualResp(c)) continue;
      contatosExtras.push(c);
    }
  }

  for (const modeloFixo of [
    "ClienteContatosPdvsCliente",
    "ClienteContatosExtraPdvsCliente",
    "ClienteContatosPdvCliente",
    "ContatosPdvsCliente",
    "ContatosExtraPdvsCliente",
    "ClienteContatosExClientesPdvsCliente",
  ]) {
    for (const row of groupIndexedRowsExactModel(flat, modeloFixo)) {
      const c = linhaContatoExtras(row);
      if (!(c.email || c.nomeCompleto || c.telefoneFixo || c.telefoneMovel)) continue;
      if (ehIgualResp(c)) continue;
      contatosExtras.push(c);
    }
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
