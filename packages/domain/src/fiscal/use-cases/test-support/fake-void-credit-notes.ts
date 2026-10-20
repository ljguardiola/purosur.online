import type { VoidCreditNoteStanding } from "../../model/sale-void-credit-note.js";
import type {
  CloudCreditNoteCall,
  CloudCreditNotes,
  CreditNotePrinter,
  PendingCreditNote,
  RegisterVoidCreditNotes,
} from "../request-void-credit-notes-ports.js";

export type CloudReply = VoidCreditNoteStanding | null;

export class FakeRegisterVoidCreditNotes implements RegisterVoidCreditNotes {
  readonly answered = new Map<string, { answer: VoidCreditNoteStanding; answeredAt: Date }>();
  private readonly pending: PendingCreditNote[];
  private readonly pointOfSale: number | null;

  constructor(pending: PendingCreditNote[], pointOfSale: number | null = 12) {
    this.pending = pending;
    this.pointOfSale = pointOfSale;
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
