import type { RoleAccess } from "../../../permissions/index.js";
import type {
  OperationAuthority,
  OperationAuthorization,
  OutboxEventDraft,
} from "../../../shared/index.js";
import type {
  CashSessionStanding,
  ClockLowering,
  ClockMark,
} from "../../model/clock-correction.js";
import type {
  ClockCorrectionLedger,
  ClockCorrectionRecord,
  ClockCorrectionTransaction,
} from "../clock-correction-ports.js";

export interface FakeClockCorrectionState {
  accesses: Record<string, RoleAccess>;
  registerId: string | undefined;
  standing: CashSessionStanding;
  marks: ClockMark[];
  records: ClockCorrectionRecord[];
  outbox: OutboxEventDraft[];
}

export class FakeClockCorrectionLedger implements ClockCorrectionLedger {
  transactions = 0;
  readonly state: FakeClockCorrectionState;

  constructor(state: Partial<FakeClockCorrectionState> = {}) {
    this.state = {
      accesses: {},
      registerId: "register-1",
      standing: { openSessionId: null, lastClosedSessionId: null },
      marks: [],
      records: [],
      outbox: [],
      ...state,
    };
  }

  transaction<TOutcome>(work: (tx: ClockCorrectionTransaction) => TOutcome): TOutcome {
    this.transactions += 1;
    const state = this.state;
    return work({
      correctorAccess: (userId) => state.accesses[userId],
      registerId: () => state.registerId,
      cashSessionStanding: () => state.standing,
      clockMarks: () => state.marks.map((mark) => ({ ...mark })),
      clockCorrectionRecordedIn: (period) =>
        state.records.some((record) => record.period === period),
      lowerClockMark: ({ pointOfSale, documentType, correctedReading }: ClockLowering) => {
        for (const mark of state.marks) {
          if (mark.pointOfSale === pointOfSale && mark.documentType === documentType) {
            mark.reading = correctedReading;
          }
        }
      },
      recordClockCorrection: (record) => {
        state.records.push(record);
      },
      appendOutboxEvent: (event) => {
        state.outbox.push(event);
      },
    });
  }
}

export class FakeClockCorrectionAuthority<Grant, Refusal>
  implements OperationAuthority<Grant, Refusal>
{
  private readonly answer: OperationAuthorization<Grant, Refusal>;

  constructor(answer: OperationAuthorization<Grant, Refusal>) {
    this.answer = answer;
  }

  async authorize(): Promise<OperationAuthorization<Grant, Refusal>> {
    return this.answer;
  }
}
