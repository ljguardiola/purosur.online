import type {
  AssemblyBatch,
  AssemblyBatchList,
  AssemblyBatchPreview,
  RecipeSummary,
} from "@purosur/contracts";
import { almendras, cajaDeInfusiones, mani, mixDeFrutosSecos, nueces, pasas } from "./recipes";

export const mixBatch: AssemblyBatch = {
  id: "b0000000-0000-4000-8000-000000000001",
  productId: mixDeFrutosSecos.productId,
  productName: mixDeFrutosSecos.productName,
  saleUnit: "KG",
  assembledAt: "2026-09-15T13:30:00.000Z",
  output: 4_950,
  unitCostCents: 991_200,
  costIncomplete: false,
  expiresOn: "2026-11-02",
  lines: [
    { componentProductId: almendras.id, name: almendras.name, saleUnit: "KG", quantity: 2_000 },
  ],
};

export const infusionsBatch: AssemblyBatch = {
  id: "b0000000-0000-4000-8000-000000000002",
  productId: cajaDeInfusiones.productId,
  productName: cajaDeInfusiones.productName,
  saleUnit: "UNIT",
  assembledAt: "2026-09-10T15:05:00.000Z",
  output: 12_000,
  unitCostCents: null,
  costIncomplete: true,
  expiresOn: null,
  lines: [],
};

export function assemblyBatchList(
  batches: AssemblyBatch[],
  recipes: RecipeSummary[] = [mixDeFrutosSecos, cajaDeInfusiones],
): AssemblyBatchList {
  return { batches, recipes };
}

export const mixPreview: AssemblyBatchPreview = {
  recipeVersion: mixDeFrutosSecos.version,
  proposal: {
    used: [
      { componentProductId: almendras.id, quantity: 2_000 },
      { componentProductId: nueces.id, quantity: 1_500 },
      { componentProductId: mani.id, quantity: 1_000 },
      { componentProductId: pasas.id, quantity: 500 },
    ],
    output: 4_950,
  },
  used: [
    { componentProductId: almendras.id, quantity: 2_000 },
    { componentProductId: nueces.id, quantity: 1_500 },
    { componentProductId: mani.id, quantity: 1_000 },
    { componentProductId: pasas.id, quantity: 500 },
  ],
  planned: [],
  lot: {
    costTotalCents: 4_906_440,
    costQuantity: 4_950,
    unitCostCents: 991_200,
    costIncomplete: false,
    expiresOn: "2026-11-02",
  },
};
