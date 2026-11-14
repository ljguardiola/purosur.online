import type { CancelLockedSaleOutcome } from "@purosur/contracts";
import { ConfirmationPanel, formatCents } from "@purosur/ui";
import { Ban } from "lucide-react";
import { useState } from "react";
import { useKeys } from "../platform/key-layer";
import { refundLabel } from "../shell/refund-label";
import type { Refund } from "../shell/refund-lines";

const FAILED_MESSAGE = "No se pudo cancelar la venta. Probá de nuevo.";
const NOT_PERMITTED_MESSAGE = "No tenés el permiso de anular ventas con pagos.";
const QR_CHARGE_IN_PROGRESS_MESSAGE =
  "Hay un cobro con Mercado Pago en curso. Esperá a que termine para cancelar la venta.";

type Refusal = Extract<
  CancelLockedSaleOutcome,
  { kind: "wrong_pin" | "rate_limited" | "locked" | "lacks_permission" | "not_locked" }
>;

export type CancelLockedPaidSalePanelProps = {
  total: number;
  paid: number;
  refunds: readonly Refund[];
  chargeInProgress: boolean;
  cancelSale: () => Promise<CancelLockedSaleOutcome>;
  onCancelled: (refunds: Refund[]) => void;
  onSaleGone: () => void;
  onRefused: (refusal: Refusal) => void;
  onClose: () => void;
};

export function CancelLockedPaidSalePanel({
  total,
  paid,
  refunds,
  chargeInProgress,
  cancelSale,
  onCancelled,
  onSaleGone,
  onRefused,
  onClose,
}: CancelLockedPaidSalePanelProps) {
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string>();

  async function confirm() {
    if (submitting || chargeInProgress) {
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
      case "mercado_pago_charge_in_progress":
        setNotice(QR_CHARGE_IN_PROGRESS_MESSAGE);
        break;
      case "unavailable":
      case "restoration_in_progress":
        setNotice(FAILED_MESSAGE);
        break;
      default:
        onRefused(outcome);
    }
  }

  function goBack() {
    if (!submitting) {
      onClose();
    }
  }

  useKeys([{ key: "Escape", run: goBack }]);
  useKeys([{ key: "Enter", run: () => void confirm() }], { fallback: true });

  const shownNotice = chargeInProgress ? QR_CHARGE_IN_PROGRESS_MESSAGE : notice;

  return (
    <ConfirmationPanel
      title="¿Cancelar la venta?"
      icon={<Ban />}
      tone="error"
      fieldLabel="VENTA EN CURSO · CON PAGOS"
      value={formatCents(total)}
      details={[
        { label: "Pagado", value: formatCents(paid) },
        ...(chargeInProgress
          ? []
          : refunds.map((refund) => ({
              label: refundLabel(refund),
              value: formatCents(refund.amount),
            }))),
      ]}
      actionLabel="Cancelar la venta"
      actionIcon={<Ban />}
      busy={submitting}
      actionDisabled={chargeInProgress}
      {...(shownNotice === undefined ? {} : { notice: shownNotice })}
      onClose={onClose}
      onConfirm={() => void confirm()}
    />
  );
}
