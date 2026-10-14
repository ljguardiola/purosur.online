import type { ExpiringLot, ExpiringLotList } from "@purosur/contracts";

const chia = {
  id: "00000000-0000-4000-8000-0000000000c1",
  name: "Semillas de chía",
  categoryId: "category-seeds",
  categoryName: "Semillas",
  saleUnit: "KG",
} as const;

const oats = {
  id: "00000000-0000-4000-8000-0000000000c2",
  name: "Avena arrollada",
  categoryId: "category-cereals",
  categoryName: "Cereales",
  saleUnit: "KG",
} as const;

const yogurt = {
  id: "00000000-0000-4000-8000-0000000000c3",
  name: "Yogur natural",
  categoryId: "category-dairy",
  categoryName: "Lácteos",
  saleUnit: "UNIT",
} as const;

export const chiaExpiredLot: ExpiringLot = {
  id: "00000000-0000-4000-8000-00000000e001",
  lotNumber: "L-SC02",
  expiresOn: "2026-10-10",
  remaining: 1_200,
  valueCents: 480_000,
  expired: true,
  daysToExpiry: -3,
  product: chia,
};

export const oatsYesterdayLot: ExpiringLot = {
  id: "00000000-0000-4000-8000-00000000e002",
  lotNumber: null,
  expiresOn: "2026-10-12",
  remaining: 2_500,
  valueCents: null,
  expired: true,
  daysToExpiry: -1,
  product: oats,
};

export const yogurtTodayLot: ExpiringLot = {
  id: "00000000-0000-4000-8000-00000000e003",
  lotNumber: "L-YG14",
  expiresOn: "2026-10-13",
  remaining: 24_000,
  valueCents: 960_000,
  expired: false,
  daysToExpiry: 0,
  product: yogurt,
};

export const chiaTomorrowLot: ExpiringLot = {
  id: "00000000-0000-4000-8000-00000000e004",
  lotNumber: "L-SC03",
  expiresOn: "2026-10-14",
  remaining: 3_000,
  valueCents: 1_200_000,
  expired: false,
  daysToExpiry: 1,
  product: chia,
};

export const oatsUpcomingLot: ExpiringLot = {
  id: "00000000-0000-4000-8000-00000000e005",
  lotNumber: "L-AV07",
  expiresOn: "2026-10-25",
  remaining: 8_000,
  valueCents: 1_600_000,
  expired: false,
  daysToExpiry: 12,
  product: oats,
};

export function expiringLotList(
  lots: ExpiringLot[],
  summary: ExpiringLotList["summary"] = {
    valueCents: lots.reduce((total, lot) => total + (lot.valueCents ?? 0), 0),
    withoutCostCount: lots.filter((lot) => lot.valueCents === null).length,
  },
): ExpiringLotList {
  return { windowDays: 30, lots, summary };
}
