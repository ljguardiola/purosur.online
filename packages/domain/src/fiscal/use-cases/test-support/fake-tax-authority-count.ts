import type {
  LastAuthorizedAnswer,
  LastAuthorizedCount,
  TaxAuthorityCounts,
  TaxAuthorityLastAuthorizedLookup,
} from "../tax-authority-count-ports.js";
import type { WsaaToken } from "../wsaa-token-ports.js";

export class FakeLastAuthorizedLookup implements TaxAuthorityLastAuthorizedLookup {
  readonly lookups: { token: WsaaToken; pointOfSale: number }[] = [];
  private readonly answer: LastAuthorizedAnswer;

  constructor(answer: LastAuthorizedAnswer) {
    this.answer = answer;
  }

  async lastAuthorized(lookup: { token: WsaaToken; pointOfSale: number }) {
    this.lookups.push(lookup);
    return this.answer;
  }
}

export class FakeTaxAuthorityCounts implements TaxAuthorityCounts {
  readonly recorded: LastAuthorizedCount[] = [];

  async record(count: LastAuthorizedCount): Promise<void> {
    this.recorded.push({ ...count, readAt: new Date(count.readAt) });
  }
}
