import type { RegisterIdentity } from "../../shared/index.js";

export interface CashCountAtClose {
  registerId: string;
  closedAt: Date;
  countedCash: number;
}

export interface RegisterCloses {
  registerIdentity(): RegisterIdentity | undefined;
  latestCloseOfEachRegister(): CashCountAtClose[];
}
