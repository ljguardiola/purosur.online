import type { SaleUnit } from "../../catalog/index.js";

export interface AssemblyBatchLineListing {
  componentProductId: string;
  name: string;
  saleUnit: SaleUnit;
  quantity: number;
}

export interface AssemblyBatchListing {
  id: string;
  productId: string;
  productName: string;
  saleUnit: SaleUnit;
  assembledAt: Date;
  output: number;
  unitCostCents: number | null;
  costIncomplete: boolean;
  expiresOn: string | null;
  lines: AssemblyBatchLineListing[];
}

export interface AssemblyBatchesQuery {
  locationId: string;
  from: Date;
  to: Date;
}

export interface AssemblyBatchListReader {
  // The batches assembled at the location from `from` up to, not including, `to`.
  batches(query: AssemblyBatchesQuery): Promise<AssemblyBatchListing[]>;
}
