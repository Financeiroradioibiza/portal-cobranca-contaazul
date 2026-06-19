export type CarryProducaoLayoutResult = {
  donorYearMonth: number;
  targetYearMonth: number;
  carried: boolean;
  placementCount: number;
  customGroupCount: number;
  skippedReason?: string;
};

/**
 * Desativado: produção usa catálogo operacional único (year_month = 0).
 * A virada Rio não altera produção nem IDs Player automaticamente.
 */
export async function carryProducaoLayoutFromDonor(
  donorYm: number,
  targetYm: number,
): Promise<CarryProducaoLayoutResult> {
  return {
    donorYearMonth: donorYm,
    targetYearMonth: targetYm,
    carried: false,
    placementCount: 0,
    customGroupCount: 0,
    skippedReason: "catalog_singleton",
  };
}

/** Desativado junto com carry — produção não segue mais a virada Rio. */
export async function ensureProducaoLayoutCarriedFromDonor(
  targetYm: number,
  donorYm: number,
): Promise<CarryProducaoLayoutResult | null> {
  return carryProducaoLayoutFromDonor(donorYm, targetYm);
}
