import type { CancelLockedSaleOutcome } from "@purosur/contracts";
import { Button, formatCents, InlineNotice, Modal, SummaryRowGroup } from "@purosur/ui";
import { ArrowLeft, CircleX, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import type { Refund } from "../shell/refund-lines";
import { RefundLines } from "../shell/refund-lines";

const FAILED_MESSAGE = "No se pudo cancelar la venta. Probá de nuevo.";
const NOT_PERMITTED_MESSAGE = "No tenés el permiso de anular ventas con pagos.";

type Refusal = Extract<
  CancelLockedSaleOutcome,
  { kind: "wrong_pin" | "rate_limited" | "locked" | "lacks_permission" | "not_locked" }
>;

export type CancelLockedPaidSaleModalProps = {
  total: number;
  paid: number;
  refunds: readonly Refund[];
  cancelSale: () => Promise<CancelLockedSaleOutcome>;
  onCancelled: (refunds: Refund[]) => void;
  onSaleGone: () => void;
  onRefused: (refusal: Refusal) => void;
  onClose: () => void;
};

export function CancelLockedPaidSaleModal({
  total,
  paid,
  refunds,
  cancelSale,
  onCancelled,
  onSaleGone,
  onRefused,
  onClose,
}: CancelLockedPaidSaleModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string>();

  async function confirm() {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setNotice(undefined);
    const outcome = await cancelSale().catch(
      (): CancelLockedSaleOutcome => ({ kind: "unavailable" }),
    );
    setSubmitting(false);
    switch (outcome.kind) {
      case "cancelled":
        onCancelled(outcome.refunds);
        break;
      case "no_open_sale":
        onSaleGone();
        break;
      case "no_open_session":
        onClose();
        break;
      case "not_permitted":
        setNotice(NOT_PERMITTED_MESSAGE);
        break;
      case "unavailable":
        setNotice(FAILED_MESSAGE);
        break;
      default:
        onRefused(outcome);
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
      context="Venta en curso · Con pagos"
      title="¿Cancelar la venta?"
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
            icon={<X />}
            fullWidth
            disabled={submitting}
            onPress={() => void confirm()}
          >
            Cancelar la venta
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SummaryRowGroup
          rows={[
            { label: "Total", value: formatCents(total) },
            { label: "Pagado", value: formatCents(paid), strong: true },
          ]}
        />
        <RefundLines refunds={refunds} />
        {refunds.some((refund) => refund.state === "PENDING") ? (
          <p className="text-detail text-text-subtle">
            Un reembolso pendiente lo hace alguien fuera de la caja y lo marca como hecho en el
            backoffice.
          </p>
        ) : null}
        {notice === undefined ? null : (
          <InlineNotice tone="error" icon={<TriangleAlert />} title={notice} />
        )}
      </div>
    </Modal>
  );
}
