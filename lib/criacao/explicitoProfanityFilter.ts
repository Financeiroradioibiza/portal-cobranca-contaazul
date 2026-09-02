import * as leoProfanity from "leo-profanity";

let loaded = false;

function ensureDictionary(): void {
  if (loaded) return;
  leoProfanity.clearList();
  leoProfanity.loadDictionary("pt");
  leoProfanity.add(leoProfanity.getDictionary("en"));
  loaded = true;
}

/** Normaliza texto para capturar variações comuns (leetspeak, acentos). */
export function normalizeForProfanity(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[@4]/g, "a")
    .replace(/[3€]/g, "e")
    .replace(/[1!|]/g, "i")
    .replace(/[0]/g, "o")
    .replace(/[5$]/g, "s")
    .replace(/ph/g, "f")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/(.)\1{2,}/g, "$1$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Palavras extras PT-BR não cobertas pelo dicionário padrão. */
const EXTRA_PT_WORDS = [
  "caralho",
  "cacete",
  "putaria",
  "puta",
  "puto",
  "fdp",
  "filho da puta",
  "vsf",
  "vai se foder",
  "vai tomar no cu",
  "tomar no cu",
  "cu",
  "buceta",
  "xoxota",
  "piroca",
  "pica",
  "rola",
  "punheta",
  "siririca",
  "broxa",
  "viado",
  "bicha",
  "traveco",
  "corno",
  "arrombado",
  "otario",
  "babaca",
  "desgraca",
  "desgracado",
  "merda",
  "bosta",
  "cuzao",
  "fodase",
  "foda-se",
];

function containsExtraWord(normalized: string): boolean {
  const padded = ` ${normalized} `;
  return EXTRA_PT_WORDS.some((w) => {
    const nw = normalizeForProfanity(w);
    return padded.includes(` ${nw} `) || normalized.includes(nw);
  });
}

/** Retorna true se a letra contém linguagem explícita. */
export function lyricsContainProfanity(lyrics: string): boolean {
  ensureDictionary();
  const raw = lyrics.trim();
  if (!raw) return false;

  if (leoProfanity.check(raw)) return true;

  const normalized = normalizeForProfanity(raw);
  if (leoProfanity.check(normalized)) return true;
  if (containsExtraWord(normalized)) return true;

  const words = normalized.split(/\s+/).filter(Boolean);
  for (const w of words) {
    if (w.length >= 4 && leoProfanity.check(w)) return true;
  }
  return false;
}
