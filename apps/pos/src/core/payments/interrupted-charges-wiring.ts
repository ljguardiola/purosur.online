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

function takenLeftPending(
  chargesLeftPending: InterruptedChargesWiringDeps["charging"]["chargesLeftPending"],
  reportFailure: InterruptedChargesWiringDeps["reportFailure"],
) {
  try {
    return { taken: true, interrupted: chargesLeftPending?.() ?? [] } as const;
  } catch (error) {
    reportFailure("taking the Mercado Pago charges a stopped register left pending", error);
    return { taken: false, interrupted: [] } as const;
  }
}

export function createInterruptedChargesWiring({
  charging,
  printing,
  reportFailure,
}: InterruptedChargesWiringDeps): InterruptedChargesWiring {
  const { taken, interrupted } = takenLeftPending(charging.chargesLeftPending, reportFailure);
  const following = createInterruptedChargesFollow({
    follow: taken ? printing.afterEachCompletedSale(charging.followInterrupted) : undefined,
    interrupted,
    reportFailure,
  });
  return {
    followAtStartup: following.followNow,
    afterEachSync: () => {
      void following.followNow();
    },
  };
}
