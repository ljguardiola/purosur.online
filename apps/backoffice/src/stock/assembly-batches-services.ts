import {
  fetchAssemblyBatches,
  fetchAssemblyBatchPreview,
  registerAssemblyBatch,
} from "./assembly-batches-api";
import type { NewAssemblyBatchModalServices } from "./new-assembly-batch-modal";

export type AssemblyBatchesScreenServices = {
  fetchAssemblyBatches: typeof fetchAssemblyBatches;
} & NewAssemblyBatchModalServices;

export const defaultAssemblyBatchesScreenServices: AssemblyBatchesScreenServices = {
  fetchAssemblyBatches,
  fetchAssemblyBatchPreview,
  registerAssemblyBatch,
};
