import type {
  Authorization,
  ReceiptCopyShown,
  ReprintSaleReceiptOutcome,
  SaleCreditNote,
  SignInUser,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey, PrintedDocument } from "@purosur/domain";
import { useRequestForm } from "@purosur/ui";
import { useState } from "react";
import {
  EMPTY_REPRINT_RECEIPT_FORM,
  invalidReasonMessage,
  reprintReceiptFormRequestSchema,
  reprintReceiptRequestFrom,
} from "./reprint-receipt-form";
import type { NextReceiptCopy, SaleDetail } from "./sale-receipt-text";
import { useAuthorization } from "./use-authorization";

const FAILED_MESSAGE = "No se pudo reimprimir. Probá de nuevo.";
const BUSY_MESSAGES: Record<PrintedDocument, string> = {
  sale_receipt:
    "Todavía puede salir una impresión de esta venta. Esperá a que termine antes de reimprimir.",
  credit_note:
    "Todavía puede salir una impresión de la nota de crédito. Esperá a que termine antes de reimprimir.",
  deferred_invoice:
    "Todavía puede salir una impresión de la factura. Esperá a que termine antes de reimprimir.",
};
const PRINTER_NOT_CONFIGURED_MESSAGE = "La impresora no está configurada.";
const SALE_VOIDED_MESSAGE = "La venta está anulada: no se reimprime su ticket.";
const ORIGINAL_NOT_PRINTED_MESSAGE =
  "La factura todavía no se imprimió como original: no se reimprime.";
const REQUIRED_REASON_MESSAGE = "Escribí el motivo de la reimpresión.";

export const REPRINT_AUTHORIZING = "reimprimir comprobantes";
const PERMISSION: AuthorizablePermissionKey = "reprint_receipt";

export type ReprintableSale = Pick<SaleDetail, "sale_id" | "occurred_at"> &
  Partial<Pick<SaleDetail, "comprobante" | "operation_number" | "total">> & {
    credit_note?: SaleCreditNote | null;
    next_copy: Extract<NextReceiptCopy, { kind: "duplicate" }>;
  };

export type UseReprintReceiptInput = {
  document: PrintedDocument;
  saleId: string;
  authorizationRequired: boolean;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  reprint: (
    saleId: string,
    reason: string,
    authorization: Authorization | undefined,
  ) => Promise<ReprintSaleReceiptOutcome>;
  onReprinted: (copy: ReceiptCopyShown) => void;
  onSaleGone: () => void;
  onSessionInvalid: () => void;
};

export function useReprintReceipt({
  document,
  saleId,
  authorizationRequired,
  loadAuthorizers,
  reprint,
  onReprinted,
  onSaleGone,
  onSessionInvalid,
}: UseReprintReceiptInput) {
  const [notice, setNotice] = useState<string>();
  const authorization = useAuthorization({
    permission: PERMISSION,
    required: authorizationRequired,
    loadAuthorizers,
  });
  const { form, submit, submitting, clearFieldError } = useRequestForm({
    defaultValues: EMPTY_REPRINT_RECEIPT_FORM,
    request: { schema: reprintReceiptFormRequestSchema, from: reprintReceiptRequestFrom },
    fields: { reason: "reason" },
    messages: { reason: REQUIRED_REASON_MESSAGE },
    onSubmit: async ({ reason }, { showFieldError }) => {
      const outcome = await reprint(saleId, reason, authorization.value).catch(
        (): "failed" => "failed",
      );
      authorization.dismiss();
      if (outcome === "failed") {
        setNotice(FAILED_MESSAGE);
        return;
      }
      switch (outcome.kind) {
        case "started":
          authorization.performed();
          onReprinted(outcome.copy);
          break;
        case "busy":
          setNotice(BUSY_MESSAGES[document]);
          break;
        case "printer_not_configured":
          setNotice(PRINTER_NOT_CONFIGURED_MESSAGE);
          break;
        case "sale_voided":
          setNotice(SALE_VOIDED_MESSAGE);
          break;
        case "original_not_printed":
          setNotice(ORIGINAL_NOT_PRINTED_MESSAGE);
          break;
        case "invalid_reason":
          showFieldError("reason", invalidReasonMessage(outcome.max_length));
          break;
        case "not_found":
          onSaleGone();
          break;
        case "not_signed_in":
          onSessionInvalid();
          break;
        case "wrong_pin":
        case "rate_limited":
        case "locked":
        case "lacks_permission":
          if (authorization.required) {
            authorization.refuse(outcome);
          } else if (outcome.kind === "lacks_permission") {
            setNotice(`Ya no tenés permiso para ${REPRINT_AUTHORIZING}.`);
          } else {
            setNotice(FAILED_MESSAGE);
          }
          break;
        case "unavailable":
          setNotice(FAILED_MESSAGE);
          break;
      }
    },
  });

  function handleSubmit() {
    if (submitting) {
      return;
    }
    if (!authorization.ready) {
      authorization.ask();
      return;
    }
    setNotice(undefined);
    clearFieldError("reason");
    void submit();
  }

  return {
    form,
    submitting,
    notice,
    clearNotice: () => setNotice(undefined),
    authorization,
    handleSubmit,
  };
}
