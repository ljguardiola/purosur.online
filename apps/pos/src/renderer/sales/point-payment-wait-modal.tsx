import type {
  AbandonMercadoPagoChargeOutcome,
  FollowMercadoPagoChargeOutcome,
} from "@purosur/contracts";
import type { Icon } from "@purosur/ui";
import {
  Button,
  CountdownRing,
  formatCents,
  HighlightedNotice,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  Modal,
  ProgressSteps,
  SummaryRowGroup,
} from "@purosur/ui";
import {
  ArrowLeft,
  ArrowRight,
  CircleX,
  CreditCard,
  Hourglass,
  Info,
  TimerOff,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useEffectEvent, useState } from "react";
import { MercadoPagoPaidModal } from "./mercado-pago-paid-modal";
import type { ShownPointOrder } from "./point-charge-modal";
import type { FollowedQrCharge } from "./sales-queries";
import { useAbandonQrChargeMutation, useQrChargeQuery } from "./sales-queries";

export type CompletedPointPayment = Extract<
  FollowMercadoPagoChargeOutcome,
  { kind: "completed" }
> & {
  amount: number;
};

type PaidPointCharge = Extract<FollowedQrCharge, { kind: "completed" | "partially_paid" }>;

export type PointPaymentWaitModalProps = {
  total: number;
  paid: number;
  order: ShownPointOrder;
  follow: (paymentTransactionId: string) => Promise<FollowMercadoPagoChargeOutcome>;
  abandon: (paymentTransactionId: string) => Promise<AbandonMercadoPagoChargeOutcome>;
  onChooseAnotherMethod: () => void;
  onCompleted: (payment: CompletedPointPayment) => void;
  onPartiallyPaid: () => Promise<void>;
  onSaleUnavailable: () => void;
  onSessionInvalid: () => void;
};

const SENT_STEP = {
  id: "charge-sent",
  label: "Cobro enviado a la terminal",
  state: "done",
} as const;

export function PointPaymentWaitModal({
  total,
  paid,
  order,
  follow,
  abandon,
  onChooseAnotherMethod,
  onCompleted,
  onPartiallyPaid,
  onSaleUnavailable,
  onSessionInvalid,
}: PointPaymentWaitModalProps) {
  const abandonment = useAbandonQrChargeMutation(abandon);
  const answer = abandonment.data;
  const unanswered =
    answer?.kind === "unavailable" ||
    (answer?.kind === "already_paid" && answer.settlement.kind === "unavailable");
  const abandoned = unanswered ? undefined : answer;
  const abandonFailed = abandonment.isError || unanswered;
  const cancelling = abandoned?.kind === "cancel_on_terminal";
  const charge = useQrChargeQuery({
    paymentTransactionId: order.payment_transaction_id,
    follow,
    following:
      !abandonment.isPending &&
      (abandoned === undefined || cancelling || abandoned.kind === "unreachable"),
  });
  const outcome = charge.status === "loaded" ? charge.value : undefined;
  const paidByAbandonment =
    abandoned?.kind === "already_paid" &&
    (abandoned.settlement.kind === "completed" || abandoned.settlement.kind === "partially_paid")
      ? abandoned.settlement
      : undefined;
  const paidByFollowing =
    outcome?.kind === "completed" || outcome?.kind === "partially_paid" ? outcome : undefined;
  const paidCharge: PaidPointCharge | undefined = paidByAbandonment ?? paidByFollowing;
  const [retried, setRetried] = useState(false);
  const [waitedOut, setWaitedOut] = useState(false);
  if (outcome?.kind === "at_terminal_wait_over" && !waitedOut) {
    setWaitedOut(true);
  }
  const awaitingCancellation = waitedOut || cancelling;

  function abandonOrder() {
    abandonment.mutate(order.payment_transaction_id);
  }

  function followAgain() {
    if (charge.status === "failed") {
      setRetried(true);
      charge.retry();
    }
  }

  const followFailure =
    charge.status === "failed" ? (
      <LoadFailure
        icon={<TriangleAlert />}
        title="No se pudo consultar el cobro en la terminal"
        description="Volvé a intentarlo en unos segundos."
        onRetry={followAgain}
      />
    ) : charge.status === "loading" && retried ? (
      <LoadingPlaceholder variant="card" lines={2} />
    ) : null;

  function chooseAnotherMethodUnlessPaid() {
    if (paidByFollowing === undefined) {
      onChooseAnotherMethod();
    }
  }

  const leaveWhenSettled = useEffectEvent((settled: FollowedQrCharge, alreadyPaid: boolean) => {
    switch (settled.kind) {
      case "not_pending":
        if (alreadyPaid) {
          chooseAnotherMethodUnlessPaid();
        } else {
          onSaleUnavailable();
        }
        break;
      case "closed":
        if (!awaitingCancellation) {
          onChooseAnotherMethod();
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
      case "expired":
      case "at_terminal_wait_over":
      case "expiry_unconfirmed":
      case "declined":
        break;
    }
  });

  const leaveWhenAbandoned = useEffectEvent((result: AbandonMercadoPagoChargeOutcome) => {
    switch (result.kind) {
      case "cancelled":
      case "closed":
        onChooseAnotherMethod();
        break;
      case "already_paid":
        if (result.settlement.kind !== "unavailable") {
          leaveWhenSettled(result.settlement, true);
        }
        break;
      case "not_pending":
        chooseAnotherMethodUnlessPaid();
        break;
      case "replaced":
      case "cancel_on_terminal":
      case "unreachable":
      case "unavailable":
        break;
      default:
        leaveWhenSettled(result, false);
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

  if (paidCharge !== undefined) {
    return (
      <MercadoPagoPaidModal
        context="POINT INTEGRADA"
        title="El cliente pagó en la terminal"
        paidLabel="Pagado con la Point"
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
      <TerminalOrderEndedModal
        title="La terminal rechazó el pago"
        reason="El pago no se aprobó en la terminal, así que no se cobró nada."
        onChooseAnotherMethod={onChooseAnotherMethod}
      />
    );
  }

  if (outcome?.kind === "expired") {
    return (
      <TerminalOrderEndedModal
        title="El cobro venció en la terminal"
        reason="No se cobró nada."
        onChooseAnotherMethod={onChooseAnotherMethod}
      />
    );
  }

  const remainingSeconds =
    outcome?.kind === "waiting" ? outcome.remaining_seconds : order.remaining_seconds;

  if (awaitingCancellation) {
    return (
      <AwaitingCancellationModal
        total={total}
        paid={paid}
        amount={order.amount}
        waitedOut={waitedOut}
        remainingSeconds={waitedOut ? 0 : remainingSeconds}
        totalSeconds={order.wait_seconds}
        closed={outcome?.kind === "closed"}
        followFailure={followFailure}
        onChooseAnotherMethod={onChooseAnotherMethod}
      />
    );
  }

  return (
    <Modal
      open
      onOpenChange={() => undefined}
      width="standard"
      tone="info"
      icon={<CreditCard />}
      context="POINT INTEGRADA"
      contextTone="info"
      title="El cliente paga en la terminal"
      closable={false}
      footer={
        <Button
          size="large"
          variant="secondary"
          fullWidth
          icon={<ArrowLeft />}
          dataStatus={abandonment.isPending ? "loading" : "loaded"}
          onPress={abandonOrder}
        >
          Cambiar de medio
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <PointSaleSummary total={total} paid={paid} amount={order.amount} />
        {followFailure ?? (
          <div className="flex items-center gap-6">
            <CountdownRing
              remainingSeconds={remainingSeconds}
              totalSeconds={order.wait_seconds}
              label="Tiempo para pagar"
            />
            <ProgressSteps
              steps={[
                SENT_STEP,
                {
                  id: "customer-paying",
                  label: "Esperando el pago",
                  detail: "Tarjeta o QR, en la terminal",
                  state: "current",
                },
                { id: "payment-approved", label: "Pago aprobado", state: "upcoming" },
              ]}
            />
          </div>
        )}
        {abandoned?.kind === "unreachable" || order.kind === "order_unconfirmed" ? (
          <InlineNotice
            tone="warning"
            icon={<TriangleAlert />}
            title="No hay conexión con la nube. Cancelá el cobro en la terminal y esperá a que vuelva la conexión."
          />
        ) : null}
        {abandonFailed ? (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No se pudo cancelar el cobro de la terminal. Volvé a intentarlo en unos segundos."
          />
        ) : null}
        <HighlightedNotice
          tone="info"
          icon={<Info />}
          title="Para cambiar de medio, cancelá primero en la terminal"
          description="La caja no puede cancelar un cobro que ya está en la terminal."
        />
      </div>
    </Modal>
  );
}

function PointSaleSummary({
  total,
  paid,
  amount,
}: {
  total: number;
  paid: number;
  amount: number;
}) {
  return (
    <SummaryRowGroup
      rows={[
        { label: "Total de la venta", value: formatCents(total) },
        { label: "Pagado", value: formatCents(paid) },
        { label: "A cobrar ahora", value: formatCents(amount) },
      ]}
    />
  );
}

function AwaitingCancellationModal({
  total,
  paid,
  amount,
  waitedOut,
  remainingSeconds,
  totalSeconds,
  closed,
  followFailure,
  onChooseAnotherMethod,
}: {
  total: number;
  paid: number;
  amount: number;
  waitedOut: boolean;
  remainingSeconds: number;
  totalSeconds: number;
  closed: boolean;
  followFailure: ReactNode;
  onChooseAnotherMethod: () => void;
}) {
  const icon: Icon = waitedOut ? <TimerOff /> : <Hourglass />;
  return (
    <Modal
      open
      onOpenChange={() => undefined}
      width="standard"
      tone={waitedOut ? "error" : "warning"}
      icon={icon}
      context="POINT INTEGRADA"
      contextTone={waitedOut ? "error" : "warning"}
      title={
        waitedOut ? "Se terminó el tiempo de espera" : "Esperando la cancelación en la terminal"
      }
      closable={false}
      footer={
        <Button
          size="large"
          fullWidth
          icon={<ArrowRight />}
          disabled={!closed}
          onPress={onChooseAnotherMethod}
        >
          Elegir otro medio
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <PointSaleSummary total={total} paid={paid} amount={amount} />
        {followFailure ?? (
          <div className="flex items-center gap-6">
            <CountdownRing
              remainingSeconds={remainingSeconds}
              totalSeconds={totalSeconds}
              label="Tiempo para pagar"
            />
            <ProgressSteps
              steps={[
                SENT_STEP,
                ...(waitedOut
                  ? [{ id: "wait-over", label: "Tiempo agotado", state: "error" } as const]
                  : []),
                {
                  id: "awaiting-cancellation",
                  label: "Esperando la cancelación",
                  state: "current",
                },
              ]}
            />
          </div>
        )}
        <HighlightedNotice
          tone="warning"
          icon={<TriangleAlert />}
          title="Cancelá el cobro en la terminal"
          description="Otro medio se habilita recién cuando la terminal confirme la cancelación."
        />
      </div>
    </Modal>
  );
}

function TerminalOrderEndedModal({
  title,
  reason,
  onChooseAnotherMethod,
}: {
  title: string;
  reason: string;
  onChooseAnotherMethod: () => void;
}) {
  return (
    <Modal
      open
      onOpenChange={() => undefined}
      width="standard"
      tone="error"
      icon={<CircleX />}
      context="POINT INTEGRADA"
      contextTone="error"
      title={title}
      closable={false}
      footer={
        <Button size="large" fullWidth icon={<ArrowRight />} onPress={onChooseAnotherMethod}>
          Elegir otro medio
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-body text-text">{reason}</p>
        <p className="text-detail text-text-subtle">
          Se puede volver a intentar con la Point o cobrar con otro medio.
        </p>
      </div>
    </Modal>
  );
}
