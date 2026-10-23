import type {
  ContingencyBackupTicketsAnswer,
  DiscardContingencyBackupTicketsAnswer,
  ReadContingencyBackupTicketsOutcome,
} from "@purosur/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CoreData } from "../platform/use-core-query";
import { useCoreQuery } from "../platform/use-core-query";

const backupsKey = ["backups"] as const;

const backupsKeys = {
  tickets: [...backupsKey, "tickets"] as const,
};

const TICKETS_REREAD_MS = 5000;

export function useContingencyBackupTicketsQuery(
  read: () => Promise<ReadContingencyBackupTicketsOutcome>,
): CoreData<ContingencyBackupTicketsAnswer> {
  return useCoreQuery({
    queryKey: backupsKeys.tickets,
    read: async () => {
      const outcome = await read();
      return outcome.kind === "read" ? outcome.tickets : "unavailable";
    },
    refetchInterval: () => TICKETS_REREAD_MS,
  });
}

export function useDiscardContingencyBackupTickets(
  discard: () => Promise<DiscardContingencyBackupTicketsAnswer>,
): () => void {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: discard,
    onSettled: () => queryClient.invalidateQueries({ queryKey: backupsKeys.tickets }),
  });
  return () => mutation.mutate();
}
