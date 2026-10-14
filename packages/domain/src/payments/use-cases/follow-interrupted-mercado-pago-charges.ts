import {
  type FollowMercadoPagoChargeOutcome,
  followMercadoPagoCharge,
} from "./follow-mercado-pago-charge.js";
import type {
  InterruptedMercadoPagoCharge,
  MercadoPagoChargePorts,
} from "./mercado-pago-charge-ports.js";

export interface FollowedInterruptedMercadoPagoCharge<Settlement> {
  paymentTransactionId: string;
  outcome: FollowMercadoPagoChargeOutcome<Settlement>;
}

export interface FollowInterruptedMercadoPagoChargesOutcome<Settlement> {
  followed: FollowedInterruptedMercadoPagoCharge<Settlement>[];
  failures: { paymentTransactionId: string; error: unknown }[];
}

export interface FollowInterruptedMercadoPagoChargesInput {
  interrupted: readonly InterruptedMercadoPagoCharge[];
}

export async function followInterruptedMercadoPagoCharges<Refusal, Settlement>(
  ports: MercadoPagoChargePorts<Refusal, Settlement>,
  { interrupted }: FollowInterruptedMercadoPagoChargesInput,
): Promise<FollowInterruptedMercadoPagoChargesOutcome<Settlement>> {
  const outcome: FollowInterruptedMercadoPagoChargesOutcome<Settlement> = {
    followed: [],
    failures: [],
  };
  for (const { paymentTransactionId, actorId } of interrupted) {
    if (ports.charges.pendingCharge(paymentTransactionId) === null) {
      continue;
    }
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
