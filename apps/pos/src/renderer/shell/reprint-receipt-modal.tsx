import type {
  Authorization,
  ReceiptCopyShown,
  ReprintSaleReceiptOutcome,
  SignInUser,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey, PrintedDocument } from "@purosur/domain";
import {
  Button,
  formatClockTime,
  formatOperationNumber,
  InlineNotice,
  Modal,
  SummaryRowGroup,
} from "@purosur/ui";
import { Printer, TriangleAlert, X } from "lucide-react";
import { AuthorizationModal } from "./authorization-modal";
import {
  comprobantePresentation,
  creditNoteComprobantePresentation,
  nonEmptyRows,
  receiptCopyPresentation,
} from "./sale-receipt-text";
import type { SignedInPerson } from "./signed-in-person";
import type { ReprintableSale } from "./use-reprint-receipt";
import { REPRINT_AUTHORIZING, useReprintReceipt } from "./use-reprint-receipt";

function documentComprobante(
  document: PrintedDocument,
  sale: ReprintableSale,
): { name: string; detail: string } | undefined {
  if (document === "credit_note") {
    return sale.credit_note?.kind === "authorized" || sale.credit_note?.kind === "issued_offline"
      ? creditNoteComprobantePresentation(sale.credit_note)
      : undefined;
  }
  return sale.comprobante === undefined ? undefined : comprobantePresentation(sale.comprobante);
}

const SUBJECTS: Record<PrintedDocument, string> = {
  sale_receipt: "VENTA",
  credit_note: "NOTA DE CRÉDITO DE LA VENTA",
  deferred_invoice: "FACTURA DE LA VENTA",
};

export type ReprintReceiptModalProps = {
  document: PrintedDocument;
  sale: ReprintableSale;
  person: SignedInPerson;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  reprint: (
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
  document,
  sale,
  person,
  loadAuthorizers,
  reprint,
  onReprinted,
  onSaleGone,
  onSessionInvalid,
  onClose,
}: ReprintReceiptModalProps) {
  const copy = receiptCopyPresentation(sale.next_copy);
  const comprobante = documentComprobante(document, sale);
  const { form, submitting, notice, clearNotice, authorization, handleSubmit } = useReprintReceipt({
    document,
    saleId: sale.sale_id,
    authorizationRequired: !person.abilities.includes("reprint_receipt"),
    loadAuthorizers,
    reprint,
    onReprinted,
    onSaleGone,
    onSessionInvalid,
  });

  const operationNumber = document === "sale_receipt" ? (sale.operation_number ?? null) : null;
  const rows = nonEmptyRows([
    ...(copy.legend === undefined ? [] : [{ label: "Leyenda", value: copy.legend }]),
    ...(comprobante === undefined
      ? []
      : [{ label: "Comprobante", value: `${comprobante.name} · ${comprobante.detail}` }]),
    ...(operationNumber === null
      ? []
      : [{ label: "Operación", value: formatOperationNumber(operationNumber) }]),
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
      context={`REIMPRIMIR ${SUBJECTS[document]} DE LAS ${formatClockTime(sale.occurred_at)}`}
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
            disabled={submitting}
            onPress={handleSubmit}
          >
            {copy.printButton}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {rows === undefined ? null : <SummaryRowGroup rows={rows} />}
        <form.AppField name="reason" listeners={{ onChange: clearNotice }}>
          {(field) => (
            <field.TextField
              kind="plain-text"
              label="Motivo de la reimpresión"
              disabled={submitting}
            />
          )}
        </form.AppField>
        <AuthorizationModal
          authorization={authorization}
          subtitle="Reimprimir comprobante"
          action={REPRINT_AUTHORIZING}
          submitting={submitting}
          onConfirm={handleSubmit}
        />
        {notice === undefined ? null : (
          <InlineNotice tone="error" icon={<TriangleAlert />} title={notice} />
        )}
      </div>
    </Modal>
  );
}
