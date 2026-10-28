import type {
  RefundAllocationRefusalBody,
  ReturnLineRefusalBody,
  FindSaleForReturnOutcome as WireFindSaleForReturnOutcome,
  PreviewReturnOutcome as WirePreviewReturnOutcome,
} from "@purosur/contracts";
import type {
  RefundAllocationRefusal,
  ReturnLineAssessment,
  ReturnLineRefusal,
  ZoneRules,
} from "@purosur/domain";
import type { SaleForReturnView } from "@purosur/domain/returns/use-cases";
import { inArgentinaTime } from "../platform/argentina-time";

type WireSale = Extract<WireFindSaleForReturnOutcome, { kind: "found" }>["sale"];

export function toWireLineRefusal(refusal: ReturnLineRefusal): ReturnLineRefusalBody {
  return refusal.kind === "outside_window"
    ? { kind: "outside_window", reason: refusal.reason, last_allowed_day: refusal.lastAllowedDay }
    : refusal;
}

export function toWireRefundRefusal(refusal: RefundAllocationRefusal): RefundAllocationRefusalBody {
  switch (refusal.kind) {
    case "unknown_payment":
    case "invalid_amount":
    case "not_cash":
      return { kind: refusal.kind, payment_id: refusal.paymentId };
    case "exceeds_payment":
      return {
        kind: "exceeds_payment",
        payment_id: refusal.paymentId,
        remaining: refusal.remaining,
      };
    case "total_mismatch":
      return {
        kind: "total_mismatch",
        refundable_total: refusal.refundableTotal,
        imputed: refusal.imputed,
      };
  }
}

function toWireWindow({ lastAllowedDay, open }: { lastAllowedDay: string; open: boolean }) {
  return { last_allowed_day: lastAllowedDay, open };
}

export function toWireSaleForReturn(sale: SaleForReturnView, rules: ZoneRules): WireSale {
  return {
    sale_id: sale.saleId,
    occurred_at: inArgentinaTime(sale.occurredAt, rules),
    total: sale.total,
    invoice:
      sale.invoice === null
        ? null
        : { point_of_sale: sale.invoice.pointOfSale, number: sale.invoice.number },
    windows: {
      change_of_mind: toWireWindow(sale.windows.change_of_mind),
      defective: toWireWindow(sale.windows.defective),
    },
    lines: sale.lines.map((line) => ({
      id: line.id,
      product_id: line.productId,
      product_name: line.productName,
      sale_unit: line.saleUnit,
      sold_quantity: line.soldQuantity,
      returned_quantity: line.returnedQuantity,
      returnable_quantity: line.returnableQuantity,
      charged_amount: line.chargedAmount,
      refunded_amount: line.refundedAmount,
      must_be_returned_whole: line.mustBeReturnedWhole,
    })),
    payments: sale.payments.map((payment) => ({
      payment_id: payment.paymentId,
      method: payment.method,
      card_type: payment.cardType,
      amount: payment.amount,
      refunded_amount: payment.refundedAmount,
      remaining: payment.remaining,
      eligible: payment.eligible,
      ineligible_reason: payment.ineligibleReason,
    })),
  };
}

export function toWirePreviewedLines(
  lines: readonly ReturnLineAssessment[],
): Extract<WirePreviewReturnOutcome, { kind: "previewed" }>["lines"] {
  return lines.map((line) => ({
    sale_line_id: line.saleLineId,
    quantity: line.quantity,
    reason: line.reason,
    disposition: line.disposition,
    refusal: line.refusal === null ? null : toWireLineRefusal(line.refusal),
    refund_amount: line.refundAmount,
  }));
}
