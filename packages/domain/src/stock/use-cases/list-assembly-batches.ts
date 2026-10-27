import { assemblyBatchStatus } from "../model/assembly-batch.js";
import type {
  AssemblyBatchesQuery,
  AssemblyBatchListing,
  AssemblyBatchListReader,
} from "./assembly-batch-list-reader.js";

export async function listAssemblyBatches(
  reader: AssemblyBatchListReader,
  query: AssemblyBatchesQuery,
): Promise<AssemblyBatchListing[]> {
  const batches = await reader.batches(query);
  return batches
    .map(({ voided, lotConsumed, ...batch }) => ({
      ...batch,
      status: assemblyBatchStatus({ voided, lotConsumed }),
    }))
    .sort((a, b) => b.assembledAt.getTime() - a.assembledAt.getTime() || b.id.localeCompare(a.id));
}
