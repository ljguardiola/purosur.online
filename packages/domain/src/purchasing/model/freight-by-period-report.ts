import { compareSpanishText } from "../../shared/index.js";
import { reportMonthOf } from "./report-month.js";

export interface RegisteredFreight {
  freightOn: string;
  amountCents: number;
}

interface MonthFreight {
  month: string;
  freights: number;
  amount: number;
}

export interface FreightByPeriod {
  months: MonthFreight[];
  totals: { freights: number; amount: number };
}

export function freightByPeriod(freights: readonly RegisteredFreight[]): FreightByPeriod {
  const byMonth = new Map<string, { freights: number; amount: number }>();
  let count = 0;
  let amount = 0;
  for (const freight of freights) {
    const month = reportMonthOf(freight.freightOn);
    const current = byMonth.get(month) ?? { freights: 0, amount: 0 };
    byMonth.set(month, {
      freights: current.freights + 1,
      amount: current.amount + freight.amountCents,
    });
    count += 1;
    amount += freight.amountCents;
  }
  return {
    months: [...byMonth.entries()]
      .sort(([a], [b]) => compareSpanishText(a, b))
      .map(([month, tally]) => ({ month, ...tally })),
    totals: { freights: count, amount },
  };
}
