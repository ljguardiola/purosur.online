import type { AiCostByPeriodBody, SupplierPriceListAiCostBody } from "@purosur/contracts";

export const LIST_AI_COST: SupplierPriceListAiCostBody = {
  reading: { costNanoUsd: 1_234_567_800, unpricedCalls: 0 },
  proposals: { costNanoUsd: 250_000_000, unpricedCalls: 0 },
  total: { costNanoUsd: 1_484_567_800, unpricedCalls: 0 },
  recordedFromStart: true,
};

export const INCOMPLETE_LIST_AI_COST: SupplierPriceListAiCostBody = {
  reading: { costNanoUsd: 1_234_567_800, unpricedCalls: 0 },
  proposals: { costNanoUsd: 250_000_000, unpricedCalls: 2 },
  total: { costNanoUsd: 1_484_567_800, unpricedCalls: 2 },
  recordedFromStart: true,
};

export const SINGLE_UNPRICED_LIST_AI_COST: SupplierPriceListAiCostBody = {
  reading: { costNanoUsd: 0, unpricedCalls: 1 },
  proposals: { costNanoUsd: 0, unpricedCalls: 0 },
  total: { costNanoUsd: 0, unpricedCalls: 1 },
  recordedFromStart: true,
};

export const EARLY_LIST_AI_COST: SupplierPriceListAiCostBody = {
  reading: { costNanoUsd: 0, unpricedCalls: 0 },
  proposals: { costNanoUsd: 250_000_000, unpricedCalls: 0 },
  total: { costNanoUsd: 250_000_000, unpricedCalls: 0 },
  recordedFromStart: false,
};

const ANDINA_GROUP: AiCostByPeriodBody["groups"][number] = {
  key: "supplier-1",
  name: "Distribuidora Andina",
  reading: { costNanoUsd: 1_000_000_000, unpricedCalls: 0 },
  proposals: { costNanoUsd: 500_000_000, unpricedCalls: 0 },
  total: { costNanoUsd: 1_500_000_000, unpricedCalls: 0 },
};

const ALMACEN_GROUP: AiCostByPeriodBody["groups"][number] = {
  key: "supplier-2",
  name: "Almacén del Sur",
  reading: { costNanoUsd: 2_000_000_000, unpricedCalls: 0 },
  proposals: { costNanoUsd: 250_000_000, unpricedCalls: 0 },
  total: { costNanoUsd: 2_250_000_000, unpricedCalls: 0 },
};

export const AI_COST_BY_SUPPLIER: AiCostByPeriodBody = {
  range: { from: "2026-10-01", to: "2026-10-31" },
  groups: [ANDINA_GROUP, ALMACEN_GROUP],
  total: {
    reading: { costNanoUsd: 3_000_000_000, unpricedCalls: 0 },
    proposals: { costNanoUsd: 750_000_000, unpricedCalls: 0 },
    total: { costNanoUsd: 3_750_000_000, unpricedCalls: 0 },
  },
};

export const AI_COST_BY_DAY: AiCostByPeriodBody = {
  range: { from: "2026-10-01", to: "2026-10-31" },
  groups: [
    {
      key: "2026-10-03",
      name: null,
      reading: { costNanoUsd: 1_000_000_000, unpricedCalls: 0 },
      proposals: { costNanoUsd: 0, unpricedCalls: 0 },
      total: { costNanoUsd: 1_000_000_000, unpricedCalls: 0 },
    },
  ],
  total: {
    reading: { costNanoUsd: 1_000_000_000, unpricedCalls: 0 },
    proposals: { costNanoUsd: 0, unpricedCalls: 0 },
    total: { costNanoUsd: 1_000_000_000, unpricedCalls: 0 },
  },
};

export const AI_COST_BY_PERSON: AiCostByPeriodBody = {
  ...AI_COST_BY_SUPPLIER,
  groups: [
    {
      key: "user-1",
      name: "Lucía Ferreyra",
      reading: { costNanoUsd: 3_000_000_000, unpricedCalls: 0 },
      proposals: { costNanoUsd: 750_000_000, unpricedCalls: 0 },
      total: { costNanoUsd: 3_750_000_000, unpricedCalls: 0 },
    },
  ],
};

export const INCOMPLETE_AI_COST_BY_SUPPLIER: AiCostByPeriodBody = {
  ...AI_COST_BY_SUPPLIER,
  groups: [
    {
      ...ANDINA_GROUP,
      proposals: { costNanoUsd: 500_000_000, unpricedCalls: 3 },
      total: { costNanoUsd: 1_500_000_000, unpricedCalls: 3 },
    },
    ALMACEN_GROUP,
  ],
  total: {
    ...AI_COST_BY_SUPPLIER.total,
    proposals: { costNanoUsd: 750_000_000, unpricedCalls: 3 },
    total: { costNanoUsd: 3_750_000_000, unpricedCalls: 3 },
  },
};

export const EMPTY_AI_COST: AiCostByPeriodBody = {
  range: { from: "2026-10-31", to: "2026-10-31" },
  groups: [],
  total: {
    reading: { costNanoUsd: 0, unpricedCalls: 0 },
    proposals: { costNanoUsd: 0, unpricedCalls: 0 },
    total: { costNanoUsd: 0, unpricedCalls: 0 },
  },
};
