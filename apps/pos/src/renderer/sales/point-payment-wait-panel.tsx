import type {
  AbandonMercadoPagoChargeOutcome,
  FollowMercadoPagoChargeOutcome,
} from "@purosur/contracts";
import type { PointCardType } from "@purosur/domain";
import {
  Button,
  CountdownCard,
  FigureStat,
  formatCents,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  ProgressSteps,
  SidePanel,
  SidePanelTitle,
} from "@purosur/ui";
import { ArrowRight, CircleX, CreditCard, TriangleAlert } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { useKeys } from "../platform/key-layer";
import { pointCardTitle } from "../platform/payment-method-names";
import { MercadoPagoPaidPanel } from "./mercado-pago-paid-panel";
import type { ShownPointOrder } from "./point-charge-panel";
import type { FollowedQrCharge } from "./sales-queries";
import { useAbandonQrChargeMutation, useQrChargeQuery } from "./sales-queries";

export type CompletedPointPayment = Extract<
  FollowMercadoPagoChargeOutcome,
  { kind: "completed" }
> & {
  amount: number;
};

type PaidPointCharge = Extract<FollowedQrCharge, { kind: "completed" | "partially_paid" }>;

export type PointPaymentWaitPanelProps = {
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

export function PointPaymentWaitPanel({
  order,
  cardType,
  follow,
  abandon,
  onChooseAnotherMethod,
  onCompleted,
  onPartiallyPaid,
  onSaleUnavailable,
  onSessionInvalid,
}: PointPaymentWaitPanelProps) {
  const name = pointCardTitle(cardType);
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

  const followFailed = charge.status === "failed";
  const retrying = charge.status === "loading" && retried;
  const ended = outcome?.kind === "declined" || outcome?.kind === "expired";
  const view: PanelView = ended
    ? "ended"
    : abandonFailed
      ? "abandon-failed"
      : followFailed || retrying
        ? "follow-failed"
        : waitedOut
          ? "wait-over"
          : "waiting";
  const noConnection = abandoned?.kind === "unreachable" || order.kind === "order_unconfirmed";
  const remainingSeconds =
    outcome?.kind === "waiting" ? outcome.remaining_seconds : order.remaining_seconds;
  const abandoning = abandonment.isPending;

  useKeys(
    [
      {
        key: "Escape",
        run: view === "ended" ? onChooseAnotherMethod : abandonOrder,
        enabled: !abandoning && paidCharge === undefined,
      },
      {
        key: "R",
        run: followAgain,
        enabled: view === "follow-failed" && followFailed,
      },
    ],
    { active: paidCharge === undefined },
  );
  useKeys(
    [
      {
        key: "Enter",
        run: view === "ended" ? onChooseAnotherMethod : abandonOrder,
        enabled:
          !abandoning && (view === "ended" || view === "wait-over" || view === "abandon-failed"),
      },
    ],
    { fallback: true, active: paidCharge === undefined },
  );

  if (paidCharge !== undefined) {
    const continueAfterPayment = () =>
      paidCharge.kind === "completed"
        ? onCompleted({ ...paidCharge, amount: order.amount })
        : void onPartiallyPaid();
    return (
      <MercadoPagoPaidPanel
        icon={<CreditCard />}
        title={name}
        paidLabel="Pagado con Point"
        amount={order.amount}
        pending={paidCharge.kind === "partially_paid" ? paidCharge.pending : undefined}
        onContinue={continueAfterPayment}
        onClose={continueAfterPayment}
      >
        <ProgressSteps steps={[{ id: "paid", label: "Pagado en la terminal", state: "done" }]} />
      </MercadoPagoPaidPanel>
    );
  }

  const closeLabelled = view === "waiting" || view === "abandon-failed" || view === "follow-failed";
  const endedNotice =
    outcome?.kind === "expired" ? (
      <InlineNotice
        tone="error"
        icon={<CircleX />}
        title="El cobro venció en la terminal"
        description="No se cobró nada."
      />
    ) : (
      <InlineNotice tone="error" icon={<CircleX />} title="Pago rechazado." />
    );

  return (
    <SidePanel
      label={`Cobro con ${name}`}
      width="wide"
      header={
        <SidePanelTitle
          icon={<CreditCard />}
          title={name}
          {...(closeLabelled ? { closeLabel: "Cambiar de medio" } : {})}
          closeDisabled={abandoning}
          onClose={view === "ended" ? onChooseAnotherMethod : abandonOrder}
        />
      }
      footer={
        view === "waiting" || view === "follow-failed" ? undefined : (
          <Button
            size="large"
            fullWidth
            icon={<ArrowRight />}
            iconPosition="start"
            keycap="Enter"
            dataStatus={abandoning ? "loading" : "loaded"}
            onPress={view === "ended" ? onChooseAnotherMethod : abandonOrder}
          >
            Cambiar de medio
          </Button>
        )
      }
    >
      <FigureStat size="hero" label="A COBRAR" value={formatCents(order.amount)} />
      {view === "ended" ? endedNotice : null}
      {view === "abandon-failed" ? <AbandonFailedNotice /> : null}
      {view === "follow-failed" ? (
        retrying ? (
          <LoadingPlaceholder variant="card" lines={2} />
        ) : (
          <LoadFailure
            variant="keyboard"
            keycap="R"
            icon={<CircleX />}
            title="No se pudo consultar el cobro en la terminal"
            description="Volvé a intentarlo en unos segundos."
            onRetry={followAgain}
          />
        )
      ) : null}
      {view === "waiting" ? (
        <>
          <CountdownCard
            label="TIEMPO PARA PAGAR"
            remainingSeconds={remainingSeconds}
            totalSeconds={order.wait_seconds}
          />
          <ProgressSteps
            steps={[
              SENT_STEP,
              { id: "customer-paying", label: "Esperando el pago", state: "current" },
              { id: "payment-approved", label: "Pago aprobado", state: "upcoming" },
            ]}
          />
          {noConnection ? <NoCloudConnectionNotice /> : null}
        </>
      ) : null}
      {view === "wait-over" ? (
        <>
          <CountdownCard
            label="TIEMPO PARA PAGAR"
            remainingSeconds={0}
            totalSeconds={order.wait_seconds}
            tone="error"
          />
          <ProgressSteps
            steps={[
              SENT_STEP,
              { id: "wait-over", label: "Tiempo de espera agotado", state: "error" },
            ]}
          />
          {noConnection ? (
            <NoCloudConnectionNotice />
          ) : (
            <InlineNotice
              tone="warning"
              icon={<TriangleAlert />}
              title="Cancelá el cobro en la terminal."
            />
          )}
        </>
      ) : null}
    </SidePanel>
  );
}

type PanelView = "waiting" | "wait-over" | "ended" | "abandon-failed" | "follow-failed";

function NoCloudConnectionNotice() {
  return (
    <InlineNotice
      tone="warning"
      icon={<TriangleAlert />}
      title="No hay conexión con la nube. Cancelá el cobro en la terminal."
    />
  );
}

function AbandonFailedNotice() {
  return (
    <InlineNotice
      tone="error"
      icon={<CircleX />}
      title="No se pudo cancelar el cobro de la terminal. Volvé a intentarlo en unos segundos."
    />
  );
}
