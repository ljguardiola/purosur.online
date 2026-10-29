import type { PurchasesBySupplierBody } from "@purosur/contracts";

type SupplierRow = PurchasesBySupplierBody["suppliers"][number];

const dairySupplier: SupplierRow = {
  supplier_id: "5c1e7a42-8b3d-4f60-9a21-d4e7b0c53f18",
  name: "Lácteos del Sur",
  months: [
    { month: "2026-09", purchases: 1, amount: 45_000 },
    { month: "2026-10", purchases: 2, amount: 130_050 },
  ],
  purchases: 3,
  amount: 175_050,
};

const bakerySupplier: SupplierRow = {
  supplier_id: "a93f2d16-0e47-4c85-b6d1-27f8c4e9a053",
  name: "Panificados Norte",
  months: [{ month: "2026-10", purchases: 1, amount: 82_500 }],
  purchases: 1,
  amount: 82_500,
};

export const quarterPurchasesReport: PurchasesBySupplierBody = {
  range: { from: "2026-09-01", to: "2026-10-31" },
  suppliers: [dairySupplier, bakerySupplier],
  totals: { suppliers: 2, purchases: 4, amount: 257_550 },
};

export const emptyPurchasesReport: PurchasesBySupplierBody = {
  range: { from: "2026-10-31", to: "2026-10-31" },
  suppliers: [],
  totals: { suppliers: 0, purchases: 0, amount: 0 },
};
