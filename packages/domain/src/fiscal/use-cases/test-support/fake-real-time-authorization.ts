import type { RealTimeAuthorizationAnswer } from "../../model/real-time-authorization.js";
import type {
  RealTimeAuthorizationCall,
  RealTimeAuthorizationResolved,
  RealTimeFiscalDocuments,
  RealTimeTaxAuthority,
  RoundTripSamples,
  WaitingFiscalDocument,
} from "../real-time-authorization-ports.js";

export class FakeRealTimeFiscalDocuments implements RealTimeFiscalDocuments {
  readonly resolutions: RealTimeAuthorizationResolved[] = [];
  private readonly waiting: WaitingFiscalDocument | null;

  constructor(waiting: WaitingFiscalDocument | null) {
    this.waiting = waiting;
  }

  async waitingDocumentOfSale(saleId: string): Promise<WaitingFiscalDocument | null> {
    return this.waiting?.saleId === saleId ? this.waiting : null;
  }

  async resolve(resolved: RealTimeAuthorizationResolved): Promise<void> {
    this.resolutions.push(resolved);
  }
}

export class FakeRoundTripSamples implements RoundTripSamples {
  reads = 0;
  private readonly samples: readonly number[];

  constructor(samples: readonly number[]) {
    this.samples = samples;
  }

  async recent(): Promise<readonly number[]> {
    this.reads += 1;
    return this.samples;
  }
}

export class FakeRealTimeTaxAuthority implements RealTimeTaxAuthority {
  readonly calls: RealTimeAuthorizationCall[] = [];
  private readonly answer: RealTimeAuthorizationAnswer;
  private readonly whileAnswering: () => void;

  constructor(answer: RealTimeAuthorizationAnswer, whileAnswering: () => void = () => {}) {
    this.answer = answer;
    this.whileAnswering = whileAnswering;
  }

  async authorize(call: RealTimeAuthorizationCall): Promise<RealTimeAuthorizationAnswer> {
    this.calls.push(call);
    this.whileAnswering();
    return this.answer;
  }
}
