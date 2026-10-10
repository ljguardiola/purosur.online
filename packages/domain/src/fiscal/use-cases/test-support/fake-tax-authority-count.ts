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
  readonly stored: LastAuthorizedCount[];

  constructor(stored: LastAuthorizedCount[] = []) {
    this.stored = stored.map((count) => ({ ...count, readAt: new Date(count.readAt) }));
  }

  async advance(count: LastAuthorizedCount): Promise<void> {
    const index = this.stored.findIndex((held) => held.pointOfSale === count.pointOfSale);
    const held = this.stored[index];
    const advanced = {
      ...count,
      lastAuthorized: Math.max(held?.lastAuthorized ?? count.lastAuthorized, count.lastAuthorized),
      readAt: new Date(count.readAt),
    };
    if (held === undefined) {
      this.stored.push(advanced);
    } else {
      this.stored[index] = advanced;
    }
  }
}
