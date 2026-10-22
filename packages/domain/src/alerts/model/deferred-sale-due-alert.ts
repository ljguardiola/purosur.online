import {
  type DeferredSaleStanding,
  deferredSaleAlertEscalatesAt,
  deferredSaleExpiresOn,
} from "../../fiscal/index.js";
import type { AlertConditionObservation } from "./alert-condition-observation.js";

interface DeferredSaleDue {
  id: string;
  saleId: string;
  registerId: string;
  locationId: string;
  occurredAt: Date;
  total: number;
  shortCode: string;
}

export function deferredSaleDueObservation(
  { id, saleId, registerId, locationId, occurredAt, total, shortCode }: DeferredSaleDue,
  standing: Extract<DeferredSaleStanding, { kind: "due" | "pressing" }>,
): AlertConditionObservation {
  return {
    holds: true,
    level: standing.kind === "pressing" ? "critical" : "warning",
    alert: {
      kind: "deferred_sale_due",
      scope: id,
      locationId,
      detail: {
        registerId,
        saleId,
        saleOccurredAt: occurredAt.toISOString(),
        total,
        shortCode,
        expiresOn: deferredSaleExpiresOn(occurredAt),
        escalatesAt: deferredSaleAlertEscalatesAt(occurredAt).toISOString(),
      },
    },
  };
}

export function deferredSaleNoLongerDueObservation(scope: string): AlertConditionObservation {
  return { holds: false, kind: "deferred_sale_due", scope };
}
