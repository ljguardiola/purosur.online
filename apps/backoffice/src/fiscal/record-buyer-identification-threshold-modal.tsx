import {
  type BuyerIdentificationThresholdRecordBody,
  buyerIdentificationThresholdRecordBodySchema,
} from "@purosur/contracts";
import { Button, formatCents, InlineNotice, Modal, useRequestForm } from "@purosur/ui";
import type { startAuthentication } from "@simplewebauthn/browser";
import { Check, Landmark, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { formatDisplayDate } from "../platform/display-date";
import { useAuthorization } from "../platform/authorization-modal";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import type {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import type {
  BuyerIdentificationThresholds,
  RecordBuyerIdentificationThresholdOutcome,
  recordBuyerIdentificationThreshold,
  ShownBuyerIdentificationThreshold,
} from "./buyer-identification-threshold-api";
import {
  amountMessage,
  beforeTodayMessage,
  EMPTY_THRESHOLD_FORM,
  thresholdRequestFrom,
  validFromMessage,
} from "./buyer-identification-threshold-form";

export type RecordBuyerIdentificationThresholdModalServices = {
  recordBuyerIdentificationThreshold: typeof recordBuyerIdentificationThreshold;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

type RecordBuyerIdentificationThresholdModalProps = {
  open: boolean;
  onClose: () => void;
  onRecorded: (threshold: ShownBuyerIdentificationThreshold) => void;
  reload: () => Promise<CloudReadOutcome<BuyerIdentificationThresholds>>;
  onSessionEnded: () => void;
  services: RecordBuyerIdentificationThresholdModalServices;
};

type LowerAmountConfirmation = {
  request: BuyerIdentificationThresholdRecordBody;
  inEffectAmount: number;
  amount: number;
  validFrom: string;
};

export function RecordBuyerIdentificationThresholdModal({
  open,
  onClose,
  onRecorded,
  reload,
  onSessionEnded,
  services,
}: RecordBuyerIdentificationThresholdModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const {
    recordBuyerIdentificationThreshold,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const [attemptFailed, setAttemptFailed] = useState(false);
  const [confirmation, setConfirmation] = useState<LowerAmountConfirmation | null>(null);
  const [confirming, setConfirming] = useState(false);
  const { run, modal } = useAuthorization<RecordBuyerIdentificationThresholdOutcome>({
    actionName: "Cargar un umbral nuevo",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });
  async function finish(outcome: RecordBuyerIdentificationThresholdOutcome): Promise<boolean> {
    if (outcome.kind === "ok") {
      await reload();
      onRecorded(outcome.value);
      return true;
    }
    if (outcome.kind === "unauthenticated") {
      onSessionEnded();
      return true;
    }
    if (outcome.kind === "forbidden") {
      sendToMyAccount();
      return true;
    }
    return false;
  }

  const { form, submit, submitting, reset } = useRequestForm({
    defaultValues: EMPTY_THRESHOLD_FORM,
    request: {
      schema: buyerIdentificationThresholdRecordBodySchema,
      from: thresholdRequestFrom,
    },
    fields: { amount: "amount", valid_from: "validFrom", confirm_lower_than_in_effect: null },
    messages: { amount: amountMessage, validFrom: validFromMessage },
    onSubmit: async (request, { values, showFieldError, showWireFieldError }) => {
      setAttemptFailed(false);
      const outcome = await run(() => recordBuyerIdentificationThreshold(request));
      if (outcome.kind === "cancelled" || (await finish(outcome))) {
        return;
      }
      if (outcome.kind === "needs_confirmation") {
        setConfirmation({
          request,
          inEffectAmount: outcome.inEffectAmount,
          amount: outcome.amount,
          validFrom: outcome.validFrom,
        });
        return;
      }
      if (outcome.kind === "before_today") {
        const thresholds = await reload();
        showFieldError(
          "validFrom",
          thresholds.kind === "ok"
            ? beforeTodayMessage(thresholds.value.earliestValidFrom)
            : validFromMessage(values),
        );
        return;
      }
      if (outcome.kind === "validation_failed" && showWireFieldError(outcome.field)) {
        return;
      }
      setAttemptFailed(true);
    },
  });

  async function confirmLowerAmount() {
    if (confirmation === null) {
      return;
    }
    setConfirming(true);
    const outcome = await run(() =>
      recordBuyerIdentificationThreshold({
        ...confirmation.request,
        confirm_lower_than_in_effect: true,
      }),
    );
    if (outcome.kind === "cancelled") {
      setConfirming(false);
      return;
    }
    if (!(await finish(outcome))) {
      setAttemptFailed(true);
    }
    setConfirmation(null);
    setConfirming(false);
  }

  useEffect(() => {
    if (!open) {
      reset();
      setAttemptFailed(false);
      setConfirmation(null);
    }
  }, [open, reset]);

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        width="standard"
        tone="info"
        icon={<Landmark />}
        context="Configuración fiscal"
        title="Cargar un umbral nuevo"
        closable
        footer={
          <>
            <Button
              variant="secondary"
              size="large"
              icon={<X />}
              disabled={submitting}
              onPress={onClose}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="large"
              icon={<Check />}
              fullWidth
              disabled={submitting}
              onPress={() => void submit()}
            >
              Cargar el umbral
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {attemptFailed ? (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo cargar el umbral"
              description="Probá de nuevo."
            />
          ) : null}
          <form.AppField name="amount">
            {(field) => <field.TextField kind="price" label="Importe" prefix="$" required />}
          </form.AppField>
          <form.AppField name="validFrom">
            {(field) => <field.DateField label="Vigente desde" required />}
          </form.AppField>
        </div>
      </Modal>
      <Modal
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmation(null);
          }
        }}
        width="confirmation"
        tone="warning"
        icon={<TriangleAlert />}
        title="¿Cargar un umbral menor que el vigente?"
        closable
        footer={
          <>
            <Button
              variant="secondary"
              size="large"
              icon={<X />}
              disabled={confirming}
              onPress={() => setConfirmation(null)}
            >
              Volver
            </Button>
            <Button
              variant="primary"
              size="large"
              icon={<Check />}
              fullWidth
              disabled={confirming}
              onPress={() => void confirmLowerAmount()}
            >
              Cargar igual
            </Button>
          </>
        }
      >
        {confirmation ? (
          <p className="text-body text-text">
            {`El umbral vigente es ${formatCents(confirmation.inEffectAmount)}. El nuevo, de ${formatCents(confirmation.amount)}, rige desde el ${formatDisplayDate(confirmation.validFrom)}.`}
          </p>
        ) : null}
      </Modal>
      {modal}
    </>
  );
}
