import type {
  Authorization,
  ReceiptCopyShown,
  ReprintSaleReceiptOutcome,
  SignInUser,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey, PrintedDocument } from "@purosur/domain";
import {
  Button,
  Eyebrow,
  formatCents,
  formatClockTime,
  formatDayMonthAndTime,
  InlineNotice,
  SidePanel,
  SidePanelTitle,
  SummaryRowGroup,
} from "@purosur/ui";
import { Printer, TriangleAlert } from "lucide-react";
import { useRef } from "react";
import { useKeys } from "../platform/key-layer";
import { AuthorizationModal } from "../shell/authorization-modal";
import { useRefuseBarcodeReadings } from "../shell/barcode-readings";
import { FramePanel } from "../shell/register-frame";
import {
  creditNoteComprobantePresentation,
  nonEmptyRows,
  receiptCopyPresentation,
} from "../shell/sale-receipt-text";
import type { ReprintableSale } from "../shell/use-reprint-receipt";
import { REPRINT_AUTHORIZING, useReprintReceipt } from "../shell/use-reprint-receipt";
import { comprobanteLine, documentNumberText } from "./sale-history-text";

export type ReprintSalePanelProps = {
  document: PrintedDocument;
  sale: ReprintableSale & { total: number };
  withDate: boolean;
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
  onClose: () => void;
};

function comprobanteText(document: PrintedDocument, sale: ReprintSalePanelProps["sale"]) {
  if (document === "credit_note") {
    const { credit_note: creditNote } = sale;
    return creditNote?.kind === "authorized" || creditNote?.kind === "issued_offline"
      ? `${creditNoteComprobantePresentation(creditNote).name} · ${documentNumberText(creditNote)}`
      : undefined;
  }
  return sale.comprobante === undefined || sale.comprobante.kind === "none"
    ? undefined
    : comprobanteLine(sale.comprobante);
}

export function ReprintSalePanel({
  document,
  sale,
  withDate,
  authorizationRequired,
  loadAuthorizers,
  reprint,
  onReprinted,
  onSaleGone,
  onSessionInvalid,
  onClose,
}: ReprintSalePanelProps) {
  const panel = useRef<HTMLDivElement | null>(null);
  const { form, submitting, notice, clearNotice, authorization, handleSubmit } = useReprintReceipt({
    document,
    saleId: sale.sale_id,
    authorizationRequired,
    loadAuthorizers,
    reprint,
    onReprinted,
    onSaleGone,
    onSessionInvalid,
  });
  function focusReasonWhenShown(node: HTMLDivElement | null) {
    panel.current = node;
    node?.querySelector("input")?.focus();
  }
  useKeys([{ key: "Escape", run: submitting ? () => {} : onClose }], { fallback: true });
  useKeys([{ key: "Enter", run: handleSubmit }], { fallback: true, within: panel });
  useRefuseBarcodeReadings(true);

  const copy = receiptCopyPresentation(sale.next_copy);
  const comprobante = comprobanteText(document, sale);
  const rows = nonEmptyRows([
    {
      label: "Venta",
      value: withDate ? formatDayMonthAndTime(sale.occurred_at) : formatClockTime(sale.occurred_at),
    },
    ...(comprobante === undefined ? [] : [{ label: "Comprobante", value: comprobante }]),
  ]);

  return (
    <FramePanel>
      <div ref={focusReasonWhenShown} className="flex h-full outline-none">
        <SidePanel
          label="Reimprimir"
          header={
            <SidePanelTitle
              title="Reimprimir"
              icon={<Printer />}
              locked={authorizationRequired}
              onClose={onClose}
              closeDisabled={submitting}
            />
          }
          footer={
            <Button
              size="large"
              fullWidth
              icon={<Printer />}
              iconPosition="start"
              keycap="Enter"
              disabled={submitting}
              onPress={handleSubmit}
            >
              {copy.printButton}
            </Button>
          }
        >
          <Eyebrow text={copy.comesOutAs.toUpperCase()} />
          <p className="text-hero text-text">{formatCents(sale.total)}</p>
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
        </SidePanel>
      </div>
    </FramePanel>
  );
}
