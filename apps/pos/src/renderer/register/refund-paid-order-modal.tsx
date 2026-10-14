import type { ConvertPaidOrderIntoRefundOutcome, StartupPending } from "@purosur/contracts";
import {
  Button,
  formatCents,
  formatClockTime,
  InlineNotice,
  Modal,
  SummaryRowGroup,
} from "@purosur/ui";
import { ArrowLeft, TriangleAlert, Undo2 } from "lucide-react";
import { useRef, useState } from "react";

const FAILED_MESSAGE = "No se pudo pasar el cobro a reembolso. Probá de nuevo.";

const REFUSALS = {
  unreachable: "No hay conexión con la nube. Probá de nuevo cuando vuelva.",
  refused: "La nube no aceptó pasar el cobro a reembolso. Probá de nuevo más tarde.",
  not_permitted: "No tenés permiso para pasar un cobro a reembolso.",
  unavailable: FAILED_MESSAGE,
} as const;

export type RefundPaidOrderModalProps = {
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

export function RefundPaidOrderModal({
  order,
  convertPaidOrderIntoRefund,
  onConverted,
  onGone,
  onSessionInvalid,
  onClose,
}: RefundPaidOrderModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string>();
  const converting = useRef(false);

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
    <Modal
      open
      onOpenChange={(next) => {
        if (!next && !submitting) {
          onClose();
        }
      }}
      width="confirmation"
      tone="warning"
      icon={<Undo2 />}
      context="Antes de empezar"
      title="¿Pasar el cobro a reembolso?"
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
            size="large"
            icon={<Undo2 />}
            fullWidth
            disabled={submitting}
            onPress={() => void confirm()}
          >
            Pasar a reembolso
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SummaryRowGroup
          rows={[
            {
              label: `Cobro con ${order.method === "QR" ? "QR" : "Point"}`,
              value: formatCents(order.amount),
              strong: true,
            },
            { label: "Cobrado a las", value: formatClockTime(order.created_at) },
          ]}
        />
        <p className="text-detail text-text-subtle">
          El cobro pasa a ser un reembolso que se confirma después en el backoffice. Al cliente no
          se le cobra de nuevo.
        </p>
        {notice === undefined ? null : (
          <InlineNotice tone="error" icon={<TriangleAlert />} title={notice} />
        )}
      </div>
    </Modal>
  );
}
