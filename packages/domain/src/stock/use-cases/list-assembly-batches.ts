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
  return [...batches].sort(
    (a, b) =>
      b.assembledAt.getTime() - a.assembledAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
  );
}
