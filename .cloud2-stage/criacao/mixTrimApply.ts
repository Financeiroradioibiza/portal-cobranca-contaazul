import { detectMixAndTrim, type MixTrimResult } from './mixTrimDetect.js';
import { portalQuery } from './portalDb.js';

export type ResolvedMixTrim = MixTrimResult & {
  /** Valor gravado em mix_segundos_finais (só detecção — sem padrão fixo). */
  appliedMixSegundos: number;
};

/**
 * Regras acordadas (sem fallback de Config):
 * - Fade de rádio → mix na 2.ª metade do fade (~50% da duração detectada)
 * - Outro quieto contínuo (What's Up) → mix 0
 * - Sem fade detectado → mix 0
 * - Trim → sempre manual em Edição de música (nunca automático)
 */
export async function resolveMixTrim(inputPath: string): Promise<ResolvedMixTrim> {
  const detected = await detectMixAndTrim(inputPath);
  return {
    ...detected,
    trimFimMs: 0,
    trimInicioMs: 0,
    appliedMixSegundos: detected.mixSegundosFinais,
  };
}

export async function persistMixTrimForMusica(
  musicaId: string,
  resolved: ResolvedMixTrim,
  onlyIfAuto = true,
  onlyIfMixZero = false,
): Promise<void> {
  const mix = resolved.appliedMixSegundos;
  if (onlyIfMixZero) {
    await portalQuery(
      `UPDATE musica_biblioteca
          SET mix_segundos_finais = $2,
              trim_inicio_ms = 0,
              trim_fim_ms = 0,
              updated_at = now()
        WHERE id = $1
          AND mix_auto = true
          AND (mix_segundos_finais IS NULL OR mix_segundos_finais = 0)`,
      [musicaId, mix],
    );
    return;
  }

  if (onlyIfAuto) {
    await portalQuery(
      `UPDATE musica_biblioteca
          SET mix_segundos_finais = $2,
              trim_inicio_ms = 0,
              trim_fim_ms = 0,
              updated_at = now()
        WHERE id = $1 AND mix_auto = true`,
      [musicaId, mix],
    );
    return;
  }

  await portalQuery(
    `UPDATE musica_biblioteca
        SET mix_segundos_finais = $2,
            trim_inicio_ms = 0,
            trim_fim_ms = 0,
            mix_auto = true,
            updated_at = now()
      WHERE id = $1`,
    [musicaId, mix],
  );
}

/** Ponto de mix definido pelo criativo no MP3 legado (Servidor UP, ~N no nome). */
export async function persistLegacyMixPreset(musicaId: string, mixSegundos: number): Promise<void> {
  const mix = Math.min(30, Math.max(0, Math.round(mixSegundos)));
  await portalQuery(
    `UPDATE musica_biblioteca
        SET mix_segundos_finais = $2,
            trim_inicio_ms = 0,
            trim_fim_ms = 0,
            mix_auto = false,
            updated_at = now()
      WHERE id = $1`,
    [musicaId, mix],
  );
}
