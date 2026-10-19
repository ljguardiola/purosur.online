import { compromiseResponseSessionsAndPasskeysBodySchema } from "@purosur/contracts";
import { Button, LoadFailure, LoadingPlaceholder, Modal, useRequestForm } from "@purosur/ui";
import { LogOut, X } from "lucide-react";
import { useEffect, useEffectEvent } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import type { fetchAccounts } from "./compromise-response-accounts-api";
import type {
  CompromiseResponse,
  EndSessionsAndRemovePasskeysOutcome,
  endSessionsAndRemovePasskeys,
} from "./compromise-response-api";
import { isRunbookRefusal } from "./compromise-response-api";
import { useAccountsQuery } from "./sessions-queries";
import {
  accountOptions,
  EMPTY_VALUES,
  MESSAGES,
  REQUEST_FIELDS,
  requestFrom,
} from "./end-sessions-form";
import { StepAttemptNotices } from "./step-attempt-notices";
import { type StepAttemptServices, useStepAttempt } from "./use-step-attempt";

export type EndSessionsStepModalServices = StepAttemptServices & {
  endSessionsAndRemovePasskeys: typeof endSessionsAndRemovePasskeys;
  fetchAccounts: typeof fetchAccounts;
};

type EndSessionsStepModalProps = {
  open: boolean;
  onClose: () => void;
  onDone: (runbook: CompromiseResponse) => void;
  onOutdated: () => void;
  onSessionEnded: () => void;
  services: EndSessionsStepModalServices;
};

export function EndSessionsStepModal({
  open,
  onClose,
  onDone,
  onOutdated,
  onSessionEnded,
  services,
}: EndSessionsStepModalProps) {
  const {
    endSessionsAndRemovePasskeys,
    fetchAccounts,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const accounts = useAccountsQuery({ fetchAccounts, enabled: open, onSessionEnded });
  const { attempt, running, notice, modal } = useStepAttempt<
    EndSessionsAndRemovePasskeysOutcome,
    "outdated" | "notFound" | "ownAccount"
  >({
    open,
    actionName: "Cerrar las sesiones y dar de baja las passkeys",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });
  const { form, submit, submitting, reset } = useRequestForm({
    defaultValues: EMPTY_VALUES,
    request: { schema: compromiseResponseSessionsAndPasskeysBodySchema, from: requestFrom },
    fields: REQUEST_FIELDS,
    messages: MESSAGES,
    onSubmit: async (request) => {
      await attempt(
        () => endSessionsAndRemovePasskeys(request),
        (outcome, opening) => {
          if (outcome.kind === "ok") {
            onDone(outcome.value);
          } else if (outcome.kind === "not_found") {
            opening.showNotice("notFound");
          } else if (outcome.kind === "own_account") {
            opening.showNotice("ownAccount");
          } else if (isRunbookRefusal(outcome.kind)) {
            opening.showNotice("outdated");
            onOutdated();
          }
        },
      );
    },
  });

  const clearChoice = useEffectEvent(() => reset(EMPTY_VALUES));
  useEffect(() => {
    if (open) {
      clearChoice();
    }
  }, [open]);

  const options = accounts.status === "loaded" ? accountOptions(accounts.value) : undefined;

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        width="confirmation"
        tone="error"
        icon={<LogOut />}
        title="Cerrar las sesiones y dar de baja las passkeys"
        closable
        footer={
          <>
            <Button
              variant="secondary"
              size="large"
              icon={<X />}
              fullWidth
              disabled={running || submitting}
              onPress={onClose}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              destructive
              size="large"
              icon={<LogOut />}
              fullWidth
              dataStatus={accounts.status}
              disabled={running || submitting}
              onPress={() => void submit()}
            >
              Cerrar y dar de baja
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <StepAttemptNotices notice={notice} failedTitle="No se pudo hacer este paso" />
          <p className="text-body text-text">
            Se cierran todas las sesiones abiertas. También se cierra la tuya, y volvés a la
            pantalla de ingreso.
          </p>
          <p className="text-body text-text">La cuenta que elijas pierde todas sus passkeys.</p>
          {accounts.status === "loading" && <LoadingPlaceholder variant="form" fields={1} />}
          {accounts.status === "failed" && (
            <LoadFailure {...cloudLoadFailure(accounts, "las cuentas")} />
          )}
          {options !== undefined && (
            <form.AppField name="accountId">
              {(field) => (
                <field.Select
                  label="Cuenta sospechada"
                  placeholder="Elegí una cuenta"
                  options={options}
                  required
                />
              )}
            </form.AppField>
          )}
        </div>
      </Modal>
      {modal}
    </>
  );
}
