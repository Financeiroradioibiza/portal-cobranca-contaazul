import type { ResolvedTrack } from "@/lib/criacao/trackListParse";
import { safeFilename } from "@/lib/criacao/trackListParse";

type SpotifyToken = { accessToken: string; expiresAt: number };

let cached: SpotifyToken | null = null;

function playlistIdFromUrl(url: string): string | null {
  const m = url.match(/playlist[/:]([A-Za-z0-9]+)/i);
  if (m) return m[1]!;
  if (/^[A-Za-z0-9]+$/.test(url.trim())) return url.trim();
  return null;
}

function albumIdFromUrl(url: string): string | null {
  const m = url.match(/album[/:]([A-Za-z0-9]+)/i);
  return m ? m[1]! : null;
}

async function getSpotifyToken(): Promise<string> {
  const id = process.env.SPOTIFY_CLIENT_ID?.trim();
  const secret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!id || !secret) throw new Error("spotify_not_configured");

  if (cached && Date.now() < cached.expiresAt - 30_000) {
    return cached.accessToken;
  }

  const creds = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error("spotify_auth_failed");
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cached.accessToken;
}

async function spotifyGet<T>(path: string): Promise<T> {
  const token = await getSpotifyToken();
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`spotify_api_${res.status}`);
  return res.json() as Promise<T>;
}

type SpotifyTracksPage = {
  items: Array<{
    track: {
      name: string;
      artists: Array<{ name: string }>;
      external_urls?: { spotify?: string };
    } | null;
  }>;
  next: string | null;
};

async function collectPlaylistTracks(playlistId: string, sourceUrl: string): Promise<ResolvedTrack[]> {
  const out: ResolvedTrack[] = [];
  let path: string | null =
    `/playlists/${playlistId}/tracks?limit=100&fields=items(track(name,artists(name),external_urls)),next`;

  while (path) {
    const page: SpotifyTracksPage = await spotifyGet<SpotifyTracksPage>(path);
    for (const item of page.items) {
      const tr = item.track;
      if (!tr?.name) continue;
      const artist = tr.artists.map((a) => a.name).join(", ");
      out.push({
        title: tr.name,
        artist,
        source: "spotify",
        sourceRef: tr.external_urls?.spotify ?? sourceUrl,
        suggestedFilename: safeFilename(tr.name, artist),
      });
    }
    path = page.next ? new URL(page.next).pathname + new URL(page.next).search : null;
  }

  return out;
}

async function collectAlbumTracks(albumId: string, sourceUrl: string): Promise<ResolvedTrack[]> {
  type AlbumPage = {
    items: Array<{ name: string; artists: Array<{ name: string }>; external_urls?: { spotify?: string } }>;
    next: string | null;
  };
  const out: ResolvedTrack[] = [];
  let path: string | null =
    `/albums/${albumId}/tracks?limit=50&fields=items(name,artists(name)),next`;

  while (path) {
    const page: AlbumPage = await spotifyGet<AlbumPage>(path);
    for (const tr of page.items) {
      const artist = tr.artists.map((a) => a.name).join(", ");
      out.push({
        title: tr.name,
        artist,
        source: "spotify",
        sourceRef: tr.external_urls?.spotify ?? sourceUrl,
        suggestedFilename: safeFilename(tr.name, artist),
      });
    }
    path = page.next ? new URL(page.next).pathname + new URL(page.next).search : null;
  }

  return out;
}

export async function resolveSpotifyUrl(url: string): Promise<ResolvedTrack[]> {
  const trimmed = url.trim();
  const playlistId = playlistIdFromUrl(trimmed);
  if (playlistId) return collectPlaylistTracks(playlistId, trimmed);

  const albumId = albumIdFromUrl(trimmed);
  if (albumId) return collectAlbumTracks(albumId, trimmed);

  throw new Error("invalid_spotify_url");
}

export function spotifyConfigured(): boolean {
  return Boolean(process.env.SPOTIFY_CLIENT_ID?.trim() && process.env.SPOTIFY_CLIENT_SECRET?.trim());
}
