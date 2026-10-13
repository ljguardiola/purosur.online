import type { ReceiptPrinting } from "../sales/receipt-printing-wiring";
import { createInterruptedChargesFollow } from "./interrupted-charges-follow";
import type { MercadoPagoCharging } from "./mercado-pago-charge-wiring";

export interface InterruptedChargesWiringDeps {
  charging: Pick<MercadoPagoCharging, "chargesLeftPending" | "followInterrupted">;
  printing: Pick<ReceiptPrinting, "afterEachCompletedSale">;
  reportFailure: (activity: string, error: unknown) => void;
}

export interface InterruptedChargesWiring {
  followAtStartup(): Promise<void>;
  afterEachSync(): void;
}

export function createInterruptedChargesWiring({
  charging,
  printing,
  reportFailure,
}: InterruptedChargesWiringDeps): InterruptedChargesWiring {
  const following = createInterruptedChargesFollow({
    follow: printing.afterEachCompletedSale(charging.followInterrupted),
    interrupted: charging.chargesLeftPending?.() ?? [],
    reportFailure,
  });
  return {
    followAtStartup: following.followNow,
    afterEachSync: () => {
      void following.followNow();
    },
  };
}
