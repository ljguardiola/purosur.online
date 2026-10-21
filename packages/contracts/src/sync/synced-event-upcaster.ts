import type {
  DiscountBenefit,
  ManualAdjustment,
  OfflineFiscalDocumentIssuedFact,
  SaleDiscount,
  SaleVoidCreditNote,
} from "@purosur/domain";
import type {
  DecodedEvent,
  EventUpcaster,
  SyncedFact,
  UnappliedEvent,
} from "@purosur/domain/sync/use-cases";
import {
  type SyncedEventPayloadKey,
  type SyncedEventPayloads,
  syncedEventPayloadKey,
  syncedEventPayloadSchema,
} from "./synced-event-payloads.js";

type CompletedSalePayload = SyncedEventPayloads[
  | "sale_completed@1"
  | "sale_completed@2"
  | "sale_completed@3"
  | "sale_completed@4"
  | "sale_completed@5"
  | "sale_completed@6"
  | "sale_completed@7"
  | "sale_completed@8"];
type SalePayment = SyncedEventPayloads["sale_completed@1" | "sale_completed@8"]["payments"][number];
type CancelledSalePayload = SyncedEventPayloads[
  | "sale_cancelled@1"
  | "sale_cancelled@2"
  | "sale_cancelled@3"
  | "sale_cancelled@4"
  | "sale_cancelled@5"
  | "sale_cancelled@6"
  | "sale_cancelled@7"];

type VoidedSalePayload = SyncedEventPayloads["sale_voided@1" | "sale_voided@2" | "sale_voided@3"];

type ManualAdjustmentPayload = NonNullable<
  SyncedEventPayloads["sale_completed@7"]["lines"][number]["manual_adjustment"]
>;

function manualAdjustment(adjustment: ManualAdjustmentPayload | null): ManualAdjustment | null {
  if (adjustment === null) {
    return null;
  }
  const { reason, authorized_by: authorizedBy } = adjustment;
  switch (adjustment.kind) {
    case "PRICE":
      return { kind: "PRICE", unitPrice: adjustment.value, reason, authorizedBy };
    case "PERCENT":
      return { kind: "PERCENT", percent: adjustment.value, reason, authorizedBy };
    case "AMOUNT":
      return { kind: "AMOUNT", amount: adjustment.value, reason, authorizedBy };
  }
}

type SaleDiscountPayload = NonNullable<SyncedEventPayloads["sale_completed@8"]["sale_discount"]>;

function saleDiscount(discount: SaleDiscountPayload): SaleDiscount {
  const { reason, authorized_by: authorizedBy } = discount;
  return discount.kind === "PERCENT"
    ? { kind: "PERCENT", percent: discount.value, reason, authorizedBy }
    : { kind: "AMOUNT", amount: discount.value, reason, authorizedBy };
}

type LinePromotionPayload = CompletedSalePayload["lines"][number]["promotions"][number];

function promotionBenefit(promotion: LinePromotionPayload): DiscountBenefit {
  return promotion.kind === "PERCENT_OFF"
    ? { kind: "PERCENT_OFF", percent: promotion.percent }
    : { kind: "BUY_N_PAY_M", buyQty: promotion.buy_qty, payQty: promotion.pay_qty };
}

function saleParts(payload: CompletedSalePayload | CancelledSalePayload | VoidedSalePayload) {
  const discount = "sale_discount" in payload ? payload.sale_discount : null;
  return {
    saleDiscount: discount === null ? null : saleDiscount(discount),
    saleDiscountAmount: discount === null ? 0 : discount.amount,
    lines: payload.lines.map((line) => ({
      id: line.id,
      productId: line.product_id,
      productName: line.product_name,
      quantity: line.quantity,
      listUnitPrice: line.list_unit_price,
      priceListId: line.price_list_id,
      promotionId: line.promotion_id,
      discountAmount: line.discount_amount,
      saleDiscountShare: "sale_discount_share" in line ? line.sale_discount_share : 0,
      promotions: line.promotions.map((promotion) => ({
        discountId: promotion.discount_id,
        benefit: promotionBenefit(promotion),
      })),
      weightSource: "weight_source" in line ? line.weight_source : null,
      manualAdjustment:
        "manual_adjustment" in line ? manualAdjustment(line.manual_adjustment) : null,
      lineTotal: line.line_total,
    })),
    cashMovements: payload.cash_movements.map((movement) => ({
      id: movement.id,
      type: movement.type,
      amount: movement.amount,
      actorId: movement.actor_id,
      occurredAt: new Date(movement.occurred_at),
    })),
  };
}

function salePayments(payments: readonly SalePayment[]) {
  return payments.map((payment) => ({
    id: payment.id,
    method: payment.method,
    provider: payment.provider,
    amount: payment.amount,
    tendered: payment.tendered,
    state: payment.state,
    occurredAt: new Date(payment.occurred_at),
    authorizedBy: payment.authorized_by ?? null,
    confirmedAt: payment.confirmed_at ? new Date(payment.confirmed_at) : null,
  }));
}

function saleRefunds(refunds: CancelledSalePayload["refunds"] | VoidedSalePayload["refunds"]) {
  return refunds.map((refund) => ({
    id: refund.id,
    paymentId: refund.parent_id,
    method: refund.method,
    provider: refund.provider,
    amount: refund.amount,
    state: refund.state,
    occurredAt: new Date(refund.occurred_at),
  }));
}

function cancelledSale(payload: CancelledSalePayload): SyncedFact {
  return {
    kind: "sale_cancelled",
    sale: {
      id: payload.id,
      sessionId: payload.session_id,
      actorId: payload.actor_id,
      authorizedBy: payload.authorized_by,
      cancelledAt: new Date(payload.occurred_at),
      total: payload.total,
      ...saleParts(payload),
      payments: salePayments(payload.payments),
      refunds: saleRefunds(payload.refunds),
    },
  };
}

function voidedSaleCreditNote(payload: VoidedSalePayload): SaleVoidCreditNote | null {
  const creditNote = "credit_note" in payload ? payload.credit_note : null;
  return creditNote === null
    ? null
    : {
        creditNoteId: creditNote.id,
        saleId: payload.id,
        total: creditNote.total,
        receiverTaxStatusCode: creditNote.receiver_tax_status_code,
        correctedVoucher: {
          voucherType: creditNote.corrects.voucher_type,
          pointOfSale: creditNote.corrects.point_of_sale,
          number: creditNote.corrects.number,
        },
      };
}

function voidedSale(payload: VoidedSalePayload): SyncedFact {
  return {
    kind: "sale_voided",
    creditNote: voidedSaleCreditNote(payload),
    sale: {
      id: payload.id,
      sessionId: payload.session_id,
      actorId: payload.actor_id,
      authorizedBy: payload.authorized_by,
      voidedAt: new Date(payload.occurred_at),
      total: payload.total,
      ...saleParts(payload),
      payments: salePayments(payload.payments),
      refunds: saleRefunds(payload.refunds),
      stockMovements: payload.stock_movements.map((movement) => ({
        id: movement.id,
        saleLineId: movement.sale_line_id,
        productId: movement.product_id,
        delta: movement.delta,
      })),
      deferredRecordCancelled: payload.deferred_record_cancelled,
    },
  };
}

function completedSale(
  payload: CompletedSalePayload,
  completedAt: string,
  payments: readonly SalePayment[],
  stockMovements:
    | readonly SyncedEventPayloads["sale_completed@3"]["stock_movements"][number][]
    | null,
  operationNumber: number | null,
): SyncedFact {
  return {
    kind: "sale_completed",
    sale: {
      id: payload.id,
      sessionId: payload.session_id,
      actorId: payload.actor_id,
      completedAt: new Date(completedAt),
      operationNumber,
      total: payload.total,
      ...saleParts(payload),
      payments: salePayments(payments),
      stockMovements:
        stockMovements === null
          ? null
          : stockMovements.map((movement) => ({
              id: movement.id,
              saleLineId: movement.sale_line_id,
              productId: movement.product_id,
              delta: movement.delta,
            })),
    },
  };
}

function offlineDocument(
  payload: SyncedEventPayloads["offline_fiscal_document_issued@1"],
): OfflineFiscalDocumentIssuedFact {
  return {
    fiscalDocumentId: payload.fiscal_document_id,
    saleId: payload.sale_id,
    registerId: payload.register_id,
    pointOfSale: payload.point_of_sale,
    documentType: payload.document_type,
    number: payload.number,
    issuedOn: payload.issued_on,
    generatedAt: new Date(payload.generated_at),
    generationStamp: payload.generation_stamp,
    offlineAuthorizationCode: payload.offline_authorization_code,
    fortnightStart: payload.fortnight_start,
    fortnightEnd: payload.fortnight_end,
    buyerDocumentType: payload.buyer_document_type,
    buyerDocumentNumber: payload.buyer_document_number,
    buyerTaxStatusCode: payload.buyer_tax_status_code,
    total: payload.total,
    netAmount: payload.net_amount,
    cause: payload.cause,
  };
}

const FACT_OF: {
  [Key in SyncedEventPayloadKey]: (
    payload: SyncedEventPayloads[Key],
    event: UnappliedEvent,
  ) => SyncedFact;
} = {
  "sale_completed@1": (payload) =>
    completedSale(payload, payload.completed_at, payload.payments, null, null),
  "sale_completed@2": (payload) =>
    completedSale(payload, payload.occurred_at, payload.payments, null, null),
  "sale_completed@3": (payload) =>
    completedSale(payload, payload.occurred_at, payload.payments, payload.stock_movements, null),
  "sale_completed@4": (payload) =>
    completedSale(
      payload,
      payload.occurred_at,
      payload.payments,
      payload.stock_movements,
      payload.operation_number,
    ),
  "sale_completed@5": (payload) =>
    completedSale(
      payload,
      payload.occurred_at,
      payload.payments,
      payload.stock_movements,
      payload.operation_number,
    ),
  "sale_completed@6": (payload) =>
    completedSale(
      payload,
      payload.occurred_at,
      payload.payments,
      payload.stock_movements,
      payload.operation_number,
    ),
  "sale_completed@7": (payload) =>
    completedSale(
      payload,
      payload.occurred_at,
      payload.payments,
      payload.stock_movements,
      payload.operation_number,
    ),
  "sale_completed@8": (payload) =>
    completedSale(
      payload,
      payload.occurred_at,
      payload.payments,
      payload.stock_movements,
      payload.operation_number,
    ),
  "sale_print_state_changed@1": (payload) => ({
    kind: "sale_print_state_changed",
    printState: {
      saleId: payload.sale_id,
      printAttemptedAt: new Date(payload.print_attempted_at),
      printedAt: payload.printed_at === null ? null : new Date(payload.printed_at),
    },
  }),
  "reprint_recorded@1": (payload, event) => ({
    kind: "reprint_recorded",
    reprint: {
      saleId: payload.sale_id,
      orderNumber: payload.order_number,
      requestedBy: payload.requested_by,
      authorizedBy: payload.authorized_by,
      reason:
        payload.reason_kind === "retry"
          ? { kind: "retry" }
          : { kind: "requested", text: payload.reason_text },
      occurredAt: event.occurredAt,
    },
  }),
  "sale_cancelled@1": cancelledSale,
  "sale_cancelled@2": cancelledSale,
  "sale_cancelled@3": cancelledSale,
  "sale_cancelled@4": cancelledSale,
  "sale_cancelled@5": cancelledSale,
  "sale_cancelled@6": cancelledSale,
  "sale_cancelled@7": cancelledSale,
  "sale_voided@1": voidedSale,
  "sale_voided@2": voidedSale,
  "sale_voided@3": voidedSale,
  "cash_session_opened@1": (payload, event) => ({
    kind: "cash_session_opened",
    session: {
      id: event.aggregateId,
      openedBy: payload.opened_by,
      openedAt: new Date(payload.opened_at),
      openingFloat: payload.opening_float,
    },
  }),
  "cash_session_closed@1": (payload, event) => ({
    kind: "cash_session_closed",
    session: {
      id: event.aggregateId,
      closedBy: payload.closed_by,
      closedAt: new Date(payload.closed_at),
      expectedCash: payload.expected_cash,
      countedCash: payload.counted_cash,
      difference: payload.difference,
    },
  }),
  "cash_movement_recorded@1": (payload, event) => ({
    kind: "cash_movement_recorded",
    movement: {
      sessionId: event.aggregateId,
      type: payload.type,
      amount: payload.amount,
      reason: payload.reason,
      refType: payload.ref_type,
      refId: payload.ref_id,
      actorId: payload.actor_id,
      authorizedBy: payload.authorized_by,
      occurredAt: new Date(payload.occurred_at),
    },
  }),
  "qr_payment_replaced@1": (payload) => ({
    kind: "qr_payment_replaced",
    replacement: { paymentTransactionId: payload.payment_transaction_id, saleId: payload.sale_id },
  }),
  "opening_count_recorded@1": (payload, event) => ({
    kind: "opening_count_recorded",
    count: {
      movementId: payload.movement_id,
      productId: payload.product_id,
      counted: payload.counted,
      expiresOn: payload.expires_on,
      countedAt: event.occurredAt,
      actorId: event.actorId,
    },
  }),
  "opening_count_withdrawn@1": (payload, event) => ({
    kind: "opening_count_withdrawn",
    withdrawal: {
      movementId: payload.movement_id,
      withdrawnMovementId: payload.withdrawn_movement_id,
      withdrawnAt: event.occurredAt,
      actorId: event.actorId,
    },
  }),
  "fiscal_gate_failed@1": (payload) => ({
    kind: "fiscal_gate_failed",
    gateFailure: {
      saleId: payload.sale_id,
      reason: payload.reason,
      evaluatedAt: new Date(payload.evaluated_at),
    },
  }),
  "clock_corrected@1": (payload, event) => ({
    kind: "clock_corrected",
    correction: {
      registerId: event.aggregateId,
      pointOfSale: payload.point_of_sale,
      documentType: payload.document_type,
      previousReading: new Date(payload.previous_reading),
      correctedReading: new Date(payload.corrected_reading),
      actorId: event.actorId,
    },
  }),
  "offline_fiscal_document_issued@1": (payload) => ({
    kind: "offline_fiscal_document_issued",
    document: offlineDocument(payload),
  }),
  "offline_fiscal_document_issued@2": (payload) => ({
    kind: "offline_fiscal_document_issued",
    document: {
      ...offlineDocument(payload),
      invoice: {
        invoiceClass: payload.document.invoice_class,
        total: payload.document.total,
        netAmount: payload.document.net_amount,
        vatAmount: payload.document.vat_amount,
        issuer: {
          legalName: payload.document.issuer.legal_name,
          cuit: payload.document.issuer.cuit,
          taxStatus: payload.document.issuer.tax_status,
          grossIncomeRegistration: payload.document.issuer.gross_income_registration,
          activityStartDate: payload.document.issuer.activity_start_date,
          version: payload.document.issuer.version,
        },
        buyerTaxStatusCode: payload.document.buyer_tax_status_code,
        buyerTaxStatusDescription: payload.document.buyer_tax_status_description,
      },
    },
  }),
};

function decodeAs<Key extends SyncedEventPayloadKey>(
  key: Key,
  event: UnappliedEvent,
): DecodedEvent {
  const parsed = syncedEventPayloadSchema(key).safeParse(event.payload);
  if (!parsed.success) {
    const reason = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    return { kind: "unreadable", reason };
  }
  return { kind: "fact", fact: FACT_OF[key](parsed.data, event) };
}

export const syncedEventUpcaster: EventUpcaster = {
  decode(event) {
    const key = syncedEventPayloadKey(event.eventType, event.schemaVersion);
    if (key === undefined) {
      return {
        kind: "unreadable",
        reason: `no schema reads ${event.eventType} version ${event.schemaVersion}`,
      };
    }
    return decodeAs(key, event);
  },
};
