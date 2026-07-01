import { detectMixAndTrim, type MixTrimResult } from './mixTrimDetect.js';
import { portalQuery } from './portalDb.js';

export type ResolvedMixTrim = MixTrimResult & {
  /** Valor gravado em mix_segundos_finais (só detecção — sem padrão fixo). */
  appliedMixSegundos: number;
};

/**
 * Regras acordadas (sem fallback de Config):
 * - Fade de rádio → mix = 2 s após início do fade
 * - Outro quieto contínuo (What's Up) → mix 0
 * - Sem fade detectado → mix 0
 * - Trim fim → silêncio morto ≥ 1,2 s; trim início → 0
 */
export async function resolveMixTrim(inputPath: string): Promise<ResolvedMixTrim> {
  const detected = await detectMixAndTrim(inputPath);
  return { ...detected, appliedMixSegundos: detected.mixSegundosFinais };
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
              trim_inicio_ms = $3,
              trim_fim_ms = $4,
              updated_at = now()
        WHERE id = $1
          AND mix_auto = true
          AND (mix_segundos_finais IS NULL OR mix_segundos_finais = 0)`,
      [musicaId, mix, resolved.trimInicioMs, resolved.trimFimMs],
    );
    return;
  }

  if (onlyIfAuto) {
    await portalQuery(
      `UPDATE musica_biblioteca
          SET mix_segundos_finais = $2,
              trim_inicio_ms = $3,
              trim_fim_ms = $4,
              updated_at = now()
        WHERE id = $1 AND mix_auto = true`,
      [musicaId, mix, resolved.trimInicioMs, resolved.trimFimMs],
    );
    return;
  }

  await portalQuery(
    `UPDATE musica_biblioteca
        SET mix_segundos_finais = $2,
            trim_inicio_ms = $3,
            trim_fim_ms = $4,
            mix_auto = true,
            updated_at = now()
      WHERE id = $1`,
    [musicaId, mix, resolved.trimInicioMs, resolved.trimFimMs],
  );
}
