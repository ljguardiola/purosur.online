import type { LocalStanding, OrphanRegularization } from "../../model/orphan-authorization.js";
import type { WsaaTokenSource } from "../fiscal-document-authorization-ports.js";
import type {
  AuthorizationNumber,
  OrphanRegularizationLane,
  OrphanRegularizationLanes,
} from "../orphan-authorization-ports.js";
import type { TaxAuthorityVoucherLookup, VoucherAnswer } from "../unclear-outcome-ports.js";
import type { WsaaToken } from "../wsaa-token-ports.js";

export class FakeOrphanRegularizationStore implements OrphanRegularizationLanes {
  readonly operations: string[] = [];
  readonly regularizations: OrphanRegularization[] = [];
  readonly standings = new Map<string, LocalStanding>();
  held = false;

  seedStanding({ pointOfSale, number }: AuthorizationNumber, standing: LocalStanding) {
    this.standings.set(`${pointOfSale}/${number}`, standing);
  }

  async inPointOfSaleLane<TOutcome>(
    _pointOfSale: number,
    work: (lane: OrphanRegularizationLane) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.operations.push("enterLane");
    this.held = true;
    try {
      return await work(new FakeOrphanRegularizationLane(this));
    } finally {
      this.held = false;
      this.operations.push("leaveLane");
    }
  }
}

class FakeOrphanRegularizationLane implements OrphanRegularizationLane {
  private readonly store: FakeOrphanRegularizationStore;

  constructor(store: FakeOrphanRegularizationStore) {
    this.store = store;
  }

  async localStandingOfAuthorization({
    pointOfSale,
    number,
  }: AuthorizationNumber): Promise<LocalStanding> {
    this.store.operations.push("localStandingOfAuthorization");
    return this.store.standings.get(`${pointOfSale}/${number}`) ?? { kind: "no_local_sale" };
  }

  async recordOrphanRegularization(regularization: OrphanRegularization): Promise<void> {
    this.store.operations.push("recordOrphanRegularization");
    this.store.regularizations.push(regularization);
  }
}

export class FakeOrphanRegularizationTokens implements WsaaTokenSource {
  private readonly store: FakeOrphanRegularizationStore;
  private readonly token: WsaaToken | null;

  constructor(store: FakeOrphanRegularizationStore, token: WsaaToken | null) {
    this.store = store;
    this.token = token;
  }

  async validToken(): Promise<WsaaToken | null> {
    this.store.operations.push("validToken");
    return this.token;
  }
}

export class FakeOrphanRegularizationVouchers implements TaxAuthorityVoucherLookup {
  readonly lookups: { pointOfSale: number; voucherType: number; number: number }[] = [];
  heldLane: boolean | undefined;
  private readonly store: FakeOrphanRegularizationStore;
  private readonly answer: VoucherAnswer;

  constructor(store: FakeOrphanRegularizationStore, answer: VoucherAnswer) {
    this.store = store;
    this.answer = answer;
  }

  async voucherAt({
    pointOfSale,
    voucherType,
    number,
  }: {
    pointOfSale: number;
    voucherType: number;
    number: number;
  }): Promise<VoucherAnswer> {
    this.store.operations.push("voucherAt");
    this.lookups.push({ pointOfSale, voucherType, number });
    this.heldLane = this.store.held;
    return this.answer;
  }
}
