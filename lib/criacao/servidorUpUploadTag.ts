/** Tag na biblioteca = nome da pasta na programação (ex.: SAMBA → chip [LA] SAMBA com iniciais do dono). */
export function buildServidorUpPastaUploadTag(pastaNome: string): string {
  const n = pastaNome.trim().replace(/\s+/g, " ");
  if (!n) return "";
  return n.toUpperCase().slice(0, 80);
}
