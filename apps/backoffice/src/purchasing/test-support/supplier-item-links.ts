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
      packagings: [CAJA_DE_PASAS, BOLSA_DE_PASAS],
    },
    { id: ALMENDRAS_ID, name: "Almendras peladas", saleUnit: "KG", packagings: [] },
    {
      id: "90d00000-0000-4000-8000-000000000022",
      name: "Miel pura de abeja 1 kg",
      saleUnit: "UNIT",
      packagings: [
        {
          id: "9ac00000-0000-4000-8000-000000000033",
          name: "Caja x 12",
          quantityPerPackage: 12_000,
        },
      ],
    },
  ],
};

export const PROPOSED_BY_BARCODE: SupplierItemLinkProposal = {
  kind: "proposed",
  by: "barcode",
  product: { id: PASAS_ID, name: "Pasas de uva" },
};
export const PROPOSED_BY_AI: SupplierItemLinkProposal = { ...PROPOSED_BY_BARCODE, by: "ai" };
export const NO_PROPOSAL: SupplierItemLinkProposal = { kind: "none" };
export const UNAVAILABLE_PROPOSAL: SupplierItemLinkProposal = { kind: "unavailable" };
