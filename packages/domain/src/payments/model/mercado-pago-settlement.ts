const CHARGE_MOVEMENT_TYPES = ["SETTLEMENT", "REFUND", "CHARGEBACK", "DISPUTE"] as const;

const CHARGE_TYPE = "SETTLEMENT";

const MERCADO_PAGO_SETTLEMENT_REPORT_DAYS = 60;

const SECOND_MS = 1000;
const DAY_MS = 24 * 60 * 60 * SECOND_MS;

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

// Mercado Pago takes and echoes a report's window in whole seconds.
export function settlementReportWindow(now: Date): { beginDate: Date; endDate: Date } {
  const end = now.getTime() - (now.getTime() % SECOND_MS);
  return {
    beginDate: new Date(end - MERCADO_PAGO_SETTLEMENT_REPORT_DAYS * DAY_MS),
    endDate: new Date(end),
  };
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
