import type {
  BackupsCoreToRendererMessage,
  BackupsRendererToCoreMessage,
  DiscardContingencyBackupTicketsAnswer,
  ReadContingencyBackupTicketOfSaleOutcome,
  ReadContingencyBackupTicketsOutcome,
} from "@purosur/contracts";
import {
  type ContingencyBackupPrintFailureReason,
  contingencyBackupTicketStanding,
  contingencyBackupTicketsSummary,
} from "@purosur/domain";
import { discardContingencyBackupTickets } from "@purosur/domain/backups/use-cases";
import type { ActionGate } from "../sessions/action-gate";
import type { SqliteContingencyBackupTickets } from "./sqlite-contingency-backup-tickets";

export interface ContingencyBackupTicketRequestsDeps {
  tickets: Pick<SqliteContingencyBackupTickets, "transaction" | "ticketOfSubject">;
  clock: { now: () => Date };
  printerFailure: () => ContingencyBackupPrintFailureReason | null;
  signedInUserId: () => string | undefined;
  gate: Pick<ActionGate, "run">;
}

export interface ContingencyBackupTicketRequests {
  read(): Promise<ReadContingencyBackupTicketsOutcome>;
  ofSale(saleId: string): Promise<ReadContingencyBackupTicketOfSaleOutcome>;
  discard(): Promise<DiscardContingencyBackupTicketsAnswer>;
}

export function createContingencyBackupTicketRequests({
  tickets,
  clock,
  printerFailure,
  signedInUserId,
  gate,
}: ContingencyBackupTicketRequestsDeps): ContingencyBackupTicketRequests {
  return {
    async read() {
      if (signedInUserId() === undefined) return { kind: "not_signed_in" };
      const discardPermitted =
        (await gate.run({ kind: "sell" }, async () => true)).kind === "performed";
      const summary = await tickets.transaction(async (tx) =>
        contingencyBackupTicketsSummary(
          await tx.ticketsToConsider(),
          await tx.acknowledgedThroughSeq(),
        ),
      );
      return {
        kind: "read",
        tickets: {
          to_print: summary.toPrint,
          awaiting_customer_document: summary.awaitingCustomerDocument,
          missing_key: summary.missingKey,
          kept: summary.kept,
          discardable: summary.discardable,
          may_discard: summary.mayDiscard,
          discard_permitted: discardPermitted,
          printer: printerFailure(),
        },
      };
    },

    async ofSale(saleId) {
      if (signedInUserId() === undefined) return { kind: "not_signed_in" };
      const ticket = await tickets.ticketOfSubject(saleId);
      if (ticket === undefined) return { kind: "read", ticket: { standing: null } };
      const acknowledged = await tickets.transaction((tx) => tx.acknowledgedThroughSeq());
      return {
        kind: "read",
        ticket: { standing: contingencyBackupTicketStanding(ticket, acknowledged) },
      };
    },

    async discard() {
      const guarded = await gate.run({ kind: "sell" }, () =>
        discardContingencyBackupTickets({ clock, store: tickets }),
      );
      return guarded.kind === "performed" ? guarded.result : guarded;
    },
  };
}

const UNAVAILABLE = { kind: "unavailable" } as const;

async function attempt<Outcome>(
  reportFailure: (context: string, error: unknown) => void,
  context: string,
  work: (() => Promise<Outcome>) | undefined,
): Promise<Outcome | typeof UNAVAILABLE> {
  try {
    return (await work?.()) ?? UNAVAILABLE;
  } catch (error) {
    reportFailure(context, error);
    return UNAVAILABLE;
  }
}

export async function answerContingencyBackupTicketRequest(
  {
    contingencyBackupTickets,
    reportFailure,
  }: {
    contingencyBackupTickets: ContingencyBackupTicketRequests | undefined;
    reportFailure: (context: string, error: unknown) => void;
  },
  message: BackupsRendererToCoreMessage,
): Promise<BackupsCoreToRendererMessage> {
  const request_id = message.request_id;
  switch (message.type) {
    case "read-contingency-backup-tickets":
      return {
        type: "read-contingency-backup-tickets-result",
        request_id,
        outcome: await attempt(
          reportFailure,
          "reading the contingency backup tickets",
          contingencyBackupTickets && (() => contingencyBackupTickets.read()),
        ),
      };
    case "read-contingency-backup-ticket-of-sale":
      return {
        type: "read-contingency-backup-ticket-of-sale-result",
        request_id,
        outcome: await attempt(
          reportFailure,
          "reading the contingency backup ticket of a sale",
          contingencyBackupTickets && (() => contingencyBackupTickets.ofSale(message.sale_id)),
        ),
      };
    case "discard-contingency-backup-tickets":
      return {
        type: "discard-contingency-backup-tickets-result",
        request_id,
        outcome: await attempt(
          reportFailure,
          "discarding the contingency backup tickets",
          contingencyBackupTickets && (() => contingencyBackupTickets.discard()),
        ),
      };
  }
}
