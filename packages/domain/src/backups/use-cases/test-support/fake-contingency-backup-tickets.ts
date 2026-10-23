import type { ContingencyBackupTicketRecord } from "../../model/contingency-backup-ticket.js";
import type {
  ContingencyBackupTicketIds,
  ContingencyBackupTicketPrinter,
  ContingencyBackupTicketPrinting,
  ContingencyBackupTicketSealer,
  ContingencyBackupTicketSealing,
  ContingencyBackupTicketStore,
  DiscardContingencyBackupTicketsTransaction,
  NewContingencyBackupTicket,
  PrintContingencyBackupTicketTransaction,
  RecordContingencyBackupTicketTransaction,
} from "../contingency-backup-ticket-ports.js";

type FullTransaction = RecordContingencyBackupTicketTransaction &
  PrintContingencyBackupTicketTransaction &
  DiscardContingencyBackupTicketsTransaction;

export class FakeContingencyBackupTicketStore
  implements ContingencyBackupTicketStore<FullTransaction>
{
  private tickets: ContingencyBackupTicketRecord[];
  private recordedTickets: NewContingencyBackupTicket[] = [];
  acknowledgedThrough: number;
  transactionOpen = false;
  failNextWrite = false;

  constructor(seeded: ContingencyBackupTicketRecord[] = [], acknowledgedThrough = 0) {
    this.tickets = structuredClone(seeded);
    this.acknowledgedThrough = acknowledgedThrough;
  }

  snapshot(): ContingencyBackupTicketRecord[] {
    return structuredClone(this.tickets);
  }

  recorded(): NewContingencyBackupTicket[] {
    return structuredClone(this.recordedTickets);
  }

  async transaction<TOutcome>(work: (tx: FullTransaction) => Promise<TOutcome>): Promise<TOutcome> {
    const tickets = structuredClone(this.tickets);
    const recordedTickets = structuredClone(this.recordedTickets);
    const failIfAsked = () => {
      if (this.failNextWrite) {
        this.failNextWrite = false;
        throw new Error("storage unavailable");
      }
    };
    const tx: FullTransaction = {
      ticketsToConsider: async () => structuredClone(tickets),
      acknowledgedThroughSeq: async () => this.acknowledgedThrough,
      recordTicket: async (ticket) => {
        failIfAsked();
        recordedTickets.push(structuredClone(ticket));
        tickets.push({
          id: ticket.id,
          lastDeviceSeq: ticket.range.lastDeviceSeq,
          sealed: ticket.sealed !== null,
          customerDocumentPrinted: null,
          printedAt: null,
          discardedAt: null,
        });
      },
      markPrinted: async (ticketId, at) => {
        failIfAsked();
        for (const ticket of tickets) {
          if (ticket.id === ticketId) ticket.printedAt = at;
        }
      },
      markDiscarded: async (ticketIds, at) => {
        failIfAsked();
        for (const ticket of tickets) {
          if (ticketIds.includes(ticket.id)) ticket.discardedAt = at;
        }
      },
    };
    this.transactionOpen = true;
    try {
      const outcome = await work(tx);
      this.tickets = tickets;
      this.recordedTickets = recordedTickets;
      return outcome;
    } finally {
      this.transactionOpen = false;
    }
  }
}

export class FakeContingencyBackupTicketIds implements ContingencyBackupTicketIds {
  private count = 0;

  next(): string {
    this.count += 1;
    return `ticket-${this.count}`;
  }
}

export class FakeContingencyBackupTicketSealer implements ContingencyBackupTicketSealer {
  readonly sealed: string[] = [];

  private readonly answer: ContingencyBackupTicketSealing;

  constructor(
    answer: ContingencyBackupTicketSealing = {
      kind: "sealed",
      keyVersion: 1,
      qrCodes: ["QR-1", "QR-2"],
    },
  ) {
    this.answer = answer;
  }

  async seal(ticketId: string): Promise<ContingencyBackupTicketSealing> {
    this.sealed.push(ticketId);
    return this.answer;
  }
}

export class FakeContingencyBackupTicketPrinter implements ContingencyBackupTicketPrinter {
  readonly printed: string[] = [];
  transactionOpenWhilePrinting = false;

  private readonly store: FakeContingencyBackupTicketStore;
  private readonly answer: ContingencyBackupTicketPrinting;
  private readonly unrenderable: readonly string[];

  constructor(
    store: FakeContingencyBackupTicketStore,
    answer: ContingencyBackupTicketPrinting = { kind: "sent" },
    unrenderable: readonly string[] = [],
  ) {
    this.store = store;
    this.answer = answer;
    this.unrenderable = unrenderable;
  }

  async print(ticketId: string): Promise<ContingencyBackupTicketPrinting> {
    if (this.unrenderable.includes(ticketId)) return { kind: "unrenderable" };
    this.printed.push(ticketId);
    this.transactionOpenWhilePrinting ||= this.store.transactionOpen;
    return this.answer;
  }
}
