/** Campos do PDV no gateway Postgres — mesmo contrato do webservice legado (Player 4/5). */
import {
  effectiveRioTagCobranca,
  rioTagCobrancaBloqueiaPlayer,
  type RioTagCobranca,
} from "@/lib/rio/rioTagCobranca";

export type PdvGatewayFields = {
  status: "A" | "I";
  ctrlPlayer: "S" | "N";
  ctrlPlacaCarro: "S" | "N";
  ctrlPlaylists: "S" | "N";
  cidade: string;
  uf: string;
  nomeCompletoContatoExtra: string;
};

const DEFAULT: PdvGatewayFields = {
  status: "A",
  ctrlPlayer: "S",
  ctrlPlacaCarro: "N",
  ctrlPlaylists: "N",
  cidade: "",
  uf: "",
  nomeCompletoContatoExtra: "",
};

/** Mapeia cadastro produção (portal) → flags que o Player 5 lê em loginByToken/ping. */
export function mapPdvCadastroToGatewayFields(
  cad?: {
    placaCarro?: boolean;
    controlarPlaylist?: boolean;
    statusPlayer?: "Ativo" | "Inativo";
    cidade?: string;
    estado?: string;
  } | null,
  rioTagCobranca?: RioTagCobranca | null,
  rioLinhaTagCobranca?: RioTagCobranca | null,
): PdvGatewayFields {
  const fields: PdvGatewayFields = cad ?
    {
      status: cad.statusPlayer === "Inativo" ? "I" : "A",
      /** Player 5 — transporte sempre liberado; «controlar player» saiu do cadastro. */
      ctrlPlayer: "S",
      ctrlPlacaCarro: cad.placaCarro ? "S" : "N",
      /** «Aviso locução» no cadastro → vinheta por texto no Player. */
      ctrlPlaylists: cad.controlarPlaylist ? "S" : "N",
      cidade: (cad.cidade ?? "").trim(),
      uf: (cad.estado ?? "").trim().slice(0, 2).toUpperCase(),
      /** Avisos codificados legados — substituídos por avisos do Suporte. */
      nomeCompletoContatoExtra: "",
    }
  : { ...DEFAULT };

  const tagEfetiva = effectiveRioTagCobranca(rioTagCobranca, rioLinhaTagCobranca);
  if (rioTagCobrancaBloqueiaPlayer(tagEfetiva)) {
    fields.status = "I";
  }
  return fields;
}
