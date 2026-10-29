import type { SupplierItemLinkChoices, SupplierItemLinkProposal } from "@purosur/contracts";

export const PASAS_ID = "90d00000-0000-4000-8000-000000000021";
const ALMENDRAS_ID = "90d00000-0000-4000-8000-000000000003";

export const CAJA_DE_PASAS = {
  id: "9ac00000-0000-4000-8000-000000000031",
  name: "Caja de 10 kg",
  quantityPerPackage: 10_000,
};
export const BOLSA_DE_PASAS = {
  id: "9ac00000-0000-4000-8000-000000000032",
  name: "Bolsa de 5 kg",
  quantityPerPackage: 5_000,
};

export const LINK_CHOICES: SupplierItemLinkChoices = {
  products: [
    {
      id: PASAS_ID,
      name: "Pasas de uva",
      saleUnit: "KG",
      brandName: null,
      netContent: null,
      packagings: [CAJA_DE_PASAS, BOLSA_DE_PASAS],
    },
    {
      id: ALMENDRAS_ID,
      name: "Almendras peladas",
      saleUnit: "KG",
      brandName: null,
      netContent: null,
      packagings: [],
    },
    {
      id: "90d00000-0000-4000-8000-000000000022",
      name: "Miel pura de abeja 1 kg",
      saleUnit: "UNIT",
      brandName: null,
      netContent: null,
      packagings: [
        {
          id: "9ac00000-0000-4000-8000-000000000033",
          name: "Caja x 12",
          quantityPerPackage: 12_000,
        },
      ],
    },
  ],
  vatRates: { offered: [2100, 1050], default: 2100 },
};

export const PROPOSED_BY_BARCODE: SupplierItemLinkProposal = {
  kind: "proposed",
  by: "barcode",
  product: { id: PASAS_ID, name: "Pasas de uva", brandName: null, netContent: null },
};
export const PROPOSED_BY_AI: SupplierItemLinkProposal = { ...PROPOSED_BY_BARCODE, by: "ai" };
export const NO_PROPOSAL: SupplierItemLinkProposal = { kind: "none" };
export const UNAVAILABLE_PROPOSAL: SupplierItemLinkProposal = { kind: "unavailable" };

export const GRANOLA_KOS_ID = "90d00000-0000-4000-8000-000000000041";
export const GRANOLA_OTHER_ID = "90d00000-0000-4000-8000-000000000042";

export const GRANOLA_LINK_CHOICES: SupplierItemLinkChoices = {
  ...LINK_CHOICES,
  products: [
    {
      id: GRANOLA_OTHER_ID,
      name: "Granola Berries",
      saleUnit: "UNIT",
      brandName: "Naturalia",
      netContent: { quantity: 500, unit: "G" },
      packagings: [],
    },
    {
      id: GRANOLA_KOS_ID,
      name: "Granola Berries",
      saleUnit: "UNIT",
      brandName: "Kos",
      netContent: { quantity: 1, unit: "KG" },
      packagings: [],
    },
  ],
};

export const PROPOSED_GRANOLA_KOS: SupplierItemLinkProposal = {
  kind: "proposed",
  by: "ai",
  product: {
    id: GRANOLA_KOS_ID,
    name: "Granola Berries",
    brandName: "Kos",
    netContent: { quantity: 1, unit: "KG" },
  },
};
