import type {
  Authorization,
  SaleCreditNote,
  SignInUser,
  VoidSaleOutcome,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import {
  Button,
  Checkbox,
  Eyebrow,
  formatCents,
  formatClockTime,
  formatOperationNumber,
  InlineNotice,
  Modal,
  SummaryRowGroup,
  Tag,
} from "@purosur/ui";
import { ArrowLeft, CircleX, PackageCheck, ReceiptText, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { AuthorizationSection } from "../shell/authorization-section";
import type { SaleDetail } from "../shell/sale-receipt-text";
import { comprobantePresentation } from "../shell/sale-receipt-text";
import type { SignedInPerson } from "../shell/signed-in-person";
import { useAuthorization } from "../shell/use-authorization";
import type { VoidCreditNoteCorrects, VoidRefund } from "./void-sale-text";
import { voidRefundPresentation, voidRefusalReason } from "./void-sale-text";

export type { VoidCreditNoteCorrects, VoidRefund } from "./void-sale-text";

const FAILED_MESSAGE = "No se pudo anular la venta. Probá de nuevo.";
const UNCONFIRMED_MESSAGE = "Confirmá los reembolsos pendientes antes de anular la venta.";
const NOT_COMPLETED_REASON = "La venta ya no se puede anular.";
const AUTHORIZING = "anular ventas";

export type VoidSaleModalProps = {
  sale: Pick<SaleDetail, "sale_id" | "occurred_at" | "total" | "comprobante" | "operation_number">;
  refunds: readonly VoidRefund[];
  creditNoteCorrects: VoidCreditNoteCorrects;
  authorizationRequired: boolean;
  person: SignedInPerson;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  voidSale: (
    saleId: string,
    pendingRefundsConfirmed: boolean,
    authorization: Authorization | undefined,
  ) => Promise<VoidSaleOutcome>;
  onVoided: (creditNote: SaleCreditNote | null) => void;
  onRefused: () => void;
  onSaleGone: () => void;
  onSessionInvalid: () => void;
  onClose: () => void;
};

export function VoidSaleModal({
  sale,
  refunds,
  creditNoteCorrects,
  authorizationRequired,
  person,
  loadAuthorizers,
  voidSale,
  onVoided,
  onRefused,
  onSaleGone,
  onSessionInvalid,
  onClose,
}: VoidSaleModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [refusalReason, setRefusalReason] = useState<string>();
  const [confirmed, setConfirmed] = useState<readonly number[]>([]);
  const authorization = useAuthorization({
    person,
    permission: "void_sale",
    required: authorizationRequired,
    loadAuthorizers,
  });

  const shown = refunds.map((refund, position) => ({
    position,
    ...voidRefundPresentation(refund),
  }));
  const pending = shown.flatMap((refund) => (refund.pending ? [refund.position] : []));
  const allConfirmed = pending.every((position) => confirmed.includes(position));
  const invoiced = creditNoteCorrects !== null;
  const comprobante = comprobantePresentation(
    creditNoteCorrects === null
      ? sale.comprobante
      : { kind: "fiscal", document_type: "factura_c", ...creditNoteCorrects },
  );

  async function confirm() {
    if (submitting || refusalReason !== undefined || !allConfirmed || !authorization.ready) {
      return;
    }
    setSubmitting(true);
    setNotice(undefined);
    const outcome = await voidSale(sale.sale_id, pending.length > 0, authorization.value).catch(
      (): "failed" => "failed",
    );
    setSubmitting(false);
    if (outcome === "failed") {
      setNotice(FAILED_MESSAGE);
      return;
    }
    switch (outcome.kind) {
      case "voided":
        authorization.performed();
        onVoided(outcome.credit_note);
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
      case "pending_refunds_unconfirmed":
        setNotice(UNCONFIRMED_MESSAGE);
        break;
      case "not_completed":
      case "session_closed":
      case "invoice_in_flight":
      case "invoice_needs_connection":
        setRefusalReason(voidRefusalReason(outcome.kind) ?? NOT_COMPLETED_REASON);
        onRefused();
        break;
      case "unavailable":
        setNotice(FAILED_MESSAGE);
        break;
    }
  }

  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next && !submitting) {
          onClose();
        }
      }}
      width="confirmation"
      tone="error"
      icon={<CircleX />}
      context={`ANULAR VENTA DE LAS ${formatClockTime(sale.occurred_at)}`}
      title="Revisá qué pasa al anular"
      closable={!submitting}
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<ArrowLeft />}
            disabled={submitting}
            onPress={onClose}
          >
            Volver
          </Button>
          <Button
            destructive
            size="large"
            icon={<CircleX />}
            fullWidth
            disabled={submitting || !allConfirmed || !authorization.ready}
            {...(refusalReason === undefined ? {} : { disabledReason: refusalReason })}
            onPress={() => void confirm()}
          >
            {invoiced ? "Anular y emitir nota de crédito" : "Anular la venta"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <SummaryRowGroup
          rows={[
            { label: "Total", value: formatCents(sale.total) },
            ...(comprobante === undefined
              ? []
              : [{ label: "Comprobante", value: comprobante.name }]),
            ...(comprobante === undefined || !invoiced
              ? []
              : [{ label: "Número", value: comprobante.detail }]),
            ...(sale.operation_number === null
              ? []
              : [{ label: "Operación", value: formatOperationNumber(sale.operation_number) }]),
          ]}
        />
        <div className="flex flex-col gap-3">
          <Eyebrow text="REEMBOLSOS · CADA PAGO VUELVE POR SU MEDIO" />
          <ul className="flex flex-col gap-3">
            {shown.map((refund) => (
              <li key={refund.position} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-body font-bold text-text">{refund.title}</span>
                  <Tag tone={refund.chip.tone}>{refund.chip.label}</Tag>
                </div>
                <p className="text-detail text-text-subtle">{refund.description}</p>
                {refund.pending ? (
                  <Checkbox
                    name={`confirm-refund-${refund.position}`}
                    checked={confirmed.includes(refund.position)}
                    disabled={submitting}
                    onCheckedChange={(checked) =>
                      setConfirmed(
                        checked
                          ? [...confirmed, refund.position]
                          : confirmed.filter((other) => other !== refund.position),
                      )
                    }
                  >
                    Confirmo
                  </Checkbox>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
        <ul className="flex flex-col gap-2 text-body text-text">
          <li className="flex items-center gap-2">
            <ReceiptText aria-hidden />
            {invoiced
              ? `Se emite e imprime la nota de crédito C por ${formatCents(sale.total)}.`
              : "No se emite nota de crédito: la venta todavía no tenía factura."}
          </li>
          <li className="flex items-center gap-2">
            <PackageCheck aria-hidden />
            La mercadería vuelve al stock.
          </li>
        </ul>
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
