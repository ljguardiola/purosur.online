import type { ChargeSaleWithPaidOrderOutcome, OpenSale } from "@purosur/contracts";
import { Button, formatCents, HighlightedNotice, InlineNotice } from "@purosur/ui";
import { CreditCard, QrCode, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import { paymentMethodName } from "../platform/payment-method-names";
import type { CompletedPaidOrder } from "./charge-completed-modal";

const FAILED_MESSAGE = "No se pudo cobrar con el pago de Mercado Pago. Probá de nuevo.";
const RESTORING_MESSAGE = "La caja se está restaurando. Esperá a que termine.";

type PartiallyPaid = Extract<ChargeSaleWithPaidOrderOutcome, { kind: "partially_paid" }>;

export type RebuiltPaidOrderNoticeProps = {
  paidOrder: NonNullable<OpenSale["rebuilt_paid_order"]>;
  apply: () => Promise<ChargeSaleWithPaidOrderOutcome>;
  onCompleted: (charge: CompletedPaidOrder) => void;
  onPartiallyPaid: (charge: PartiallyPaid) => Promise<void>;
  onSaleChanged: () => Promise<void>;
  onSaleUnavailable: () => void;
  onSessionInvalid: () => void;
};

export function RebuiltPaidOrderNotice({
  paidOrder,
  apply,
  onCompleted,
  onPartiallyPaid,
  onSaleChanged,
  onSaleUnavailable,
  onSessionInvalid,
}: RebuiltPaidOrderNoticeProps) {
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<string>();
  const applying = useRef(false);

  async function applyOrder() {
    if (applying.current) {
      return;
    }
    applying.current = true;
    setSubmitting(true);
    setProblem(undefined);
    const outcome = await apply().catch(
      (): ChargeSaleWithPaidOrderOutcome => ({ kind: "unavailable" }),
    );
    switch (outcome.kind) {
      case "completed":
        onCompleted(outcome);
        break;
      case "partially_paid":
        await onPartiallyPaid(outcome);
        break;
      case "no_paid_order":
      case "already_applied":
        await onSaleChanged();
        break;
      case "empty_sale":
      case "zero_total":
      case "reaches_buyer_identification_threshold":
      case "no_buyer_identification_threshold":
      case "no_open_sale":
      case "not_permitted":
        onSaleUnavailable();
        break;
      case "not_signed_in":
      case "no_open_session":
        onSessionInvalid();
        break;
      case "restoration_in_progress":
        setProblem(RESTORING_MESSAGE);
        break;
      case "unavailable":
        setProblem(FAILED_MESSAGE);
        break;
    }
    applying.current = false;
    setSubmitting(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <HighlightedNotice
        tone="info"
        icon={paidOrder.method === "QR" ? <QrCode /> : <CreditCard />}
        title={`Pago con ${paymentMethodName(paidOrder.method)} de ${formatCents(paidOrder.amount)}`}
        description="Aplicalo a la venta antes de cobrar con otro medio."
        layout="row"
        actions={
          <Button
            size="large"
            dataStatus={submitting ? "loading" : "loaded"}
            onPress={() => void applyOrder()}
          >
            Cobrar con el pago de Mercado Pago
          </Button>
        }
      />
      {problem === undefined ? null : (
        <InlineNotice tone="error" icon={<TriangleAlert />} title={problem} />
      )}
    </div>
  );
}
