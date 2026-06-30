/** Tag criativa do upload ATL CRICA = nome da pasta (ex.: Bossa Jazzy → [LA] Bossa Jazzy na biblioteca). */
export function buildAtlCricaPastaUploadTag(pastaNome: string): string {
  return pastaNome.trim().replace(/\s+/g, " ").slice(0, 80);
}
