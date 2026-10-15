import type { ReadClockGuardOutcome } from "@purosur/contracts";
import { useQueryClient } from "@tanstack/react-query";
import type { CoreData } from "../platform/use-core-query";
import { useCoreQuery } from "../platform/use-core-query";

const fiscalKey = ["fiscal"] as const;

const fiscalKeys = {
  clockGuard: [...fiscalKey, "clock-guard"] as const,
};

export type ShownClockGuard = Extract<ReadClockGuardOutcome, { kind: "read" }>;

export function useClockGuardQuery(
  read: () => Promise<ReadClockGuardOutcome>,
): CoreData<ShownClockGuard> {
  return useCoreQuery({
    queryKey: fiscalKeys.clockGuard,
    read: async () => {
      const outcome = await read();
      return outcome.kind === "unavailable" ? "unavailable" : outcome;
    },
  });
}

export function useRefreshClockGuard(): () => Promise<void> {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: fiscalKeys.clockGuard });
}
