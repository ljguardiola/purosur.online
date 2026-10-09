import type {
  Authorization,
  ReceiptCopyShown,
  ReprintSaleReceiptOutcome,
  SignInUser,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import {
  Button,
  formatClockTime,
  formatOperationNumber,
  InlineNotice,
  Modal,
  SummaryRowGroup,
  useRequestForm,
} from "@purosur/ui";
import { Printer, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { AuthorizationSection } from "../shell/authorization-section";
import type { SignedInPerson } from "../shell/signed-in-person";
import { useAuthorization } from "../shell/use-authorization";
import {
  EMPTY_REPRINT_RECEIPT_FORM,
  invalidReasonMessage,
  reprintReceiptFormRequestSchema,
  reprintReceiptRequestFrom,
} from "./reprint-receipt-form";
import type { SaleDetail } from "./sale-history-text";
import {
  comprobantePresentation,
  nonEmptyRows,
  receiptCopyPresentation,
} from "./sale-history-text";

const FAILED_MESSAGE = "No se pudo reimprimir. Probá de nuevo.";
const BUSY_MESSAGE =
  "Todavía puede salir una impresión de esta venta. Esperá a que termine antes de reimprimir.";
const REQUIRED_REASON_MESSAGE = "Escribí el motivo de la reimpresión.";
const AUTHORIZING = "reimprimir comprobantes";
const PERMISSION: AuthorizablePermissionKey = "reprint_receipt";

export type ReprintReceiptModalProps = {
  sale: SaleDetail;
  person: SignedInPerson;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  reprintSaleReceipt: (
    saleId: string,
    reason: string,
    authorization: Authorization | undefined,
  ) => Promise<ReprintSaleReceiptOutcome>;
  onReprinted: (copy: ReceiptCopyShown) => void;
  onSaleGone: () => void;
  onSessionInvalid: () => void;
  onClose: () => void;
};

export function ReprintReceiptModal({
  sale,
  person,
  loadAuthorizers,
  reprintSaleReceipt,
  onReprinted,
  onSaleGone,
  onSessionInvalid,
  onClose,
}: ReprintReceiptModalProps) {
  const [notice, setNotice] = useState<string>();
  const copy = receiptCopyPresentation(sale.next_copy);
  const comprobante = comprobantePresentation(sale.comprobante);
  const authorization = useAuthorization({
    person,
    permission: PERMISSION,
    required: !person.abilities.includes("reprint_receipt"),
    loadAuthorizers,
  });
  const { form, submit, submitting, clearFieldError } = useRequestForm({
    defaultValues: EMPTY_REPRINT_RECEIPT_FORM,
    request: { schema: reprintReceiptFormRequestSchema, from: reprintReceiptRequestFrom },
    fields: { reason: "reason" },
    messages: { reason: REQUIRED_REASON_MESSAGE },
    onSubmit: async ({ reason }, { showFieldError }) => {
      const outcome = await reprintSaleReceipt(sale.sale_id, reason, authorization.value).catch(
        (): "failed" => "failed",
      );
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
          setNotice(BUSY_MESSAGE);
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
            setNotice(`Ya no tenés permiso para ${AUTHORIZING}.`);
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
    if (submitting || !authorization.ready) {
      return;
    }
    setNotice(undefined);
    clearFieldError("reason");
    void submit();
  }

  const rows = nonEmptyRows([
    ...(copy.legend === undefined ? [] : [{ label: "Leyenda", value: copy.legend }]),
    ...(comprobante === undefined
      ? []
      : [{ label: "Comprobante", value: `${comprobante.name} · ${comprobante.detail}` }]),
    ...(sale.operation_number === null
      ? []
      : [{ label: "Operación", value: formatOperationNumber(sale.operation_number) }]),
  ]);

  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next && !submitting) {
          onClose();
        }
      }}
      width="standard"
      tone="info"
      icon={<Printer />}
      context={`${sale.next_copy.kind === "original" ? "IMPRIMIR" : "REIMPRIMIR"} VENTA DE LAS ${formatClockTime(sale.occurred_at)}`}
      title={copy.comesOutAs}
      closable={!submitting}
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<X />}
            disabled={submitting}
            onPress={onClose}
          >
            Cancelar
          </Button>
          <Button
            size="large"
            fullWidth
            icon={<Printer />}
            disabled={submitting || !authorization.ready}
            onPress={handleSubmit}
          >
            {copy.printButton}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {rows === undefined ? null : <SummaryRowGroup rows={rows} />}
        <form.AppField name="reason" listeners={{ onChange: () => setNotice(undefined) }}>
          {(field) => (
            <field.TextField
              kind="plain-text"
              label="Motivo de la reimpresión"
              disabled={submitting}
            />
          )}
        </form.AppField>
        <AuthorizationSection
          authorization={authorization}
          action={AUTHORIZING}
          disabled={submitting}
        />
        {notice === undefined ? null : (
          <InlineNotice tone="error" icon={<TriangleAlert />} title={notice} />
        )}
      </div>
    </Modal>
  );
}
