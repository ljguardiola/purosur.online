import type { Authorization, SignInUser, VoidSaleOutcome } from "@purosur/contracts";
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
import { ArrowLeft, CircleX, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { AuthorizationSection } from "../shell/authorization-section";
import type { SaleDetail } from "../shell/sale-receipt-text";
import { comprobantePresentation } from "../shell/sale-receipt-text";
import type { SignedInPerson } from "../shell/signed-in-person";
import { useAuthorization } from "../shell/use-authorization";
import type { VoidRefund } from "./void-sale-text";
import { voidRefundPresentation, voidRefusalNotice } from "./void-sale-text";

export type { VoidRefund } from "./void-sale-text";

const FAILED_MESSAGE = "No se pudo anular la venta. Probá de nuevo.";
const UNCONFIRMED_MESSAGE = "Confirmá los reembolsos pendientes antes de anular la venta.";
const NOT_COMPLETED_MESSAGE = "La venta ya no se puede anular";
const AUTHORIZING = "anular ventas";

type Notice = { title: string; description?: string };

export type VoidSaleModalProps = {
  sale: Pick<SaleDetail, "sale_id" | "occurred_at" | "total" | "comprobante" | "operation_number">;
  refunds: readonly VoidRefund[];
  authorizationRequired: boolean;
  person: SignedInPerson;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  voidSale: (
    saleId: string,
    pendingRefundsConfirmed: boolean,
    authorization: Authorization | undefined,
  ) => Promise<VoidSaleOutcome>;
  onVoided: () => void;
  onRefused: () => void;
  onSaleGone: () => void;
  onSessionInvalid: () => void;
  onClose: () => void;
};

export function VoidSaleModal({
  sale,
  refunds,
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
  const [notice, setNotice] = useState<Notice>();
  const [refused, setRefused] = useState(false);
  const [confirmed, setConfirmed] = useState<readonly number[]>([]);
  const authorization = useAuthorization({
    person,
    permission: "void_sale",
    required: authorizationRequired,
    loadAuthorizers,
  });

  const shown = refunds.map(voidRefundPresentation);
  const pending = shown.flatMap(({ pending: isPending }, index) => (isPending ? [index] : []));
  const allConfirmed = pending.every((index) => confirmed.includes(index));
  const authorizer =
    authorization.chosen !== null && authorization.authorizers.status === "loaded"
      ? authorization.authorizers.value.find((user) => user.id === authorization.chosen)
      : undefined;
  const comprobante = comprobantePresentation(sale.comprobante);

  async function confirm() {
    if (submitting || refused || !allConfirmed || !authorization.ready) {
      return;
    }
    setSubmitting(true);
    setNotice(undefined);
    const outcome = await voidSale(sale.sale_id, pending.length > 0, authorization.value).catch(
      (): "failed" => "failed",
    );
    setSubmitting(false);
    if (outcome === "failed") {
      setNotice({ title: FAILED_MESSAGE });
      return;
    }
    switch (outcome.kind) {
      case "voided":
        authorization.performed();
        onVoided();
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
          setNotice({ title: `Ya no tenés permiso para ${AUTHORIZING}.` });
        } else {
          setNotice({ title: FAILED_MESSAGE });
        }
        break;
      case "pending_refunds_unconfirmed":
        setNotice({ title: UNCONFIRMED_MESSAGE });
        break;
      case "not_completed":
      case "session_closed":
      case "invoice_in_flight":
      case "carries_invoice":
      case "mercado_pago_payment":
        setNotice(voidRefusalNotice(outcome.kind) ?? { title: NOT_COMPLETED_MESSAGE });
        setRefused(true);
        onRefused();
        break;
      case "unavailable":
        setNotice({ title: FAILED_MESSAGE });
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
            disabled={submitting || refused || !allConfirmed || !authorization.ready}
            onPress={() => void confirm()}
          >
            Anular la venta
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
            ...(sale.operation_number === null
              ? []
              : [{ label: "Operación", value: formatOperationNumber(sale.operation_number) }]),
          ]}
        />
        <div className="flex flex-col gap-3">
          <Eyebrow text="REEMBOLSOS · CADA PAGO VUELVE POR SU MEDIO" />
          <ul className="flex flex-col gap-3">
            {shown.map((refund, index) => (
              <li key={refund.title} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-body font-bold text-text">{refund.title}</span>
                  <Tag tone={refund.chip.tone}>{refund.chip.label}</Tag>
                </div>
                <p className="text-detail text-text-subtle">{refund.description}</p>
                {refund.pending ? (
                  <Checkbox
                    name={`confirm-refund-${index}`}
                    checked={confirmed.includes(index)}
                    disabled={submitting}
                    onCheckedChange={(checked) =>
                      setConfirmed(
                        checked
                          ? [...confirmed, index]
                          : confirmed.filter((other) => other !== index),
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
        <ul className="flex flex-col gap-1 text-body text-text">
          <li>No se emite nota de crédito: la venta todavía no tenía factura.</li>
          <li>La mercadería vuelve al stock.</li>
          {authorizer === undefined ? null : (
            <li>Autoriza: {authorizer.first_name}, con su PIN.</li>
          )}
        </ul>
        <AuthorizationSection
          authorization={authorization}
          action={AUTHORIZING}
          disabled={submitting}
        />
        {notice === undefined ? null : (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={notice.title}
            {...(notice.description === undefined ? {} : { description: notice.description })}
          />
        )}
      </div>
    </Modal>
  );
}
