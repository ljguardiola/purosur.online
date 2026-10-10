import type { Fortnight } from "../../model/offline-authorization-code.js";
import type {
  KeptOfflineAuthorizationCode,
  OfflineAuthorizationCodeAcquisition,
  OfflineAuthorizationCodeLookupAnswer,
  OfflineAuthorizationCodeRequestAnswer,
  OfflineAuthorizationCodeStore,
  TaxAuthorityOfflineAuthorizationCodes,
} from "../offline-authorization-code-ports.js";
import type { WsaaToken } from "../wsaa-token-ports.js";

export type OfflineAuthorizationCodeOperation =
  | `hold ${string}`
  | `release ${string}`
  | `isHeld ${string}`
  | `keep ${string}`
  | `request ${string}`
  | `lookUp ${string}`;

class FakeAcquisition implements OfflineAuthorizationCodeAcquisition {
  private readonly store: FakeOfflineAuthorizationCodeStore;
  private readonly fortnight: Fortnight;

  constructor(store: FakeOfflineAuthorizationCodeStore, fortnight: Fortnight) {
    this.store = store;
    this.fortnight = fortnight;
  }

  async isHeld(): Promise<boolean> {
    this.store.operations.push(`isHeld ${this.fortnight.start}`);
    return this.store.kept.some((kept) => kept.code.fortnight.start === this.fortnight.start);
  }

  async keep(kept: KeptOfflineAuthorizationCode): Promise<void> {
    this.store.operations.push(`keep ${this.fortnight.start}`);
    if (this.store.failingKeep) {
      throw new Error("keep failed");
    }
    this.store.kept.push({
      ...kept,
      code: { ...kept.code, fortnight: { ...kept.code.fortnight } },
      obtainedAt: new Date(kept.obtainedAt),
    });
  }
}

export class FakeOfflineAuthorizationCodeStore implements OfflineAuthorizationCodeStore {
  kept: KeptOfflineAuthorizationCode[] = [];
  operations: OfflineAuthorizationCodeOperation[] = [];
  offlinePointOfSaleConfigured = true;
  failingKeep = false;
  readonly heldFortnights = new Set<string>();

  async hasOfflinePointOfSale(): Promise<boolean> {
    return this.offlinePointOfSaleConfigured;
  }

  async holdAcquisition<TOutcome>(
    fortnight: Fortnight,
    work: (acquisition: OfflineAuthorizationCodeAcquisition) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.operations.push(`hold ${fortnight.start}`);
    this.heldFortnights.add(fortnight.start);
    try {
      return await work(new FakeAcquisition(this, fortnight));
    } finally {
      this.heldFortnights.delete(fortnight.start);
      this.operations.push(`release ${fortnight.start}`);
    }
  }
}

export interface TaxAuthorityCall {
  token: WsaaToken;
  fortnight: Fortnight;
  heldDuringCall: boolean;
}

export class FakeTaxAuthorityOfflineAuthorizationCodes
  implements TaxAuthorityOfflineAuthorizationCodes
{
  readonly requests: TaxAuthorityCall[] = [];
  readonly lookUps: TaxAuthorityCall[] = [];
  requestAnswer: (fortnight: Fortnight) => OfflineAuthorizationCodeRequestAnswer = () => ({
    kind: "no_answer",
  });
  lookUpAnswer: (fortnight: Fortnight) => OfflineAuthorizationCodeLookupAnswer = () => ({
    kind: "no_answer",
  });
  private readonly store: FakeOfflineAuthorizationCodeStore;

  constructor(store: FakeOfflineAuthorizationCodeStore) {
    this.store = store;
  }

  async request({ token, fortnight }: { token: WsaaToken; fortnight: Fortnight }) {
    this.store.operations.push(`request ${fortnight.start}`);
    this.requests.push({
      token,
      fortnight,
      heldDuringCall: this.store.heldFortnights.has(fortnight.start),
    });
    return this.requestAnswer(fortnight);
  }

  async lookUp({ token, fortnight }: { token: WsaaToken; fortnight: Fortnight }) {
    this.store.operations.push(`lookUp ${fortnight.start}`);
    this.lookUps.push({
      token,
      fortnight,
      heldDuringCall: this.store.heldFortnights.has(fortnight.start),
    });
    return this.lookUpAnswer(fortnight);
  }
}
