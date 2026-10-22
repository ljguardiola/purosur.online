import type {
  AwaitedOrphanSweep,
  OrphanSweepAnswer,
  OrphanSweepRequester,
} from "../regularize-restored-orphan-authorizations-ports.js";

export class FakeOrphanSweepRequester implements OrphanSweepRequester<string> {
  asks = 0;
  private readonly answer: OrphanSweepAnswer<string>;

  constructor(answer: OrphanSweepAnswer<string> = { kind: "swept" }) {
    this.answer = answer;
  }

  async requestSweep(): Promise<OrphanSweepAnswer<string>> {
    this.asks += 1;
    return this.answer;
  }
}

export class FakeAwaitedOrphanSweep implements AwaitedOrphanSweep {
  cleared = 0;

  async clear(): Promise<void> {
    this.cleared += 1;
  }
}
