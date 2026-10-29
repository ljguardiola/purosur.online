import type { FreightByPeriodBody } from "@purosur/contracts";

export const quarterFreightReport: FreightByPeriodBody = {
  range: { from: "2026-09-01", to: "2026-10-31" },
  months: [
    { month: "2026-09", freights: 1, amount: 45_000 },
    { month: "2026-10", freights: 2, amount: 130_050 },
  ],
  totals: { freights: 3, amount: 175_050 },
};

export const emptyFreightReport: FreightByPeriodBody = {
  range: { from: "2026-10-31", to: "2026-10-31" },
  months: [],
  totals: { freights: 0, amount: 0 },
};
