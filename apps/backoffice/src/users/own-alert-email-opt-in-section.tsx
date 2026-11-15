import { Button, InlineNotice, LoadFailure, LoadingPlaceholder } from "@purosur/ui";
import { Mail, MailX, ShieldX } from "lucide-react";
import { useState } from "react";
import { ActionFailureNotice } from "../platform/action-failure-notice";
import { useAuthorization } from "../platform/authorization-modal";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { retryAfterDetail } from "../platform/retry-after-detail";
import type { ChangeOwnAlertEmailOptInOutcome } from "./alert-email-opt-in-api";
import { alertEmailOptInText } from "./alert-email-opt-in-text";
import type { OwnAlertEmailOptInSectionServices } from "./own-alert-email-opt-in-section-services";
import { useOwnAlertEmailOptInQuery, useRefreshUsers } from "./users-queries";

export type OwnAlertEmailOptInSectionProps = {
  onSessionEnded: () => void;
  services: OwnAlertEmailOptInSectionServices;
};

type Refusal = { kind: "failed" } | { kind: "rate_limited"; retryAfterSeconds: number };

export function OwnAlertEmailOptInSection({
  onSessionEnded,
  services,
}: OwnAlertEmailOptInSectionProps) {
  const {
    fetchOwnAlertEmailOptIn,
    recordOwnAlertEmailOptIn,
    withdrawOwnAlertEmailOptIn,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const data = useOwnAlertEmailOptInQuery({ fetchOwnAlertEmailOptIn, onSessionEnded });
  const refreshUsers = useRefreshUsers();
  const [submitting, setSubmitting] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const authorizationServices = {
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  };
  const recording = useAuthorization<ChangeOwnAlertEmailOptInOutcome>({
    actionName: "Recibir alertas por email",
    onSessionEnded,
    services: authorizationServices,
  });
  const withdrawing = useAuthorization<ChangeOwnAlertEmailOptInOutcome>({
    actionName: "Dejar de recibir alertas por email",
    onSessionEnded,
    services: authorizationServices,
  });

  async function change(
    authorization: typeof recording,
    attempt: () => Promise<ChangeOwnAlertEmailOptInOutcome>,
  ) {
    setRefusal(null);
    setSubmitting(true);
    const outcome = await authorization.run(attempt);
    if (outcome.kind === "ok") {
      await refreshUsers();
    } else if (outcome.kind === "unauthenticated") {
      onSessionEnded();
    } else if (outcome.kind === "rate_limited") {
      setRefusal(outcome);
    } else if (outcome.kind !== "cancelled") {
      setRefusal({ kind: "failed" });
    }
    setSubmitting(false);
  }

  const optedInAt = data.status === "loaded" ? data.value.optedInAt : null;
  const receives = optedInAt !== null;

  return (
    <>
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-subheading text-text-accent">Alertas por email</h2>
        {data.status === "loading" && <LoadingPlaceholder variant="card" lines={2} />}
        {data.status === "failed" && (
          <LoadFailure {...cloudLoadFailure(data, "tus alertas por email")} />
        )}
        {data.status === "loaded" && (
          <p className="font-semibold text-body text-text">{alertEmailOptInText(optedInAt)}</p>
        )}
        {refusal?.kind === "failed" && (
          <ActionFailureNotice title="No se pudo cambiar si recibís alertas por email" />
        )}
        {refusal?.kind === "rate_limited" && (
          <InlineNotice
            tone="error"
            icon={<ShieldX />}
            title="Demasiadas solicitudes"
            description={retryAfterDetail(refusal.retryAfterSeconds)}
          />
        )}
        <div>
          {receives ? (
            <Button
              variant="secondary"
              icon={<MailX />}
              dataStatus={data.status}
              disabled={submitting}
              onPress={() => void change(withdrawing, withdrawOwnAlertEmailOptIn)}
            >
              Dejar de recibir alertas por email
            </Button>
          ) : (
            <Button
              variant="secondary"
              icon={<Mail />}
              dataStatus={data.status}
              disabled={submitting}
              onPress={() => void change(recording, recordOwnAlertEmailOptIn)}
            >
              Recibir alertas por email
            </Button>
          )}
        </div>
      </div>
      {recording.modal}
      {withdrawing.modal}
    </>
  );
}
