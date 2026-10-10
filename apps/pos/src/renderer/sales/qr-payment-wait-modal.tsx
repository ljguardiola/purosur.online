import type { FollowMercadoPagoQrChargeOutcome } from "@purosur/contracts";
import type { Icon } from "@purosur/ui";
import {
  Button,
  CountdownRing,
  formatCents,
  formatNumber,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  Modal,
  ProgressSteps,
  plural,
  SummaryRowGroup,
} from "@purosur/ui";
import { ArrowRight, CircleX, Info, QrCode, TimerOff, TriangleAlert } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import type { ShownQrOrder } from "./qr-charge-modal";
import type { FollowedQrCharge } from "./sales-queries";
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
  const charge = useQrChargeQuery({ paymentTransactionId: order.payment_transaction_id, follow });
  const outcome = charge.status === "loaded" ? charge.value : undefined;
  const [retried, setRetried] = useState(false);

  const leaveWhenSettled = useEffectEvent((settled: FollowedQrCharge) => {
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
          `${waitPassed(order.wait_seconds)} y el cliente no pagó. Para seguir, elegí otro medio.`,
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
      footer={null}
    >
      <div className="flex flex-col gap-5">
        <SummaryRowGroup
          rows={[
            { label: "Total de la venta", value: formatCents(total) },
            { label: "Pagado", value: formatCents(paid) },
            { label: "A cobrar ahora", value: formatCents(order.amount) },
          ]}
        />
        {charge.status === "failed" ? (
          <LoadFailure
            icon={<TriangleAlert />}
            title="No se pudo consultar el pago del QR"
            description="Volvé a intentarlo en unos segundos."
            onRetry={() => {
              setRetried(true);
              charge.retry();
            }}
          />
        ) : charge.status === "loading" && retried ? (
          <LoadingPlaceholder variant="card" lines={2} />
        ) : (
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
        )}
        <InlineNotice
          tone="info"
          icon={<Info />}
          title="Al llegar a cero, volvés a elegir medio. Si el cliente paga después, queda una tarea de reembolso para confirmar."
        />
      </div>
    </Modal>
  );
}

function waitPassed(waitSeconds: number): string {
  const minutes = waitSeconds / 60;
  const passed = plural(minutes, { one: "Pasó", other: "Pasaron" });
  return `${passed} ${formatNumber(minutes, { style: "unit", unit: "minute", unitDisplay: "long" })}`;
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
