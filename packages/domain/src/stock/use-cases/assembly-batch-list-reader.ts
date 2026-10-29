import type { SaleUnit } from "../../catalog/index.js";
import type { AssemblyBatchStatus, BatchLotMovement } from "../model/assembly-batch.js";
import type { ProductBrandAndNetContent } from "../model/product-brand-and-net-content.js";

export interface ReadAssemblyBatch extends ProductBrandAndNetContent {
  id: string;
  productId: string;
  productName: string;
  saleUnit: SaleUnit;
  assembledAt: Date;
  output: number;
  unitCostCents: number | null;
  costIncomplete: boolean;
  expiresOn: string | null;
  voided: boolean;
  lotMovements: BatchLotMovement[];
}

export interface AssemblyBatchListing extends Omit<ReadAssemblyBatch, "voided" | "lotMovements"> {
  status: AssemblyBatchStatus;
}

export interface AssemblyBatchesQuery {
  locationId: string;
  from: Date;
  to: Date;
}

export interface AssemblyBatchListReader {
  // The batches assembled at the location from `from` up to, not including, `to`.
  batches(query: AssemblyBatchesQuery): Promise<ReadAssemblyBatch[]>;
}
