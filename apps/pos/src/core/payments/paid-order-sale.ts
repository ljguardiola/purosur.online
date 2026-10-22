import type { PaidOrderSale } from "@purosur/domain/payments/use-cases";
import type { RestorationProtocolEvidence } from "@purosur/domain/register/use-cases";
import {
  type IdGenerator,
  settleApprovedMercadoPagoPayment,
} from "@purosur/domain/sales/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteSaleLedger } from "../sales/sqlite-sale-ledger";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";

export interface PaidOrderSaleDeps {
  database: LocalDatabase;
  outboxChainKey: string | undefined;
  restoration: RestorationProtocolEvidence;
  now: () => Date;
  ids: IdGenerator;
}

export function paidOrderSale({
  database,
  outboxChainKey,
  restoration,
  now,
  ids,
}: PaidOrderSaleDeps): PaidOrderSale {
  const ledger = new SqliteSaleLedger(database, new SqliteSignInStore(database), outboxChainKey);
  return {
    settleApprovedPayment: (payment) => {
      const settled = settleApprovedMercadoPagoPayment(
        { ledger, restoration, clock: { now }, ids },
        payment,
      );
      switch (settled.kind) {
        case "completed":
          return { kind: "completed", saleId: settled.saleId };
        case "partially_paid":
          return { kind: "partially_paid" };
        case "restoration_in_progress":
          throw new Error("the register is being restored, so the paid order stays unsettled");
        default:
          return { kind: "refused" };
      }
    },
  };
}
