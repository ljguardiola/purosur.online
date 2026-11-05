import type { PurchaseChange, PurchaseSummary } from "@purosur/contracts";
import { compraDeAvena, compraDeMiel } from "./purchases";

const [lineDeMiel] = compraDeMiel.lines;
const [lineDeAvena] = compraDeAvena.lines;

if (!lineDeMiel || !lineDeAvena) {
  throw new Error("test setup: a purchase has no line");
}

const ADDED_LINE_ID = "c0b00000-0000-4000-8000-0000000000a1";

export const compraDeMielCorregida: PurchaseSummary = {
  ...compraDeMiel,
  lines: [
    { ...lineDeMiel, expiresOn: null },
    {
      ...lineDeAvena,
      id: ADDED_LINE_ID,
      quantity: 10_000,
      costPaidCents: 1_800_00,
      unitCostCents: 1_800_00,
      lotName: "Compra 14/09/2026",
      remainingInLot: 10_000,
      expiresOn: "2027-03-01",
    },
  ],
};

export const LINEA_DE_MIEL_ID = lineDeMiel.id;

export const headerCorrection: PurchaseChange = {
  id: "c0c00000-0000-4000-8000-000000000001",
  actor: { id: "a0100000-0000-4000-8000-000000000001", name: "Marta Quiroga" },
  correctedAt: "2026-09-15T14:05:00.000Z",
  change: {
    kind: "header",
    changes: [
      { field: "purchasedOn", previous: "2026-09-14", next: "2026-09-13" },
      { field: "receiptType", previous: "factura_b", next: "remito" },
      { field: "receiptNumber", previous: "0001-00001234", next: "0001-00001243" },
      { field: "note", previous: null, next: "Llegó a la mañana" },
    ],
  },
};

export const linesAdded: PurchaseChange = {
  id: "c0c00000-0000-4000-8000-000000000002",
  actor: { id: "a0100000-0000-4000-8000-000000000002", name: "Julián Paz" },
  correctedAt: "2026-09-15T16:30:00.000Z",
  change: {
    kind: "lines_added",
    lines: [
      {
        lineId: ADDED_LINE_ID,
        productId: "90d00000-0000-4000-8000-000000000002",
        quantity: 10_000,
        costPaidCents: 1_800_00,
        expiresOn: "2027-03-01",
      },
    ],
  },
};

export const lineExpiryCorrection: PurchaseChange = {
  id: "c0c00000-0000-4000-8000-000000000003",
  actor: { id: "a0100000-0000-4000-8000-000000000001", name: "Marta Quiroga" },
  correctedAt: "2026-09-16T09:00:00.000Z",
  change: {
    kind: "line_expiry",
    lineId: LINEA_DE_MIEL_ID,
    previous: "2027-01-31",
    next: null,
  },
};

export const lineCostCorrection: PurchaseChange = {
  id: "c0c00000-0000-4000-8000-000000000004",
  actor: { id: "a0100000-0000-4000-8000-000000000001", name: "Marta Quiroga" },
  correctedAt: "2026-09-17T09:00:00.000Z",
  change: {
    kind: "line_cost",
    lineId: LINEA_DE_MIEL_ID,
    previous: 7_200_00,
    next: 6_800_00,
  },
};

export const lineExpirySplitCorrection: PurchaseChange = {
  id: "c0c00000-0000-4000-8000-000000000005",
  actor: { id: "a0100000-0000-4000-8000-000000000001", name: "Marta Quiroga" },
  correctedAt: "2026-09-18T09:00:00.000Z",
  change: {
    kind: "line_expiry_split",
    lineId: LINEA_DE_MIEL_ID,
    quantity: 1_000,
    previous: "2027-01-31",
    next: "2027-11-10",
  },
};

export const lineQuantityCorrection: PurchaseChange = {
  id: "c0c00000-0000-4000-8000-000000000006",
  actor: { id: "a0100000-0000-4000-8000-000000000001", name: "Marta Quiroga" },
  correctedAt: "2026-09-19T09:00:00.000Z",
  change: {
    kind: "line_quantity",
    lineId: LINEA_DE_MIEL_ID,
    previous: { quantity: 24_000, packages: 2 },
    next: { quantity: 36_000, packages: 3 },
  },
};
