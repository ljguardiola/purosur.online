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
    .map(({ voided, lotMovements, ...batch }) => ({
      ...batch,
      status: assemblyBatchStatus({ id: batch.id, voided, lotMovements }),
    }))
    .sort((a, b) => b.assembledAt.getTime() - a.assembledAt.getTime() || b.id.localeCompare(a.id));
}
