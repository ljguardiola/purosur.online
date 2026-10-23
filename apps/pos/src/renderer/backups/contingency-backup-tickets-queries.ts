import type {
  ContingencyBackupTicketOfSaleAnswer,
  ContingencyBackupTicketsAnswer,
  DiscardContingencyBackupTicketsAnswer,
  ReadContingencyBackupTicketOfSaleOutcome,
  ReadContingencyBackupTicketsOutcome,
} from "@purosur/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CoreData } from "../platform/use-core-query";
import { useCoreQuery } from "../platform/use-core-query";

const backupsKey = ["backups"] as const;

const backupsKeys = {
  tickets: [...backupsKey, "tickets"] as const,
  ticketOfSale: (saleId: string) => [...backupsKey, "ticket-of-sale", saleId] as const,
};

const TICKETS_REREAD_MS = 5000;
const TICKET_OF_SALE_REREAD_MS = 1000;

export function useContingencyBackupTicketsQuery({
  read,
  enabled = true,
}: {
  read: () => Promise<ReadContingencyBackupTicketsOutcome>;
  enabled?: boolean;
}): CoreData<ContingencyBackupTicketsAnswer> {
  return useCoreQuery({
    queryKey: backupsKeys.tickets,
    read: async () => {
      const outcome = await read();
      return outcome.kind === "read" ? outcome.tickets : "unavailable";
    },
    enabled,
    refetchInterval: () => TICKETS_REREAD_MS,
  });
}

export function useContingencyBackupTicketOfSaleQuery({
  saleId,
  read,
}: {
  saleId: string;
  read: (saleId: string) => Promise<ReadContingencyBackupTicketOfSaleOutcome>;
}): CoreData<ContingencyBackupTicketOfSaleAnswer> {
  return useCoreQuery({
    queryKey: backupsKeys.ticketOfSale(saleId),
    read: async () => {
      const outcome = await read(saleId);
      return outcome.kind === "read" ? outcome.ticket : "unavailable";
    },
    refetchInterval: (answer) =>
      answer === undefined ||
      answer.standing === "to_print" ||
      answer.standing === "awaiting_customer_document"
        ? TICKET_OF_SALE_REREAD_MS
        : false,
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
