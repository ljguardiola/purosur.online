import { compareCodeUnits, compareSpanishText } from "../../shared/index.js";

export interface CashRoundingRecord {
  day: string;
  registerId: string;
  registerName: string;
  rounded: number;
  roundedSaleCount: number;
}

export interface CashRoundingTotals {
  rounded: number;
  roundedSaleCount: number;
}

function byDayThenRegister(a: CashRoundingRecord, b: CashRoundingRecord): number {
  return (
    compareCodeUnits(a.day, b.day) ||
    compareSpanishText(a.registerName, b.registerName) ||
    compareCodeUnits(a.registerId, b.registerId)
  );
}

export function cashRoundingRows(records: readonly CashRoundingRecord[]): CashRoundingRecord[] {
  return records.map((record) => ({ ...record })).sort(byDayThenRegister);
}

export function cashRoundingTotals(rows: readonly CashRoundingRecord[]): CashRoundingTotals {
  return {
    rounded: rows.reduce((sum, row) => sum + row.rounded, 0),
    roundedSaleCount: rows.reduce((sum, row) => sum + row.roundedSaleCount, 0),
  };
}
