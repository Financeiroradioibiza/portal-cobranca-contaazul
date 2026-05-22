import {
  groupIndexedRowsExactModel,
  pickFromModel,
  scrapeCakeDataFields,
} from "./scrapeCake";

export type ContatoView = {
  setorOuCargo: string;
  nomeCompleto: string;
  telefoneFixo: string;
  telefoneMovel: string;
  email: string;
};

export type ClientePainelResponse = {
  tipo: "cliente";
  clienteId: string;
  nomeCliente: string;
  telefone: string;
  contatosExtras: ContatoView[];
};

function rowToContato(row: Record<string, string>): ContatoView {
  const gv = (...keys: string[]) => {
    for (const k of keys) {
      const v = row[k]?.trim();
      if (v) return v;
    }
    return "";
  };

  return {
    setorOuCargo: gv(
      "setorContato",
      "cargoContatoCliente",
      "cargoContato",
      "tipoContato",
      "tipoContatoCliente",
    ),
    nomeCompleto: gv(
      "nomeCompletoContatoCliente",
      "nomeContatoCliente",
      "nomeContato",
      "nomeClienteContato",
      "nomeCompletoCliente",
      "nome",
    ),
    telefoneFixo: gv(
      "foneFixoClienteContato",
      "foneContatoCliente",
      "telefoneClienteContato",
      "foneFixo",
      "fone",
      "foneFixoContatoCliente",
      "foneComercialCliente",
    ),
    telefoneMovel: gv(
      "foneMovelClienteContato",
      "celularClienteContato",
      "celularCliente",
      "celularCliente2",
      "foneMovel",
      "foneCelClienteContato",
      "foneMovelCliente",
      "foneCelularCliente",
    ),
    email: gv(
      "emailClienteContato",
      "emailContatoCliente",
      "emailCliente",
      "email",
    ),
  };
}

/** Modelos repetidos tipo data[AlgoContatoX][idx][campo] */
function contatoIndexedModels(flat: Record<string, string>): Set<string> {
  const models = new Set<string>();
  for (const k of Object.keys(flat)) {
    const m = /^data\[([^\]]+)\]\[(\d+)\]\[/i.exec(k);
    if (!m) continue;
    if (/contato/i.test(m[1])) models.add(m[1]);
  }
  return models;
}

/** Monta objeto amigável a partir dos campos `data[Cliente][...]` e contatos repetidos no Cake. */
export function buildClientePainelPayload(
  html: string,
  clienteId: string,
): ClientePainelResponse {
  const flat = scrapeCakeDataFields(html);

  const nomeCliente = pickFromModel(flat, "Cliente", [
    "nomeFantasiaCliente",
    "fantasiaCliente",
    "nomeCliente",
    "nomeSocialCliente",
    "razaoSocialCliente",
    "nomeRazaoSocialCliente",
    "nomeClienteCompletoCliente",
    "nomeClienteContatoCliente",
    "fantasiaCliente2",
  ]);

  /** Telefone principal */
  let telefone = pickFromModel(flat, "Cliente", [
    "foneCliente",
    "telefoneCliente",
    "foneClienteCadastroCliente",
    "foneCliente2",
    "fone",
    "telefoneCliente2",
    "foneFixoCliente",
    "foneMovelCliente",
    "foneComercialCliente",
    "foneCelularCliente",
  ]);

  const contatosExtras: ContatoView[] = [];
  for (const model of contatoIndexedModels(flat)) {
    for (const row of groupIndexedRowsExactModel(flat, model)) {
      const c = rowToContato(row);
      if (
        !c.nomeCompleto &&
        !c.email &&
        !c.telefoneFixo &&
        !c.telefoneMovel &&
        !c.setorOuCargo
      ) {
        continue;
      }
      contatosExtras.push(c);
    }
  }

  if (contatosExtras.length === 0) {
    for (const modeloFixo of [
      "ClienteContatos",
      "ContatosCliente",
      "ClienteContatosCliente",
      "ClienteContatosVinculadosCliente",
      "CadastroClienteContatos",
      "ClienteContatosVinculos",
      "ClienteContatosVinculosCliente",
    ]) {
      for (const row of groupIndexedRowsExactModel(flat, modeloFixo)) {
        const c = rowToContato(row);
        if (
          !c.nomeCompleto &&
          !c.email &&
          !c.telefoneFixo &&
          !c.telefoneMovel
        ) {
          continue;
        }
        contatosExtras.push(c);
      }
    }
  }

  /** Únicos por assinatura simples — evita duplicata do formulário repetido duas vezes */
  const seen = new Set<string>();
  const uniq = contatosExtras.filter((c) => {
    const key = `${c.nomeCompleto}|${c.email}|${c.telefoneFixo}|${c.telefoneMovel}|${c.setorOuCargo}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    tipo: "cliente",
    clienteId,
    nomeCliente:
      nomeCliente.trim() ||
      pickFromModel(flat, "Clientes", ["nomeCliente", "fantasiaCliente"]) ||
      "—",
    telefone,
    contatosExtras: uniq,
  };
}
