import {
  type FollowMercadoPagoChargeOutcome,
  followMercadoPagoCharge,
} from "./follow-mercado-pago-charge.js";
import type { MercadoPagoChargePorts } from "./mercado-pago-charge-ports.js";

export interface FollowedInterruptedMercadoPagoCharge<Settlement> {
  paymentTransactionId: string;
  outcome: FollowMercadoPagoChargeOutcome<Settlement>;
}

export interface FollowInterruptedMercadoPagoChargesOutcome<Settlement> {
  followed: FollowedInterruptedMercadoPagoCharge<Settlement>[];
  failures: { paymentTransactionId: string; error: unknown }[];
}

export async function followInterruptedMercadoPagoCharges<Refusal, Settlement>(
  ports: MercadoPagoChargePorts<Refusal, Settlement>,
): Promise<FollowInterruptedMercadoPagoChargesOutcome<Settlement>> {
  const outcome: FollowInterruptedMercadoPagoChargesOutcome<Settlement> = {
    followed: [],
    failures: [],
  };
  for (const { paymentTransactionId, actorId } of ports.charges.pendingCharges()) {
    try {
      outcome.followed.push({
        paymentTransactionId,
        outcome: await followMercadoPagoCharge(ports, { actorId, paymentTransactionId }),
      });
    } catch (error) {
      outcome.failures.push({ paymentTransactionId, error });
    }
  }
  return outcome;
}
