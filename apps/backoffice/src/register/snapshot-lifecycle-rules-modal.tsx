import { snapshotLifecycleRulesSchema } from "@purosur/contracts";
import { Button, InlineNotice, Modal, useRequestForm } from "@purosur/ui";
import type { startAuthentication } from "@simplewebauthn/browser";
import { Check, HardDriveDownload, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { useAuthorization } from "../platform/authorization-modal";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import type {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import type {
  ChangeSnapshotLifecycleRulesOutcome,
  changeSnapshotLifecycleRules,
  SnapshotLifecycleRules,
} from "./snapshot-backups-api";
import {
  EMPTY_SNAPSHOT_LIFECYCLE_RULES_FORM,
  SNAPSHOT_LIFECYCLE_RULES_MESSAGES,
  snapshotLifecycleRangeHint,
  snapshotLifecycleRulesFormValuesFrom,
  snapshotLifecycleRulesRequestFrom,
} from "./snapshot-lifecycle-rules-form";

export type SnapshotLifecycleRulesModalServices = {
  changeSnapshotLifecycleRules: typeof changeSnapshotLifecycleRules;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

type SnapshotLifecycleRulesModalProps = {
  open: boolean;
  rules: SnapshotLifecycleRules;
  onClose: () => void;
  onChanged: () => void;
  onSessionEnded: () => void;
  services: SnapshotLifecycleRulesModalServices;
};

export function SnapshotLifecycleRulesModal({
  open,
  rules,
  onClose,
  onChanged,
  onSessionEnded,
  services,
}: SnapshotLifecycleRulesModalProps) {
  const {
    changeSnapshotLifecycleRules,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const sendToMyAccount = useSendToMyAccount();
  const [notice, setNotice] = useState<
    { kind: "attemptFailed" } | { kind: "rateLimited"; retryAfterSeconds: number } | null
  >(null);
  const { run, modal } = useAuthorization<ChangeSnapshotLifecycleRulesOutcome>({
    actionName: "Cambiar las reglas de los backups",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });
  const { form, submit, submitting, reset } = useRequestForm({
    defaultValues: EMPTY_SNAPSHOT_LIFECYCLE_RULES_FORM,
    request: { schema: snapshotLifecycleRulesSchema, from: snapshotLifecycleRulesRequestFrom },
    fields: { hourly: "hourly", daily: "daily", monthly: "monthly" },
    messages: SNAPSHOT_LIFECYCLE_RULES_MESSAGES,
    onSubmit: async (request, { showWireFieldError }) => {
      setNotice(null);
      const outcome = await run(() => changeSnapshotLifecycleRules(request));
      if (outcome.kind === "cancelled") {
        return;
      }
      if (outcome.kind === "ok") {
        onChanged();
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
      if (outcome.kind === "validation_failed" && showWireFieldError(outcome.field)) {
        return;
      }
      if (outcome.kind === "rate_limited") {
        setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
        return;
      }
      setNotice({ kind: "attemptFailed" });
    },
  });
  const seed = useEffectEvent(() => reset(snapshotLifecycleRulesFormValuesFrom(rules)));

  useEffect(() => {
    if (open) {
      seed();
      setNotice(null);
    }
  }, [open]);

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
        icon={<HardDriveDownload />}
        context="Backups"
        title="Cambiar las reglas"
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
              Guardar las reglas
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {notice?.kind === "attemptFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudieron cambiar las reglas"
              description="Probá de nuevo."
            />
          )}
          {notice?.kind === "rateLimited" && (
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title="Demasiadas solicitudes"
              description={retryAfterDetail(notice.retryAfterSeconds)}
            />
          )}
          <form.AppField name="hourly">
            {(field) => (
              <field.TextField
                kind="plain-text"
                label="Por hora"
                description={snapshotLifecycleRangeHint("hourly")}
                required
              />
            )}
          </form.AppField>
          <form.AppField name="daily">
            {(field) => (
              <field.TextField
                kind="plain-text"
                label="Diarias"
                description={snapshotLifecycleRangeHint("daily")}
                required
              />
            )}
          </form.AppField>
          <form.AppField name="monthly">
            {(field) => (
              <field.TextField
                kind="plain-text"
                label="Mensuales"
                description={snapshotLifecycleRangeHint("monthly")}
                required
              />
            )}
          </form.AppField>
        </div>
      </Modal>
      {modal}
    </>
  );
}
