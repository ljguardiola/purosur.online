import type {
  ClockPreviousReadingSource,
  CreditNoteToIssue,
  DiscountBenefit,
  FacturaC,
  ManualAdjustment,
  OfflineFiscalDocumentIssuedFact,
  PrintedDocument,
  SaleDiscount,
  UnclearDeferralDocument,
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
  | "sale_completed@8"
  | "sale_completed@9"];
type SalePayment = SyncedEventPayloads[
  | "sale_completed@1"
  | "sale_completed@8"
  | "sale_completed@9"]["payments"][number];
type CancelledSalePayload = SyncedEventPayloads[
  | "sale_cancelled@1"
  | "sale_cancelled@2"
  | "sale_cancelled@3"
  | "sale_cancelled@4"
  | "sale_cancelled@5"
  | "sale_cancelled@6"
  | "sale_cancelled@7"
  | "sale_cancelled@8"
  | "sale_cancelled@9"];

type VoidedSalePayload = SyncedEventPayloads[
  | "sale_voided@1"
  | "sale_voided@2"
  | "sale_voided@3"
  | "sale_voided@4"];

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
    cardType: "card_type" in payment ? payment.card_type : null,
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

function clockCorrection(
  payload: SyncedEventPayloads["clock_corrected@1"],
  previousReadingSource: ClockPreviousReadingSource,
  event: UnappliedEvent,
): SyncedFact {
  return {
    kind: "clock_corrected",
    correction: {
      registerId: event.aggregateId,
      pointOfSale: payload.point_of_sale,
      documentType: payload.document_type,
      previousReading: new Date(payload.previous_reading),
      previousReadingSource,
      correctedReading: new Date(payload.corrected_reading),
      actorId: event.actorId,
    },
  };
}

function voidedSaleCreditNote(payload: VoidedSalePayload): CreditNoteToIssue | null {
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
        origin: { kind: "sale_void" },
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

type ReturnedSalePayload = SyncedEventPayloads[
  | "sale_returned@1"
  | "sale_returned@2"
  | "sale_returned@3"];

function returnedSaleCreditNote(payload: ReturnedSalePayload): CreditNoteToIssue | null {
  const creditNote = "credit_note" in payload ? payload.credit_note : null;
  if (creditNote === null) {
    return null;
  }
  const origin = {
    kind: "sale_return",
    returnId: payload.id,
    issuedOn: creditNote.issued_on,
  } as const;
  const asked = {
    creditNoteId: creditNote.id,
    saleId: payload.sale_id,
    total: creditNote.total,
    origin,
  };
  return creditNote.corrects === null
    ? { ...asked, receiverTaxStatusCode: null, correctedVoucher: null }
    : {
        ...asked,
        receiverTaxStatusCode: creditNote.receiver_tax_status_code,
        correctedVoucher: {
          voucherType: creditNote.corrects.voucher_type,
          pointOfSale: creditNote.corrects.point_of_sale,
          number: creditNote.corrects.number,
        },
      };
}

function returnedSale(payload: ReturnedSalePayload): SyncedFact {
  return {
    kind: "sale_returned",
    creditNote: returnedSaleCreditNote(payload),
    saleReturn: {
      id: payload.id,
      saleId: payload.sale_id,
      sessionId: payload.session_id,
      actorId: payload.actor_id,
      authorizedBy: payload.authorized_by,
      ticketSource: payload.ticket_source,
      occurredAt: new Date(payload.occurred_at),
      lines: payload.lines.map((line) => ({
        saleLineId: line.sale_line_id,
        productId: line.product_id,
        quantity: line.quantity,
        reason: line.reason,
        disposition: line.disposition,
        refundedAmount: line.refunded_amount,
      })),
      refunds: payload.refunds.map((refund) => ({
        id: refund.id,
        paymentId: refund.parent_id,
        method: refund.method,
        provider: refund.provider,
        amount: refund.amount,
        state: refund.state,
        occurredAt: new Date(refund.occurred_at),
      })),
      cashMovements: payload.cash_movements.map((movement) => ({
        id: movement.id,
        type: movement.type,
        amount: movement.amount,
        actorId: movement.actor_id,
        occurredAt: new Date(movement.occurred_at),
      })),
      stockMovements: payload.stock_movements.map((movement) => ({
        id: movement.id,
        saleLineId: movement.sale_line_id,
        productId: movement.product_id,
        kind: movement.kind,
        reason: movement.reason,
        delta: movement.delta,
      })),
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
  payload: SyncedEventPayloads[
    | "offline_fiscal_document_issued@1"
    | "offline_fiscal_document_issued@3"],
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

function invoiceOf(
  document: SyncedEventPayloads["offline_fiscal_document_issued@2"]["document"],
): FacturaC {
  return {
    invoiceClass: document.invoice_class,
    total: document.total,
    netAmount: document.net_amount,
    vatAmount: document.vat_amount,
    issuer: {
      legalName: document.issuer.legal_name,
      cuit: document.issuer.cuit,
      taxStatus: document.issuer.tax_status,
      grossIncomeRegistration: document.issuer.gross_income_registration,
      activityStartDate: document.issuer.activity_start_date,
      version: document.issuer.version,
    },
    buyerTaxStatusCode: document.buyer_tax_status_code,
    buyerTaxStatusDescription: document.buyer_tax_status_description,
  };
}

function deferredSaleRecorded(
  payload: SyncedEventPayloads["deferred_sale_recorded@1"],
  unclearDocument: UnclearDeferralDocument | null,
): SyncedFact {
  return {
    kind: "deferred_sale_recorded",
    deferredSale: {
      id: payload.id,
      saleId: payload.sale_id,
      occurredAt: new Date(payload.occurred_at),
      total: payload.total,
      reason: payload.reason,
      shortCode: payload.short_code,
      routedAt: new Date(payload.routed_at),
    },
    unclearDocument,
  };
}

type PrintStatePayload = SyncedEventPayloads[
  | "sale_print_state_changed@1"
  | "sale_print_state_changed@2"
  | "sale_print_state_changed@3"];

function printStateChanged(
  payload: PrintStatePayload,
  document: PrintedDocument,
  creditNoteId: string | null,
): SyncedFact {
  const printTimes = {
    printAttemptedAt: new Date(payload.print_attempted_at),
    printedAt: payload.printed_at === null ? null : new Date(payload.printed_at),
  };
  return {
    kind: "sale_print_state_changed",
    printState:
      document === "credit_note"
        ? { saleId: payload.sale_id, document, creditNoteId, ...printTimes }
        : { saleId: payload.sale_id, document, ...printTimes },
  };
}

function reprintRecorded(
  payload: SyncedEventPayloads["reprint_recorded@1"],
  document: PrintedDocument,
  creditNoteId: string | null,
  event: UnappliedEvent,
): SyncedFact {
  const copy = {
    saleId: payload.sale_id,
    orderNumber: payload.order_number,
    requestedBy: payload.requested_by,
    authorizedBy: payload.authorized_by,
    reason:
      payload.reason_kind === "retry"
        ? ({ kind: "retry" } as const)
        : ({ kind: "requested", text: payload.reason_text } as const),
    occurredAt: event.occurredAt,
  };
  return {
    kind: "reprint_recorded",
    reprint:
      document === "credit_note" ? { document, creditNoteId, ...copy } : { document, ...copy },
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
  "sale_completed@9": (payload) =>
    completedSale(
      payload,
      payload.occurred_at,
      payload.payments,
      payload.stock_movements,
      payload.operation_number,
    ),
  "sale_print_state_changed@1": (payload) => printStateChanged(payload, "sale_receipt", null),
  "sale_print_state_changed@2": (payload) => printStateChanged(payload, payload.document, null),
  "sale_print_state_changed@3": (payload) =>
    printStateChanged(
      payload,
      payload.document,
      payload.document === "credit_note" ? payload.credit_note_id : null,
    ),
  "reprint_recorded@1": (payload, event) => reprintRecorded(payload, "sale_receipt", null, event),
  "reprint_recorded@2": (payload, event) => reprintRecorded(payload, payload.document, null, event),
  "reprint_recorded@3": (payload, event) =>
    reprintRecorded(
      payload,
      payload.document,
      payload.document === "credit_note" ? payload.credit_note_id : null,
      event,
    ),
  "sale_cancelled@1": cancelledSale,
  "sale_cancelled@2": cancelledSale,
  "sale_cancelled@3": cancelledSale,
  "sale_cancelled@4": cancelledSale,
  "sale_cancelled@5": cancelledSale,
  "sale_cancelled@6": cancelledSale,
  "sale_cancelled@7": cancelledSale,
  "sale_cancelled@8": cancelledSale,
  "sale_cancelled@9": cancelledSale,
  "sale_line_removed@1": (payload) => ({
    kind: "sale_line_removed",
    removal: {
      saleId: payload.sale_id,
      sessionId: payload.session_id,
      actorId: payload.actor_id,
      removedAt: new Date(payload.occurred_at),
      line: {
        id: payload.line.id,
        productId: payload.line.product_id,
        productName: payload.line.product_name,
        quantity: payload.line.quantity,
        weightSource: payload.line.weight_source,
        lineTotal: payload.line.line_total,
      },
    },
  }),
  "sale_voided@1": voidedSale,
  "sale_voided@2": voidedSale,
  "sale_voided@3": voidedSale,
  "sale_voided@4": voidedSale,
  "sale_returned@1": returnedSale,
  "sale_returned@2": returnedSale,
  "sale_returned@3": returnedSale,
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
  "deferred_sale_recorded@1": (payload) => deferredSaleRecorded(payload, null),
  "deferred_sale_recorded@2": (payload) =>
    deferredSaleRecorded(
      payload,
      payload.unclear_document && {
        fiscalDocumentId: payload.unclear_document.fiscal_document_id,
        pointOfSale: payload.unclear_document.point_of_sale,
        number: payload.unclear_document.number,
        issuedOn: payload.unclear_document.issued_on,
        document: invoiceOf(payload.unclear_document.document),
        reservedAt: new Date(payload.unclear_document.reserved_at),
      },
    ),
  "deferred_sale_satisfied@1": (payload) => ({
    kind: "deferred_sale_satisfied",
    satisfaction: {
      id: payload.id,
      saleId: payload.sale_id,
      fiscalDocumentId: payload.fiscal_document_id,
      pointOfSale: payload.point_of_sale,
      number: payload.number,
      issuedOn: payload.issued_on,
      document: invoiceOf(payload.document),
      authorizationCode: payload.authorization_code,
      authorizationCodeDueOn: payload.authorization_code_due_on,
      reservedAt: new Date(payload.reserved_at),
      satisfiedAt: new Date(payload.satisfied_at),
    },
  }),
  "clock_corrected@1": (payload, event) => clockCorrection(payload, "clock_mark", event),
  "clock_corrected@2": (payload, event) =>
    clockCorrection(payload, payload.previous_reading_source, event),
  "offline_fiscal_document_issued@1": (payload) => ({
    kind: "offline_fiscal_document_issued",
    document: offlineDocument(payload),
  }),
  "offline_fiscal_document_issued@2": (payload) => ({
    kind: "offline_fiscal_document_issued",
    document: {
      ...offlineDocument(payload),
      invoice: invoiceOf(payload.document),
    },
  }),
  "offline_fiscal_document_issued@3": (payload) => ({
    kind: "offline_fiscal_document_issued",
    document: {
      ...offlineDocument(payload),
      creditNoteId: payload.credit_note_id,
      corrects: {
        voucherType: payload.corrects.voucher_type,
        pointOfSale: payload.corrects.point_of_sale,
        number: payload.corrects.number,
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
