/** Campos do PDV no gateway Postgres — mesmo contrato do webservice legado (Player 4/5). */
export type PdvGatewayFields = {
  status: "A" | "I";
  ctrlPlayer: "S" | "N";
  ctrlPlacaCarro: "S" | "N";
  ctrlPlaylists: "S" | "N";
  cidade: string;
  uf: string;
};

const DEFAULT: PdvGatewayFields = {
  status: "A",
  ctrlPlayer: "N",
  ctrlPlacaCarro: "N",
  ctrlPlaylists: "N",
  cidade: "",
  uf: "",
};

/** Mapeia cadastro produção (portal) → flags que o Player 5 lê em loginByToken/ping. */
export function mapPdvCadastroToGatewayFields(cad?: {
  controlarPlayer?: boolean;
  placaCarro?: boolean;
  controlarPlaylist?: boolean;
  statusPlayer?: "Ativo" | "Inativo";
  cidade?: string;
  estado?: string;
} | null): PdvGatewayFields {
  if (!cad) return DEFAULT;
  return {
    status: cad.statusPlayer === "Inativo" ? "I" : "A",
    ctrlPlayer: cad.controlarPlayer ? "S" : "N",
    ctrlPlacaCarro: cad.placaCarro ? "S" : "N",
    ctrlPlaylists: cad.controlarPlaylist ? "S" : "N",
    cidade: (cad.cidade ?? "").trim(),
    uf: (cad.estado ?? "").trim().slice(0, 2).toUpperCase(),
  };
}
