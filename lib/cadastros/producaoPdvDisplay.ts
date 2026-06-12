/** Valores como «3.0win» são versão do player, não programação musical. */
export function looksLikePlayerVersion(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  return /win/i.test(v) && /\d/.test(v);
}

export function resolveProgramacaoAndPlayerVersion(input: {
  programacaoMusical?: string | null;
  versaoPlayer?: string | null;
}): { programacaoMusical: string; playerVersion: string | null } {
  const progRaw = input.programacaoMusical?.trim() ?? "";
  const playerRaw = input.versaoPlayer?.trim() ?? "";

  if (playerRaw) {
    const prog =
      progRaw && progRaw !== playerRaw && !looksLikePlayerVersion(progRaw) ? progRaw : "Padrão";
    return { programacaoMusical: prog, playerVersion: playerRaw };
  }

  if (looksLikePlayerVersion(progRaw)) {
    return { programacaoMusical: "Padrão", playerVersion: progRaw };
  }

  return { programacaoMusical: progRaw || "Padrão", playerVersion: null };
}
