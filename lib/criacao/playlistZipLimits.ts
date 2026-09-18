/** Máximo de faixas por ZIP — evita estourar RAM do browser em programações grandes. */
export const PLAYLIST_ZIP_TRACKS_PER_PART = 50;

export function playlistZipPartCount(trackCount: number): number {
  if (trackCount <= 0) return 0;
  return Math.ceil(trackCount / PLAYLIST_ZIP_TRACKS_PER_PART);
}
