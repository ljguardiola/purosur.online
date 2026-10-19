import type { VoidCreditNoteStanding } from "../../model/sale-void-credit-note.js";
import type {
  CloudCreditNoteCall,
  CloudCreditNotes,
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

  async realTimePointOfSale(): Promise<number | null> {
    return this.pointOfSale;
  }

  async recordAnswer(
    creditNoteId: string,
    answer: Exclude<VoidCreditNoteStanding, { kind: "in_progress" }>,
    answeredAt: Date,
  ): Promise<void> {
    this.answered.set(creditNoteId, { answer, answeredAt });
  }
}

export class FakeCloudCreditNotes implements CloudCreditNotes {
  readonly calls: CloudCreditNoteCall[] = [];
  readonly issued = new Set<string>();
  private replies: CloudReply[];

  constructor(replies: CloudReply[] = []) {
    this.replies = replies;
  }

  reply(...replies: CloudReply[]) {
    this.replies = replies;
  }

  async request(call: CloudCreditNoteCall): Promise<CloudReply> {
    this.calls.push(structuredClone(call));
    this.issued.add(call.creditNoteId);
    return this.replies.shift() ?? null;
  }
}
