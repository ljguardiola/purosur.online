import type { RealTimeAuthorizationAnswer } from "../../model/real-time-authorization.js";
import { ShortCodeTaken } from "../deferred-sale-ports.js";
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
  readonly resolutionAttempts: RealTimeAuthorizationResolved[] = [];
  private readonly waiting: WaitingFiscalDocument | null;
  private readonly takenShortCodes: readonly string[];

  constructor(waiting: WaitingFiscalDocument | null, takenShortCodes: readonly string[] = []) {
    this.waiting = waiting;
    this.takenShortCodes = takenShortCodes;
  }

  async waitingDocumentOfSale(saleId: string): Promise<WaitingFiscalDocument | null> {
    return this.waiting?.saleId === saleId ? this.waiting : null;
  }

  async resolve(resolved: RealTimeAuthorizationResolved): Promise<void> {
    this.resolutionAttempts.push(resolved);
    if (
      resolved.deferredSale !== null &&
      this.takenShortCodes.includes(resolved.deferredSale.shortCode)
    ) {
      throw new ShortCodeTaken();
    }
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
