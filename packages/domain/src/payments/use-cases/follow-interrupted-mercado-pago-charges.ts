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

export interface FollowInterruptedMercadoPagoChargesInput {
  runStartedAt: Date;
}

export async function followInterruptedMercadoPagoCharges<Refusal, Settlement>(
  ports: MercadoPagoChargePorts<Refusal, Settlement>,
  { runStartedAt }: FollowInterruptedMercadoPagoChargesInput,
): Promise<FollowInterruptedMercadoPagoChargesOutcome<Settlement>> {
  const outcome: FollowInterruptedMercadoPagoChargesOutcome<Settlement> = {
    followed: [],
    failures: [],
  };
  for (const { paymentTransactionId, actorId } of ports.charges.pendingChargesRecordedBefore(
    runStartedAt,
  )) {
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
