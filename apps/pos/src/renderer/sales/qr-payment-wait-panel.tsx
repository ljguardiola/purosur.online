import type {
  AbandonMercadoPagoChargeOutcome,
  FollowMercadoPagoChargeOutcome,
} from "@purosur/contracts";
import type { Icon } from "@purosur/ui";
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
import { ArrowRight, CircleX, Lock, QrCode, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useEffectEvent, useState } from "react";
import { useKeys } from "../platform/key-layer";
import { MercadoPagoPaidPanel } from "./mercado-pago-paid-panel";
import type { ShownQrOrder } from "./qr-charge-panel";
import type { FollowedQrCharge } from "./sales-queries";
import { useAbandonQrChargeMutation, useQrChargeQuery } from "./sales-queries";

export type CompletedQrPayment = Extract<FollowMercadoPagoChargeOutcome, { kind: "completed" }> & {
  amount: number;
};

type PaidQrCharge = Extract<FollowedQrCharge, { kind: "completed" | "partially_paid" }>;

export type QrPaymentWaitPanelProps = {
  order: ShownQrOrder;
  follow: (paymentTransactionId: string) => Promise<FollowMercadoPagoChargeOutcome>;
  abandon: (paymentTransactionId: string) => Promise<AbandonMercadoPagoChargeOutcome>;
  onCancelled: () => void;
  onChooseAnotherMethod: () => void;
  onCompleted: (payment: CompletedQrPayment) => void;
  onRegenerate: (amount: number) => void;
  onPartiallyPaid: () => Promise<void>;
  onSaleUnavailable: () => void;
  onSessionInvalid: () => void;
};

export function QrPaymentWaitPanel({
  order,
  follow,
  abandon,
  onCancelled,
  onChooseAnotherMethod,
  onCompleted,
  onRegenerate,
  onPartiallyPaid,
  onSaleUnavailable,
  onSessionInvalid,
}: QrPaymentWaitPanelProps) {
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
      case "expiry_unconfirmed":
      case "declined":
        break;
    }
  });

  const leaveWhenAbandoned = useEffectEvent((answer: AbandonMercadoPagoChargeOutcome) => {
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
        chooseAnotherMethodUnlessPaid();
        break;
      case "closed":
      case "replaced":
      case "unreachable":
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

  const amount = order.amount;
  const regenerate = () => onRegenerate(amount);

  if (abandoned?.kind === "closed") {
    return (
      <EndedPanel
        amount={amount}
        tone="info"
        icon={<Lock />}
        title="La orden QR ya estaba cerrada"
        description="No se cobró nada con el QR. Elegí otro medio."
        buttonLabel="Cambiar de medio"
        onLeave={onChooseAnotherMethod}
      />
    );
  }
  if (abandoned?.kind === "replaced") {
    return (
      <EndedPanel
        amount={amount}
        tone="warning"
        icon={<TriangleAlert />}
        title="No se pudo confirmar la cancelación del QR"
        description="Podés cobrar con otro medio y completar la venta. Si el cliente paga el QR después, se crea una tarea de reembolso para confirmar."
        buttonLabel="Cobrar con otro medio"
        onLeave={onChooseAnotherMethod}
      />
    );
  }

  if (paidCharge !== undefined) {
    return (
      <>
        <IgnoredEscape />
        <MercadoPagoPaidPanel
          icon={<QrCode />}
          title="QR"
          paidLabel="Pagado con QR"
          amount={amount}
          pending={paidCharge.kind === "partially_paid" ? paidCharge.pending : undefined}
          onContinue={() =>
            paidCharge.kind === "completed"
              ? onCompleted({ ...paidCharge, amount })
              : void onPartiallyPaid()
          }
        />
      </>
    );
  }

  if (outcome?.kind === "declined") {
    return (
      <EndedPanel
        amount={amount}
        tone="error"
        icon={<CircleX />}
        title="Mercado Pago rechazó el pago"
        description="El pago del QR no se aprobó, así que no se cobró nada."
        buttonLabel="Cambiar de medio"
        onRegenerate={regenerate}
        onLeave={onChooseAnotherMethod}
      />
    );
  }
  if (outcome?.kind === "wait_over") {
    return (
      <EndedPanel
        amount={amount}
        tone="warning"
        icon={<TriangleAlert />}
        title="Venció la espera del QR"
        description="El cliente ya no puede pagar esta orden."
        buttonLabel="Cambiar de medio"
        onRegenerate={regenerate}
        onLeave={onChooseAnotherMethod}
      />
    );
  }
  if (outcome?.kind === "expiry_unconfirmed") {
    return (
      <EndedPanel
        amount={amount}
        tone="warning"
        icon={<TriangleAlert />}
        title="No se pudo confirmar el vencimiento del QR"
        description="No se pudo leer la orden en Mercado Pago, así que no se sabe si el cliente pagó. Al elegir otro medio, primero se cancela la orden QR."
        buttonLabel="Cambiar de medio"
        onLeave={abandonOrder}
        leaving={abandonment.isPending}
        abandonFailed={abandonFailed}
      />
    );
  }

  const remainingSeconds =
    outcome?.kind === "waiting" ? outcome.remaining_seconds : order.remaining_seconds;

  return (
    <QrPanel
      header={
        <SidePanelTitle
          icon={<QrCode />}
          title="QR"
          closeLabel="Cambiar de medio"
          closeDisabled={abandonment.isPending}
          onClose={abandonOrder}
        />
      }
      footer={
        abandonFailed ? (
          <LeaveButton
            label="Cambiar de medio"
            loading={abandonment.isPending}
            onPress={abandonOrder}
          />
        ) : undefined
      }
    >
      <WaitKeys
        abandonFailed={abandonFailed}
        abandoning={abandonment.isPending}
        onAbandon={abandonOrder}
      />
      <FigureStat size="hero" label="A COBRAR" value={formatCents(amount)} />
      {abandonFailed ? (
        <AbandonFailedNotice />
      ) : charge.status === "failed" ? (
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
        <>
          <CountdownCard
            remainingSeconds={remainingSeconds}
            totalSeconds={order.wait_seconds}
            label="TIEMPO PARA PAGAR"
          />
          <ProgressSteps
            steps={[
              {
                id: "order-created",
                label: `Orden creada por ${formatCents(amount)}`,
                state: "done",
              },
              {
                id: "customer-paying",
                label: "Esperando que el cliente pague",
                ...(remainingSeconds === 0
                  ? { detail: "Confirmando con Mercado Pago que la orden venció" }
                  : {}),
                state: "current",
              },
              { id: "payment-approved", label: "Pago aprobado", state: "upcoming" },
            ]}
          />
        </>
      )}
    </QrPanel>
  );
}

function WaitKeys({
  abandonFailed,
  abandoning,
  onAbandon,
}: {
  abandonFailed: boolean;
  abandoning: boolean;
  onAbandon: () => void;
}) {
  useKeys([
    {
      key: "Escape",
      run: () => {
        if (!abandoning) {
          onAbandon();
        }
      },
    },
  ]);
  useKeys([{ key: "Enter", run: onAbandon, enabled: abandonFailed && !abandoning }], {
    fallback: true,
  });
  return null;
}

function IgnoredEscape() {
  useKeys([{ key: "Escape", run: () => {} }]);
  return null;
}

function AbandonFailedNotice() {
  return (
    <InlineNotice
      tone="error"
      icon={<CircleX />}
      title="No se pudo cancelar la orden QR. Volvé a intentarlo en unos segundos."
    />
  );
}

function QrPanel({
  header,
  footer,
  children,
}: {
  header: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SidePanel label="Cobro con QR" width="wide" header={header} footer={footer}>
      {children}
    </SidePanel>
  );
}

function LeaveButton({
  label,
  loading,
  onPress,
}: {
  label: string;
  loading: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      size="large"
      fullWidth
      icon={<ArrowRight />}
      iconPosition="start"
      keycap="Enter"
      dataStatus={loading ? "loading" : "loaded"}
      onPress={onPress}
    >
      {label}
    </Button>
  );
}

function EndedPanel({
  amount,
  tone,
  icon,
  title,
  description,
  buttonLabel,
  onRegenerate,
  onLeave,
  leaving = false,
  abandonFailed = false,
}: {
  amount: number;
  tone: "error" | "warning" | "info";
  icon: Icon;
  title: string;
  description: string;
  buttonLabel: string;
  onRegenerate?: () => void;
  onLeave: () => void;
  leaving?: boolean;
  abandonFailed?: boolean;
}) {
  useKeys([
    {
      key: "Escape",
      run: () => {
        if (!leaving) {
          onLeave();
        }
      },
    },
    ...(onRegenerate === undefined ? [] : [{ key: "F2" as const, run: onRegenerate }]),
  ]);
  useKeys([{ key: "Enter", run: onLeave, enabled: !leaving }], { fallback: true });

  return (
    <QrPanel
      header={
        <SidePanelTitle
          icon={<QrCode />}
          title="QR"
          closeLabel="Cambiar de medio"
          closeDisabled={leaving}
          onClose={onLeave}
        />
      }
      footer={<LeaveButton label={buttonLabel} loading={leaving} onPress={onLeave} />}
    >
      <FigureStat size="hero" label="A COBRAR" value={formatCents(amount)} />
      <InlineNotice tone={tone} icon={icon} title={title} description={description} />
      {onRegenerate === undefined ? null : (
        <div className="flex">
          <Button variant="text" keycap="F2" onPress={onRegenerate}>
            Volver a generar el QR
          </Button>
        </div>
      )}
      {abandonFailed ? <AbandonFailedNotice /> : null}
    </QrPanel>
  );
}
