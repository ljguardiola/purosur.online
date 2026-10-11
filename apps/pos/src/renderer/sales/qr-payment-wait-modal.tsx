import type {
  AbandonMercadoPagoQrChargeOutcome,
  FollowMercadoPagoQrChargeOutcome,
} from "@purosur/contracts";
import type { Icon } from "@purosur/ui";
import {
  Button,
  CountdownRing,
  formatCents,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  Modal,
  ProgressSteps,
  SummaryRowGroup,
} from "@purosur/ui";
import {
  ArrowRight,
  CircleCheck,
  CircleX,
  Info,
  Lock,
  QrCode,
  TimerOff,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import type { ShownQrOrder } from "./qr-charge-modal";
import type { FollowedQrCharge } from "./sales-queries";
import { useAbandonQrChargeMutation, useQrChargeQuery } from "./sales-queries";

export type CompletedQrPayment = Extract<
  FollowMercadoPagoQrChargeOutcome,
  { kind: "completed" }
> & {
  amount: number;
};

type PaidQrCharge = Extract<FollowedQrCharge, { kind: "completed" | "partially_paid" }>;

export type QrPaymentWaitModalProps = {
  total: number;
  paid: number;
  order: ShownQrOrder;
  follow: (paymentTransactionId: string) => Promise<FollowMercadoPagoQrChargeOutcome>;
  abandon: (paymentTransactionId: string) => Promise<AbandonMercadoPagoQrChargeOutcome>;
  onCancelled: () => void;
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
  abandon,
  onCancelled,
  onChooseAnotherMethod,
  onCompleted,
  onPartiallyPaid,
  onSaleUnavailable,
  onSessionInvalid,
}: QrPaymentWaitModalProps) {
  const abandonment = useAbandonQrChargeMutation(abandon);
  const unanswered =
    abandonment.data?.kind === "unavailable" ||
    (abandonment.data?.kind === "already_paid" &&
      abandonment.data.settlement.kind === "unavailable");
  const abandoned = unanswered ? undefined : abandonment.data;
  const abandonFailed = abandonment.isError || unanswered;
  const charge = useQrChargeQuery({
    paymentTransactionId: order.payment_transaction_id,
    follow,
    following: !abandonment.isPending && abandoned === undefined,
  });
  const outcome = charge.status === "loaded" ? charge.value : undefined;
  const paidByAbandonment =
    abandoned?.kind === "already_paid" &&
    (abandoned.settlement.kind === "completed" || abandoned.settlement.kind === "partially_paid")
      ? abandoned.settlement
      : undefined;
  const paidByFollowing =
    outcome?.kind === "completed" || outcome?.kind === "partially_paid" ? outcome : undefined;
  const paidCharge: PaidQrCharge | undefined = paidByAbandonment ?? paidByFollowing;
  const [retried, setRetried] = useState(false);

  function abandonOrder() {
    abandonment.mutate(order.payment_transaction_id);
  }

  const leaveWhenSettled = useEffectEvent((settled: FollowedQrCharge, alreadyPaid: boolean) => {
    switch (settled.kind) {
      case "not_pending":
        if (alreadyPaid) {
          onChooseAnotherMethod();
        } else {
          onSaleUnavailable();
        }
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
      case "completed":
      case "partially_paid":
      case "waiting":
      case "wait_over":
      case "expiry_unconfirmed":
      case "declined":
        break;
    }
  });

  const leaveWhenAbandoned = useEffectEvent((answer: AbandonMercadoPagoQrChargeOutcome) => {
    switch (answer.kind) {
      case "cancelled":
        onCancelled();
        break;
      case "already_paid":
        if (answer.settlement.kind !== "unavailable") {
          leaveWhenSettled(answer.settlement, true);
        }
        break;
      case "not_pending":
        onChooseAnotherMethod();
        break;
      case "closed":
      case "replaced":
      case "unavailable":
        break;
      default:
        leaveWhenSettled(answer, false);
    }
  });

  useEffect(() => {
    if (outcome !== undefined) {
      leaveWhenSettled(outcome, false);
    }
  }, [outcome]);

  useEffect(() => {
    if (abandonment.data !== undefined) {
      leaveWhenAbandoned(abandonment.data);
    }
  }, [abandonment.data]);

  if (abandoned?.kind === "closed") {
    return (
      <EndedModal
        tone="info"
        icon={<Lock />}
        title="La orden QR ya estaba cerrada"
        lines={["No se cobró nada con el QR. Elegí otro medio."]}
        onChooseAnotherMethod={onChooseAnotherMethod}
      />
    );
  }
  if (abandoned?.kind === "replaced") {
    return (
      <EndedModal
        tone="warning"
        icon={<TriangleAlert />}
        title="No se pudo confirmar la cancelación del QR"
        lines={[
          "Podés cobrar con otro medio y completar la venta.",
          "Si el cliente paga el QR después, se crea una tarea de reembolso para confirmar.",
        ]}
        onChooseAnotherMethod={onChooseAnotherMethod}
      />
    );
  }

  if (paidCharge !== undefined) {
    return (
      <PaidModal
        amount={order.amount}
        pending={paidCharge.kind === "partially_paid" ? paidCharge.pending : undefined}
        onContinue={() =>
          paidCharge.kind === "completed"
            ? onCompleted({ ...paidCharge, amount: order.amount })
            : void onPartiallyPaid()
        }
      />
    );
  }

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
        lines={["El cliente no pagó a tiempo y Mercado Pago ya no acepta pagos de esta orden."]}
        onChooseAnotherMethod={onChooseAnotherMethod}
      />
    );
  }
  if (outcome?.kind === "expiry_unconfirmed") {
    return (
      <EndedModal
        tone="warning"
        icon={<TriangleAlert />}
        title="No se pudo confirmar el vencimiento del QR"
        lines={[
          "No se pudo leer la orden en Mercado Pago, así que no se sabe si el cliente pagó.",
          "Al elegir otro medio, primero se cancela la orden QR.",
        ]}
        onChooseAnotherMethod={abandonOrder}
        abandoning={abandonment.isPending}
        abandonFailed={abandonFailed}
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
      footer={
        <Button
          size="large"
          variant="secondary"
          fullWidth
          icon={<ArrowRight />}
          dataStatus={abandonment.isPending ? "loading" : "loaded"}
          onPress={abandonOrder}
        >
          Cobrar con otro medio
        </Button>
      }
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
              totalSeconds={order.remaining_seconds}
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
                  detail:
                    remainingSeconds === 0
                      ? "Confirmando con Mercado Pago que la orden venció"
                      : "Escanea el QR del mostrador con su app",
                  state: "current",
                },
                { id: "payment-approved", label: "Pago aprobado", state: "upcoming" },
              ]}
            />
          </div>
        )}
        {abandonFailed ? <AbandonFailedNotice /> : null}
        <InlineNotice
          tone="info"
          icon={<Info />}
          title="Al llegar a cero, la orden vence y el cliente ya no puede pagarla."
        />
      </div>
    </Modal>
  );
}

function PaidModal({
  amount,
  pending,
  onContinue,
}: {
  amount: number;
  pending: number | undefined;
  onContinue: () => void;
}) {
  return (
    <Modal
      open
      onOpenChange={() => undefined}
      width="standard"
      tone="success"
      icon={<CircleCheck />}
      context="QR DE MERCADO PAGO"
      contextTone="success"
      title="El cliente pagó el QR"
      closable={false}
      footer={
        <Button size="large" fullWidth icon={<ArrowRight />} onPress={onContinue}>
          Continuar
        </Button>
      }
    >
      <SummaryRowGroup
        rows={[
          { label: "Pagado con QR", value: formatCents(amount) },
          ...(pending === undefined
            ? []
            : [{ label: "Falta cobrar", value: formatCents(pending) }]),
        ]}
      />
    </Modal>
  );
}

function AbandonFailedNotice() {
  return (
    <InlineNotice
      tone="error"
      icon={<TriangleAlert />}
      title="No se pudo cancelar la orden QR. Volvé a intentarlo en unos segundos."
    />
  );
}

function EndedModal({
  tone,
  icon,
  title,
  lines,
  onChooseAnotherMethod,
  abandoning = false,
  abandonFailed = false,
}: {
  tone: "error" | "warning" | "info";
  icon: Icon;
  title: string;
  lines: readonly [string] | readonly [string, string];
  onChooseAnotherMethod: () => void;
  abandoning?: boolean;
  abandonFailed?: boolean;
}) {
  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next && !abandoning) {
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
        <Button
          size="large"
          fullWidth
          icon={<ArrowRight />}
          dataStatus={abandoning ? "loading" : "loaded"}
          onPress={onChooseAnotherMethod}
        >
          Elegir otro medio
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-body text-text">{lines[0]}</p>
        {lines[1] === undefined ? null : <p className="text-detail text-text-subtle">{lines[1]}</p>}
        {abandonFailed ? <AbandonFailedNotice /> : null}
      </div>
    </Modal>
  );
}
