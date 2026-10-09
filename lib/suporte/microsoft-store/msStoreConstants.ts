/** Origem do shell MS Store (site Netlify isolado — não é player5.radioibiza.app.br). */
export function msStorePlayerPublicOrigin(): string {
  const raw = process.env.MSSTORE_PLAYER_PUBLIC_ORIGIN?.trim();
  return (raw && raw.length > 0 ? raw : "https://msplayer5.radioibiza.app.br").replace(
    /\/$/,
    "",
  );
}

/** Ficha na Microsoft Store (atualizar quando publicar). */
export const MICROSOFT_STORE_LISTING_URL =
  process.env.MICROSOFT_STORE_PLAYER5_URL?.trim() ||
  "https://apps.microsoft.com/detail/9PPLACEHOLDER";
