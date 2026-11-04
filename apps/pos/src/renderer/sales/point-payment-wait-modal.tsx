import type {
  AbandonMercadoPagoChargeOutcome,
  FollowMercadoPagoChargeOutcome,
} from "@purosur/contracts";
import type { PointCardType } from "@purosur/domain";
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
import { ArrowLeft, ArrowRight, CircleX, CreditCard, TimerOff, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useEffectEvent, useState } from "react";
import { pointCardName } from "../platform/payment-method-names";
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
  cardType: PointCardType | null;
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
  cardType,
  follow,
  abandon,
  onChooseAnotherMethod,
  onCompleted,
  onPartiallyPaid,
  onSaleUnavailable,
  onSessionInvalid,
}: PointPaymentWaitModalProps) {
  const context = pointCardName(cardType).toUpperCase();
  const abandonment = useAbandonQrChargeMutation(abandon);
  const answer = abandonment.data;
  const unanswered =
    answer?.kind === "unavailable" ||
    (answer?.kind === "already_paid" && answer.settlement.kind === "unavailable");
  const abandoned = unanswered ? undefined : answer;
  const abandonFailed = abandonment.isError || unanswered;
  const charge = useQrChargeQuery({
    paymentTransactionId: order.payment_transaction_id,
    follow,
    following:
      !abandonment.isPending && (abandoned === undefined || abandoned.kind === "unreachable"),
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
        onChooseAnotherMethod();
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
      case "replaced":
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
        context={context}
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
        context={context}
        title="La terminal rechazó el pago"
        reason="El pago no se aprobó en la terminal, así que no se cobró nada."
        onChooseAnotherMethod={onChooseAnotherMethod}
      />
    );
  }

  if (outcome?.kind === "expired") {
    return (
      <TerminalOrderEndedModal
        context={context}
        title="El cobro venció en la terminal"
        reason="No se cobró nada."
        onChooseAnotherMethod={onChooseAnotherMethod}
      />
    );
  }

  const remainingSeconds =
    outcome?.kind === "waiting" ? outcome.remaining_seconds : order.remaining_seconds;

  if (waitedOut) {
    return (
      <WaitOverModal
        context={context}
        total={total}
        paid={paid}
        amount={order.amount}
        totalSeconds={order.wait_seconds}
        abandoning={abandonment.isPending}
        unreachable={abandoned?.kind === "unreachable"}
        abandonFailed={abandonFailed}
        followFailure={followFailure}
        onChooseAnotherMethod={abandonOrder}
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
      context={context}
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
                  detail: "Tarjeta, en la terminal",
                  state: "current",
                },
                { id: "payment-approved", label: "Pago aprobado", state: "upcoming" },
              ]}
            />
          </div>
        )}
        {abandoned?.kind === "unreachable" || order.kind === "order_unconfirmed" ? (
          <NoCloudConnectionNotice />
        ) : null}
        {abandonFailed ? <AbandonFailedNotice /> : null}
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

function WaitOverModal({
  context,
  total,
  paid,
  amount,
  totalSeconds,
  abandoning,
  unreachable,
  abandonFailed,
  followFailure,
  onChooseAnotherMethod,
}: {
  context: string;
  total: number;
  paid: number;
  amount: number;
  totalSeconds: number;
  abandoning: boolean;
  unreachable: boolean;
  abandonFailed: boolean;
  followFailure: ReactNode;
  onChooseAnotherMethod: () => void;
}) {
  return (
    <Modal
      open
      onOpenChange={() => undefined}
      width="standard"
      tone="error"
      icon={<TimerOff />}
      context={context}
      contextTone="error"
      title="Se terminó el tiempo de espera"
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
      <div className="flex flex-col gap-5">
        <PointSaleSummary total={total} paid={paid} amount={amount} />
        {followFailure ?? (
          <div className="flex items-center gap-6">
            <CountdownRing
              remainingSeconds={0}
              totalSeconds={totalSeconds}
              label="Tiempo para pagar"
            />
            <ProgressSteps
              steps={[SENT_STEP, { id: "wait-over", label: "Tiempo agotado", state: "error" }]}
            />
          </div>
        )}
        {abandonFailed ? <AbandonFailedNotice /> : null}
        {unreachable ? (
          <NoCloudConnectionNotice />
        ) : (
          <InlineNotice
            tone="warning"
            icon={<TriangleAlert />}
            title="Cancelá el cobro en la terminal"
          />
        )}
      </div>
    </Modal>
  );
}

function NoCloudConnectionNotice() {
  return (
    <InlineNotice
      tone="warning"
      icon={<TriangleAlert />}
      title="No hay conexión con la nube. Cancelá el cobro en la terminal y esperá a que vuelva la conexión."
    />
  );
}

function AbandonFailedNotice() {
  return (
    <InlineNotice
      tone="error"
      icon={<TriangleAlert />}
      title="No se pudo cancelar el cobro de la terminal. Volvé a intentarlo en unos segundos."
    />
  );
}

function TerminalOrderEndedModal({
  context,
  title,
  reason,
  onChooseAnotherMethod,
}: {
  context: string;
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
      context={context}
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
