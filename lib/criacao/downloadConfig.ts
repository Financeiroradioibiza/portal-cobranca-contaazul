import type { DownloadProviderId } from "@/lib/criacao/downloadParse";

export type DownloadServiceConfig = {
  spotizerrUrl: string | null;
  spotizerrToken: string | null;
  deemixUrl: string | null;
  youtubeDlUrl: string | null;
  youtubeDlApiKey: string | null;
  stagingDir: string | null;
  cloud2ProcessUrl: string | null;
  cloud2ProcessSecret: string | null;
};

export function getDownloadServiceConfig(): DownloadServiceConfig {
  return {
    spotizerrUrl: trimEnv(process.env.CRIACAO_SPOTIZERR_URL),
    spotizerrToken: trimEnv(process.env.CRIACAO_SPOTIZERR_TOKEN),
    deemixUrl: trimEnv(process.env.CRIACAO_DEEMIX_URL),
    youtubeDlUrl: trimEnv(process.env.CRIACAO_YOUTUBE_DL_URL),
    youtubeDlApiKey: trimEnv(process.env.CRIACAO_YOUTUBE_DL_API_KEY),
    stagingDir: trimEnv(process.env.CRIACAO_DOWNLOAD_STAGING_DIR),
    cloud2ProcessUrl: trimEnv(process.env.CRIACAO_CLOUD2_DOWNLOAD_PROCESS_URL),
    cloud2ProcessSecret: trimEnv(process.env.CRIACAO_CLOUD2_DOWNLOAD_SECRET),
  };
}

export function providerConfigured(provider: DownloadProviderId, cfg = getDownloadServiceConfig()): boolean {
  switch (provider) {
    case "spotizerr":
      return Boolean(cfg.spotizerrUrl);
    case "deemix":
      return Boolean(cfg.deemixUrl);
    case "youtube":
      return Boolean(cfg.youtubeDlUrl);
    default:
      return false;
  }
}

export function providerConfigHint(provider: DownloadProviderId): string {
  switch (provider) {
    case "spotizerr":
      return "Configure CRIACAO_SPOTIZERR_URL no servidor (ex.: http://spotizerr:7171).";
    case "deemix":
      return "Configure CRIACAO_DEEMIX_URL no servidor (ex.: http://deemix:6595). No cloud2, defina também CRIACAO_DEEMIX_FILES_DIR (pasta local dos MP3) ou CRIACAO_DEEMIX_MUSIC_URL (porta 6596).";
    case "youtube":
      return "Configure CRIACAO_YOUTUBE_DL_URL no servidor (ex.: http://youtube-dl:5000).";
    default:
      return "";
  }
}

function trimEnv(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t || null;
}
