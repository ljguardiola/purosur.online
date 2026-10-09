import type { FollowMercadoPagoQrChargeOutcome } from "@purosur/contracts";
import type { Icon } from "@purosur/ui";
import {
  Button,
  CountdownRing,
  formatCents,
  InlineNotice,
  Modal,
  ProgressSteps,
  SummaryRowGroup,
} from "@purosur/ui";
import { ArrowRight, CircleX, Info, QrCode, TimerOff } from "lucide-react";
import { useEffect, useEffectEvent } from "react";
import type { ShownQrOrder } from "./qr-charge-modal";
import { useQrChargeQuery } from "./sales-queries";

export type CompletedQrPayment = Extract<
  FollowMercadoPagoQrChargeOutcome,
  { kind: "completed" }
> & {
  amount: number;
};

export type QrPaymentWaitModalProps = {
  total: number;
  paid: number;
  order: ShownQrOrder;
  follow: (paymentTransactionId: string) => Promise<FollowMercadoPagoQrChargeOutcome>;
  onChooseAnotherMethod: () => void;
  onCompleted: (payment: CompletedQrPayment) => void;
  onPartiallyPaid: () => Promise<void>;
  onSaleUnavailable: () => void;
  onSessionInvalid: () => void;
};

export function QrPaymentWaitModal({
  total,
  paid,
  order,
  follow,
  onChooseAnotherMethod,
  onCompleted,
  onPartiallyPaid,
  onSaleUnavailable,
  onSessionInvalid,
}: QrPaymentWaitModalProps) {
  const outcome = useQrChargeQuery({ paymentTransactionId: order.payment_transaction_id, follow });

  const leaveWhenSettled = useEffectEvent((settled: FollowMercadoPagoQrChargeOutcome) => {
    switch (settled.kind) {
      case "completed":
        onCompleted({ ...settled, amount: order.amount });
        break;
      case "partially_paid":
        void onPartiallyPaid();
        break;
      case "not_pending":
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
      case "waiting":
      case "wait_over":
      case "declined":
      case "unavailable":
        break;
    }
  });

  useEffect(() => {
    if (outcome !== undefined) {
      leaveWhenSettled(outcome);
    }
  }, [outcome]);

  if (outcome?.kind === "declined") {
    return (
      <EndedModal
        tone="error"
        icon={<CircleX />}
        title="Mercado Pago rechazó el pago"
        lines={[
          "El pago del QR no se aprobó, así que no se cobró nada.",
          "Se puede volver a generar el QR o cobrar con otro medio.",
        ]}
        onChooseAnotherMethod={onChooseAnotherMethod}
      />
    );
  }
  if (outcome?.kind === "wait_over") {
    return (
      <EndedModal
        tone="warning"
        icon={<TimerOff />}
        title="Venció la espera del QR"
        lines={[
          "Pasaron 3 minutos y el cliente no pagó. Para seguir, elegí otro medio.",
          "Si el cliente paga el QR después, ese pago se devuelve: se crea una tarea de reembolso.",
        ]}
        onChooseAnotherMethod={onChooseAnotherMethod}
      />
    );
  }

  const remainingSeconds =
    outcome?.kind === "waiting" ? outcome.remaining_seconds : order.remaining_seconds;

  return (
    <Modal
      open
      onOpenChange={() => undefined}
      width="standard"
      tone="info"
      icon={<QrCode />}
      context="QR DE MERCADO PAGO"
      contextTone="info"
      title="Esperando el pago del cliente"
      closable={false}
    >
      <div className="flex flex-col gap-5">
        <SummaryRowGroup
          rows={[
            { label: "Total de la venta", value: formatCents(total) },
            { label: "Pagado", value: formatCents(paid) },
            { label: "A cobrar ahora", value: formatCents(order.amount) },
          ]}
        />
        <div className="flex items-center gap-6">
          <CountdownRing
            remainingSeconds={remainingSeconds}
            totalSeconds={order.wait_seconds}
            label="Tiempo para pagar"
          />
          <ProgressSteps
            steps={[
              {
                id: "order-created",
                label: `Orden creada por ${formatCents(order.amount)}`,
                state: "done",
              },
              {
                id: "customer-paying",
                label: "Esperando que el cliente pague",
                detail: "Escanea el QR del mostrador con su app",
                state: "current",
              },
              { id: "payment-approved", label: "Pago aprobado", state: "upcoming" },
            ]}
          />
        </div>
        <InlineNotice
          tone="info"
          icon={<Info />}
          title="Al llegar a cero, volvés a elegir medio. Si el cliente paga después, queda una tarea de reembolso para confirmar."
        />
      </div>
    </Modal>
  );
}

function EndedModal({
  tone,
  icon,
  title,
  lines,
  onChooseAnotherMethod,
}: {
  tone: "error" | "warning";
  icon: Icon;
  title: string;
  lines: readonly [string, string];
  onChooseAnotherMethod: () => void;
}) {
  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next) {
          onChooseAnotherMethod();
        }
      }}
      width="standard"
      tone={tone}
      icon={icon}
      context="QR DE MERCADO PAGO"
      contextTone={tone}
      title={title}
      closable={false}
      footer={
        <Button size="large" fullWidth icon={<ArrowRight />} onPress={onChooseAnotherMethod}>
          Elegir otro medio
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-body text-text">{lines[0]}</p>
        <p className="text-detail text-text-subtle">{lines[1]}</p>
      </div>
    </Modal>
  );
}
