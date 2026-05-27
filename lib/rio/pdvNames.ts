const MIME_ONE = "application/x-rio-pdv-nome";
const MIME_BULK = "application/x-rio-pdv-bulk";

/** Lê nomes de PDV soltos na zona do cliente (arrastar ou colar). */
export function readPdvDropFromDataTransfer(dt: DataTransfer): string[] {
  const bulk = dt.getData(MIME_BULK);
  if (bulk) {
    try {
      const parsed = JSON.parse(bulk) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is string => typeof x === "string");
      }
    } catch {
      /* ignore */
    }
  }
  const one = dt.getData(MIME_ONE).trim();
  if (one) return [one];
  const plain = dt.getData("text/plain").trim();
  if (plain.includes("\n")) return parsePdvNamesFromMultilineText(plain);
  if (plain) return [plain];
  return [];
}

/** Um PDV por linha (colar no cliente expandido). */
export function parsePdvNamesFromMultilineText(text: string): string[] {
  return sortPdvNamesAlphabetically(
    [...new Set(text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))],
  );
}

export function sortPdvNamesAlphabetically(names: string[]): string[] {
  return [...names].sort((a, b) =>
    a.localeCompare(b, "pt-BR", { sensitivity: "base" }),
  );
}

export function sortRioPdvsByNome<T extends { id: string; nome: string }>(pdvs: T[]): T[] {
  return [...pdvs].sort(
    (a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }) ||
      a.id.localeCompare(b.id),
  );
}
