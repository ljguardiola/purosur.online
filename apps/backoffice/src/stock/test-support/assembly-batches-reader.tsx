import type { fetchAssemblyBatches } from "../assembly-batches-api";
import { useAssemblyBatchesQuery } from "../stock-queries";

export function AssemblyBatchesReader({ read }: { read: typeof fetchAssemblyBatches }) {
  useAssemblyBatchesQuery({ days: 30, fetchAssemblyBatches: read, onSessionEnded: () => {} });
  return null;
}
