import {
  type CorrectedInvoice,
  tiedToInvoice,
  type VoidCreditNoteStanding,
} from "../../model/sale-credit-note.js";
import type { SaleInvoiceStanding } from "../../model/sale-credit-note-route.js";
import type {
  CloudCreditNoteAnswer,
  CloudCreditNoteCall,
  CloudCreditNotes,
  CreditNotePrinter,
  PendingCreditNote,
  RegisterCreditNotes,
} from "../request-credit-notes-ports.js";

export type CloudReply = CloudCreditNoteAnswer | null;

export class FakeRegisterCreditNotes implements RegisterCreditNotes {
  readonly answered = new Map<string, { answer: VoidCreditNoteStanding; answeredAt: Date }>();
  readonly tied = new Map<string, CorrectedInvoice>();
  readonly standingLookups: string[] = [];
  private readonly pending: PendingCreditNote[];
  private readonly pointOfSale: number | null;
  private readonly standings: Record<string, SaleInvoiceStanding>;

  constructor(
    pending: PendingCreditNote[],
    pointOfSale: number | null = 12,
    standings: Record<string, SaleInvoiceStanding> = {},
  ) {
    this.pending = pending;
    this.pointOfSale = pointOfSale;
    this.standings = standings;
  }

  async saleInvoiceStanding(saleId: string): Promise<SaleInvoiceStanding> {
    this.standingLookups.push(saleId);
    return structuredClone(
      this.standings[saleId] ?? { fiscalDocuments: [], deferralPending: false },
    );
  }

  async tieToInvoice(creditNoteId: string, invoice: CorrectedInvoice): Promise<void> {
    this.tied.set(creditNoteId, structuredClone(invoice));
    const index = this.pending.findIndex((note) => note.creditNoteId === creditNoteId);
    const note = this.pending[index];
    if (note !== undefined && note.correctedVoucher === null) {
      this.pending[index] = { ...tiedToInvoice(note, invoice), saleEvent: note.saleEvent };
    }
  }

  async inProgress(): Promise<PendingCreditNote[]> {
    return structuredClone(
      this.pending.filter(({ creditNoteId }) => !this.answered.has(creditNoteId)),
    );
  }

  async pendingCreditNote(creditNoteId: string): Promise<PendingCreditNote | null> {
    return (
      (await this.inProgress()).find((pending) => pending.creditNoteId === creditNoteId) ?? null
    );
  }

  async recordedAnswer(creditNoteId: string): Promise<VoidCreditNoteStanding | null> {
    if (!this.pending.some((pending) => pending.creditNoteId === creditNoteId)) {
      return null;
    }
    return structuredClone(this.answered.get(creditNoteId)?.answer ?? { kind: "in_progress" });
  }

  async realTimePointOfSale(): Promise<number | null> {
    return this.pointOfSale;
  }

  async recordAnswer(
    creditNoteId: string,
    answer: Exclude<VoidCreditNoteStanding, { kind: "in_progress" }>,
    answeredAt: Date,
  ): Promise<void> {
    if (!this.answered.has(creditNoteId)) {
      this.answered.set(creditNoteId, { answer, answeredAt });
    }
  }
}

export class FakeCloudCreditNotes implements CloudCreditNotes {
  readonly calls: CloudCreditNoteCall[] = [];
  readonly issued = new Set<string>();
  beforeReplying: (() => Promise<void>) | undefined;
  failure: Error | undefined;
  private replies: CloudReply[];

  constructor(replies: CloudReply[] = []) {
    this.replies = replies;
  }

  reply(...replies: CloudReply[]) {
    this.replies = replies;
  }

  async request(call: CloudCreditNoteCall): Promise<CloudReply> {
    this.calls.push(structuredClone(call));
    if (this.failure !== undefined) {
      throw this.failure;
    }
    this.issued.add(call.creditNoteId);
    await this.beforeReplying?.();
    return this.replies.shift() ?? null;
  }
}

export class FakeCreditNotePrinter implements CreditNotePrinter {
  readonly started: string[] = [];

  startPrinting(saleId: string): void {
    this.started.push(saleId);
  }
}
