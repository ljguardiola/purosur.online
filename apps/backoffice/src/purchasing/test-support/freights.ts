import type {
  Freight,
  FreightSummary,
  LinkablePurchaseList,
  LinkablePurchaseSummary,
} from "@purosur/contracts";

const distribuidoraAndina = {
  id: "5a900000-0000-4000-8000-000000000001",
  name: "Distribuidora Andina",
};

const molinosDelValle = {
  id: "5a900000-0000-4000-8000-000000000002",
  name: "Molinos del Valle",
};

export const compraAndina: LinkablePurchaseSummary = {
  id: "c0a00000-0000-4000-8000-000000000001",
  purchasedOn: "2026-09-12",
  supplier: distribuidoraAndina,
  receiptType: "factura_b",
  receiptNumber: "0003-00012845",
  valueCents: 16_868_000,
};

export const compraMolinos: LinkablePurchaseSummary = {
  id: "c0a00000-0000-4000-8000-000000000002",
  purchasedOn: "2026-08-28",
  supplier: molinosDelValle,
  receiptType: "remito",
  receiptNumber: "0001-00008812",
  valueCents: 6_490_000,
};

export const linkablePurchases: LinkablePurchaseList = {
  purchases: [compraAndina, compraMolinos],
  today: "2026-09-16",
};

export const envioDesdeBuenosAires: FreightSummary = {
  id: "f1000000-0000-4000-8000-000000000001",
  date: "2026-09-12",
  amountCents: 1_850_000,
  description: "Envío desde Buenos Aires",
  means: { kind: "carrier", name: "Expreso Sur" },
  purchases: [
    { id: compraAndina.id, purchasedOn: compraAndina.purchasedOn, supplier: distribuidoraAndina },
    { id: compraMolinos.id, purchasedOn: compraMolinos.purchasedOn, supplier: molinosDelValle },
  ],
};

export const retiroEnElMolino: FreightSummary = {
  id: "f1000000-0000-4000-8000-000000000002",
  date: "2026-08-28",
  amountCents: 900_000,
  description: "Retiro en el molino",
  means: { kind: "own_trip" },
  purchases: [
    { id: compraMolinos.id, purchasedOn: compraMolinos.purchasedOn, supplier: molinosDelValle },
  ],
};

export const recordedEnvio: Freight = {
  id: envioDesdeBuenosAires.id,
  date: envioDesdeBuenosAires.date,
  amountCents: envioDesdeBuenosAires.amountCents,
  description: envioDesdeBuenosAires.description,
  means: envioDesdeBuenosAires.means,
  purchaseIds: envioDesdeBuenosAires.purchases.map((purchase) => purchase.id),
  recordedAt: "2026-09-12T18:30:00.000Z",
};
