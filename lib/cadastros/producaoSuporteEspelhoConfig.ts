/** Espelho pré-processado da Central de suporte (tabela producao_suporte_espelho). */
export function isSuporteEspelhoEnabled(): boolean {
  const raw = process.env.SUPORTE_ESPELHO?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false;
  return true;
}
