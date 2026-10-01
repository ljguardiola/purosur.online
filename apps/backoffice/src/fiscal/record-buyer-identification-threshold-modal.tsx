import { buyerIdentificationThresholdRecordBodySchema } from "@purosur/contracts";
import type { BuyerIdentificationThreshold } from "@purosur/domain";
import { Button, InlineNotice, Modal, useRequestForm } from "@purosur/ui";
import type { startAuthentication } from "@simplewebauthn/browser";
import { Check, Landmark, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
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
} from "./buyer-identification-threshold-api";
import {
  amountMessage,
  EMPTY_THRESHOLD_FORM,
  notAfterLatestMessage,
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
  onRecorded: (threshold: BuyerIdentificationThreshold) => void;
  reload: () => Promise<CloudReadOutcome<BuyerIdentificationThresholds>>;
  onSessionEnded: () => void;
  services: RecordBuyerIdentificationThresholdModalServices;
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
  const { run, modal } = useAuthorization<RecordBuyerIdentificationThresholdOutcome>({
    actionName: "Cargar un umbral nuevo",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });
  const { form, submit, submitting, reset } = useRequestForm({
    defaultValues: EMPTY_THRESHOLD_FORM,
    request: {
      schema: buyerIdentificationThresholdRecordBodySchema,
      from: thresholdRequestFrom,
    },
    fields: { amount: "amount", valid_from: "validFrom" },
    messages: { amount: amountMessage, validFrom: validFromMessage },
    onSubmit: async (request, { values, showFieldError, showWireFieldError }) => {
      setAttemptFailed(false);
      const outcome = await run(() => recordBuyerIdentificationThreshold(request));
      if (outcome.kind === "cancelled") {
        return;
      }
      if (outcome.kind === "ok") {
        await reload();
        onRecorded(outcome.value);
        return;
      }
      if (outcome.kind === "unauthenticated") {
        onSessionEnded();
        return;
      }
      if (outcome.kind === "forbidden") {
        sendToMyAccount();
        return;
      }
      if (outcome.kind === "not_after_latest") {
        const thresholds = await reload();
        const latestValidFrom = thresholds.kind === "ok" ? thresholds.value.latestValidFrom : null;
        showFieldError(
          "validFrom",
          latestValidFrom ? notAfterLatestMessage(latestValidFrom) : validFromMessage(values),
        );
        return;
      }
      if (outcome.kind === "validation_failed" && showWireFieldError(outcome.field)) {
        return;
      }
      setAttemptFailed(true);
    },
  });

  useEffect(() => {
    if (!open) {
      reset();
      setAttemptFailed(false);
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
      {modal}
    </>
  );
}
