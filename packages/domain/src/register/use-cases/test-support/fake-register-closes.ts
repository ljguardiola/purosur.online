import type { RegisterIdentity } from "../../../shared/index.js";
import type { CashCountAtClose, RegisterCloses } from "../register-closes.js";

export class FakeRegisterCloses implements RegisterCloses {
  private readonly identity: RegisterIdentity | undefined;
  private readonly closes: CashCountAtClose[];

  constructor({
    identity,
    closes,
  }: {
    identity: RegisterIdentity | undefined;
    closes: CashCountAtClose[];
  }) {
    this.identity = identity;
    this.closes = closes;
  }

  registerIdentity(): RegisterIdentity | undefined {
    return this.identity;
  }

  latestCloses(): CashCountAtClose[] {
    return this.closes.map((close) => ({ ...close }));
  }
}
