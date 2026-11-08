const CHARGE_MOVEMENT_TYPES = ["SETTLEMENT", "REFUND", "CHARGEBACK", "DISPUTE"] as const;

const CHARGE_TYPE = "SETTLEMENT";

export const MERCADO_PAGO_SETTLEMENT_REPORT_DAYS = 60;

export interface SettlementMovement {
  sourceId: string;
  transactionType: string;
  transactionDate: Date;
  grossAmount: number;
  feeAmount: number;
  financingFeeAmount: number;
  taxesAmount: number;
  netAmount: number;
  moneyReleaseDate: Date | null;
}

export interface ChargeCost {
  grossAmount: number;
  feeAmount: number;
  financingFeeAmount: number;
  taxesAmount: number;
  netAmount: number;
  moneyReleaseDate: Date | null;
}

export function isChargeMovement(transactionType: string): boolean {
  return (CHARGE_MOVEMENT_TYPES as readonly string[]).includes(transactionType);
}

export function chargeCostOf(movements: readonly SettlementMovement[]): ChargeCost {
  let moneyReleaseDate: Date | null = null;
  const cost = {
    grossAmount: 0,
    feeAmount: 0,
    financingFeeAmount: 0,
    taxesAmount: 0,
    netAmount: 0,
  };
  for (const movement of movements) {
    cost.grossAmount += movement.grossAmount;
    cost.feeAmount += movement.feeAmount;
    cost.financingFeeAmount += movement.financingFeeAmount;
    cost.taxesAmount += movement.taxesAmount;
    cost.netAmount += movement.netAmount;
    const release = movement.moneyReleaseDate;
    if (
      movement.transactionType === CHARGE_TYPE &&
      release !== null &&
      (moneyReleaseDate === null || release > moneyReleaseDate)
    ) {
      moneyReleaseDate = release;
    }
  }
  return { ...cost, moneyReleaseDate };
}
