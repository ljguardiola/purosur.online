import type {
  SupplierItemLinkChoices,
  SupplierItemLinkProposal,
  SupplierItemQuantityProposal,
} from "@purosur/contracts";

export const PASAS_ID = "90d00000-0000-4000-8000-000000000021";
const ALMENDRAS_ID = "90d00000-0000-4000-8000-000000000003";
const MIEL_ID = "90d00000-0000-4000-8000-000000000022";

export const LINK_CHOICES: SupplierItemLinkChoices = {
  products: [
    {
      id: PASAS_ID,
      name: "Pasas de uva",
      saleUnit: "KG",
      brandName: null,
      netContent: null,
    },
    {
      id: ALMENDRAS_ID,
      name: "Almendras peladas",
      saleUnit: "KG",
      brandName: null,
      netContent: null,
    },
    {
      id: "90d00000-0000-4000-8000-000000000022",
      name: "Miel pura de abeja 1 kg",
      saleUnit: "UNIT",
      brandName: null,
      netContent: null,
    },
  ],
  vatRates: { offered: [2100, 1050], default: 2100 },
};

export const PROPOSED_BY_BARCODE: SupplierItemLinkProposal = {
  kind: "proposed",
  by: "barcode",
  quantity: null,
  product: { id: PASAS_ID, name: "Pasas de uva", brandName: null, netContent: null },
};
export const PROPOSED_BY_AI: SupplierItemLinkProposal = { ...PROPOSED_BY_BARCODE, by: "ai" };
export const PROPOSED_PASAS_WITH_KILOS: SupplierItemLinkProposal = {
  ...PROPOSED_BY_AI,
  quantity: 12_500,
};
export const PROPOSED_PASAS_WITH_GRAMS: SupplierItemLinkProposal = {
  ...PROPOSED_BY_AI,
  quantity: 500,
};
export const PROPOSED_MIEL_WITH_UNITS: SupplierItemLinkProposal = {
  kind: "proposed",
  by: "barcode",
  quantity: 36_000,
  product: { id: MIEL_ID, name: "Miel pura de abeja 1 kg", brandName: null, netContent: null },
};
export const NO_PROPOSAL: SupplierItemLinkProposal = { kind: "none" };
export const UNAVAILABLE_PROPOSAL: SupplierItemLinkProposal = { kind: "unavailable" };

const GRANOLA_KOS_ID = "90d00000-0000-4000-8000-000000000041";
const GRANOLA_OTHER_ID = "90d00000-0000-4000-8000-000000000042";

export const GRANOLA_LINK_CHOICES: SupplierItemLinkChoices = {
  ...LINK_CHOICES,
  products: [
    {
      id: GRANOLA_OTHER_ID,
      name: "Granola Berries",
      saleUnit: "UNIT",
      brandName: "Naturalia",
      netContent: { quantity: 500, unit: "G" },
    },
    {
      id: GRANOLA_KOS_ID,
      name: "Granola Berries",
      saleUnit: "UNIT",
      brandName: "Kos",
      netContent: { quantity: 1, unit: "KG" },
    },
  ],
};

export const PROPOSED_GRANOLA_KOS: SupplierItemLinkProposal = {
  kind: "proposed",
  by: "ai",
  quantity: null,
  product: {
    id: GRANOLA_KOS_ID,
    name: "Granola Berries",
    brandName: "Kos",
    netContent: { quantity: 1, unit: "KG" },
  },
};

export const PROPOSED_QUANTITY_OF_UNITS: SupplierItemQuantityProposal = {
  kind: "proposed",
  quantity: 36_000,
};
export const PROPOSED_QUANTITY_OF_KILOS: SupplierItemQuantityProposal = {
  kind: "proposed",
  quantity: 12_500,
};
export const NO_QUANTITY_PROPOSAL: SupplierItemQuantityProposal = { kind: "none" };
export const UNAVAILABLE_QUANTITY_PROPOSAL: SupplierItemQuantityProposal = {
  kind: "unavailable",
};
