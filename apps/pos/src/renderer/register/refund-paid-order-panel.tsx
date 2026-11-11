import type { ConvertPaidOrderIntoRefundOutcome, StartupPending } from "@purosur/contracts";
import { ConfirmationPanel, formatCents, formatClockTime } from "@purosur/ui";
import { Undo2 } from "lucide-react";
import { useRef, useState } from "react";
import { useKeys } from "../platform/key-layer";
import { useRefuseBarcodeReadings } from "../shell/barcode-readings";
import { FramePanel } from "../shell/register-frame";

const FAILED_MESSAGE = "No se pudo pasar el cobro a reembolso. Probá de nuevo.";

const REFUSALS = {
  unreachable: "No hay conexión con la nube. Probá de nuevo cuando vuelva.",
  refused: "La nube no aceptó pasar el cobro a reembolso. Probá de nuevo más tarde.",
  not_permitted: "No tenés permiso para pasar un cobro a reembolso.",
  rebuilt_sale_open:
    "Ya hay una venta armada con este cobro. Volvé a esa venta o cancelala antes de pasarlo a reembolso.",
  unavailable: FAILED_MESSAGE,
} as const;

export type RefundPaidOrderPanelProps = {
  order: Pick<
    StartupPending["paid_orders_without_sale"][number],
    "payment_transaction_id" | "method" | "amount" | "created_at"
  >;
  convertPaidOrderIntoRefund: (
    paymentTransactionId: string,
  ) => Promise<ConvertPaidOrderIntoRefundOutcome>;
  onConverted: () => void;
  onGone: () => void;
  onSessionInvalid: () => void;
  onClose: () => void;
};

export function RefundPaidOrderPanel({
  order,
  convertPaidOrderIntoRefund,
  onConverted,
  onGone,
  onSessionInvalid,
  onClose,
}: RefundPaidOrderPanelProps) {
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string>();
  const converting = useRef(false);
  const panel = useRef<HTMLDivElement | null>(null);
  function focusWhenShown(node: HTMLDivElement | null) {
    panel.current = node;
    node?.focus();
  }
  useKeys([{ key: "Escape", run: onClose }], { fallback: true, active: !submitting });
  useKeys([{ key: "Enter", run: () => void confirm() }], { fallback: true, within: panel });
  useRefuseBarcodeReadings(true);

  async function confirm() {
    if (converting.current) {
      return;
    }
    converting.current = true;
    setSubmitting(true);
    setNotice(undefined);
    const outcome = await convertPaidOrderIntoRefund(order.payment_transaction_id).catch(
      (): ConvertPaidOrderIntoRefundOutcome => ({ kind: "unavailable" }),
    );
    converting.current = false;
    setSubmitting(false);
    switch (outcome.kind) {
      case "converted":
      case "already_resolved":
        onConverted();
        break;
      case "not_found":
        onGone();
        break;
      case "not_signed_in":
        onSessionInvalid();
        break;
      default:
        setNotice(REFUSALS[outcome.kind]);
    }
  }

  return (
    <FramePanel>
      <div ref={focusWhenShown} tabIndex={-1} className="flex h-full outline-none">
        <ConfirmationPanel
          title="¿Pasar el cobro a reembolso?"
          icon={<Undo2 />}
          tone="warning"
          fieldLabel={`Cobro con ${order.method === "QR" ? "QR" : "Point"}`}
          value={formatCents(order.amount)}
          details={[
            { label: "Cobrado a las", value: formatClockTime(order.created_at) },
            { label: "Pasa a ser", value: "Reembolso pendiente" },
          ]}
          {...(notice === undefined ? {} : { notice })}
          busy={submitting}
          actionLabel="Pasar a reembolso"
          actionIcon={<Undo2 />}
          onClose={onClose}
          onConfirm={() => void confirm()}
        />
      </div>
    </FramePanel>
  );
}
