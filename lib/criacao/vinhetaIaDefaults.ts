/** Defaults e limites do laboratório de vinhetas IA. */

export const VINHETA_IA_DEFAULT_BED_VOLUME = 0.18;
export const VINHETA_IA_DEFAULT_VOICE_SPEED = 1.0;
export const VINHETA_IA_DEFAULT_VOICE_STABILITY = 0.45;

export const VINHETA_IA_STABILITY_MORE = 0.5;
export const VINHETA_IA_STABILITY_LESS = 0.31;

export const VINHETA_IA_SPEED_STEP = 0.1;
export const VINHETA_IA_BED_VOLUME_FACTOR = 0.9;

export const VINHETA_IA_MIN_BED_VOLUME = 0.05;
export const VINHETA_IA_MIN_VOICE_SPEED = 0.5;

export function formatVinhetaIaSpeed(speed: number): string {
  return `${Math.round(speed * 100)}%`;
}

export function formatVinhetaIaStability(stability: number): string {
  return `${Math.round(stability * 100)}%`;
}
