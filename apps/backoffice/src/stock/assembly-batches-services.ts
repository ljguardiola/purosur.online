import {
  fetchAssemblyBatches,
  fetchAssemblyBatchPreview,
  registerAssemblyBatch,
  voidAssemblyBatch,
} from "./assembly-batches-api";
import type { NewAssemblyBatchModalServices } from "./new-assembly-batch-modal";
import type { VoidAssemblyBatchModalServices } from "./void-assembly-batch-modal";

export type AssemblyBatchesScreenServices = {
  fetchAssemblyBatches: typeof fetchAssemblyBatches;
} & NewAssemblyBatchModalServices &
  VoidAssemblyBatchModalServices;

export const defaultAssemblyBatchesScreenServices: AssemblyBatchesScreenServices = {
  fetchAssemblyBatches,
  fetchAssemblyBatchPreview,
  registerAssemblyBatch,
  voidAssemblyBatch,
};
