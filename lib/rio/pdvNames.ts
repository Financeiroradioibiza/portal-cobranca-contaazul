/** Um PDV por linha (coluna lateral ou colar no cliente). */
export function parsePdvNamesFromMultilineText(text: string): string[] {
  return [...new Set(text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))];
}
