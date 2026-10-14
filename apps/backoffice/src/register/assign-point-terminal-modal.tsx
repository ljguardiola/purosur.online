import { pointTerminalAssignmentBodySchema } from "@purosur/contracts";
import { Button, InlineNotice, Modal, useRequestForm } from "@purosur/ui";
import type { startAuthentication } from "@simplewebauthn/browser";
import { Check, CreditCard, RotateCcw, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuthorization } from "../platform/authorization-modal";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import type {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import {
  EMPTY_POINT_TERMINAL_FORM,
  pointTerminalFormValuesFrom,
  pointTerminalMessage,
  pointTerminalRequestFrom,
} from "./point-terminal-form";
import type {
  AssignPointTerminalOutcome,
  assignPointTerminal,
  RegisterSummary,
} from "./registers-api";

export type AssignPointTerminalModalServices = {
  assignPointTerminal: typeof assignPointTerminal;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

type ModalNotice =
  | { kind: "attemptFailed" }
  | { kind: "staleVersion" }
  | { kind: "rateLimited"; retryAfterSeconds: number };

type AssignPointTerminalModalProps = {
  target: RegisterSummary | null;
  onClose: () => void;
  onSaved: () => void;
  reload: () => Promise<CloudReadOutcome<RegisterSummary[]>>;
  onSessionEnded: () => void;
  services: AssignPointTerminalModalServices;
};

export function AssignPointTerminalModal({
  target,
  onClose,
  onSaved,
  reload,
  onSessionEnded,
  services,
}: AssignPointTerminalModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const {
    assignPointTerminal,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const open = target !== null;
  const [seededFrom, setSeededFrom] = useState<RegisterSummary | null>(null);
  const [notice, setNotice] = useState<ModalNotice | null>(null);
  const [reloading, setReloading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const { run, modal } = useAuthorization<AssignPointTerminalOutcome>({
    actionName: "Guardar la terminal Point",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });

  async function settle(outcome: Awaited<ReturnType<typeof run>>): Promise<boolean> {
    if (outcome.kind === "cancelled") {
      return true;
    }
    if (outcome.kind === "ok") {
      onSaved();
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
    if (outcome.kind === "not_found") {
      await reload();
      return true;
    }
    if (outcome.kind === "stale_version") {
      setNotice({ kind: "staleVersion" });
      return true;
    }
    if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
      return true;
    }
    return false;
  }

  const { form, submit, submitting, dirty, reset } = useRequestForm({
    defaultValues: EMPTY_POINT_TERMINAL_FORM,
    request: { schema: pointTerminalAssignmentBodySchema, from: pointTerminalRequestFrom },
    fields: { terminal_id: "terminalId", version: null },
    messages: { terminalId: pointTerminalMessage },
    onSubmit: async (request, { showWireFieldError, showFieldError }) => {
      if (target === null) {
        return;
      }
      setNotice(null);
      const outcome = await run(() => assignPointTerminal(target.id, request));
      if (await settle(outcome)) {
        return;
      }
      if (outcome.kind === "point_terminal_taken") {
        showFieldError("terminalId", "Esa terminal ya está asignada a otra caja");
        return;
      }
      if (outcome.kind === "validation_failed" && showWireFieldError(outcome.field)) {
        return;
      }
      setNotice({ kind: "attemptFailed" });
    },
  });

  useEffect(() => {
    if (target === null) {
      if (seededFrom !== null) {
        reset();
        setSeededFrom(null);
      }
    } else if (target !== seededFrom && !dirty) {
      reset(pointTerminalFormValuesFrom(target));
      setSeededFrom(target);
      setNotice(null);
    }
  }, [target, seededFrom, dirty, reset]);

  async function handleRemove() {
    if (target === null) {
      return;
    }
    setNotice(null);
    setRemoving(true);
    const outcome = await run(() =>
      assignPointTerminal(target.id, { terminal_id: null, version: target.pointTerminalVersion }),
    );
    if (!(await settle(outcome))) {
      setNotice({ kind: "attemptFailed" });
    }
    setRemoving(false);
  }

  async function handleReload() {
    if (target === null) {
      return;
    }
    setReloading(true);
    const outcome = await reload();
    const reloaded =
      outcome.kind === "ok" ? outcome.value.find(({ id }) => id === target.id) : undefined;
    if (reloaded !== undefined) {
      reset(pointTerminalFormValuesFrom(reloaded));
      setSeededFrom(reloaded);
      setNotice(null);
    }
    setReloading(false);
  }

  const busy = submitting || reloading || removing;

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
        icon={<CreditCard />}
        context={target?.name ?? ""}
        title="Terminal Point integrada"
        closable
        footer={
          <>
            <Button variant="secondary" size="large" icon={<X />} disabled={busy} onPress={onClose}>
              Cancelar
            </Button>
            {notice?.kind === "staleVersion" ? (
              <Button
                variant="primary"
                size="large"
                icon={<RotateCcw />}
                fullWidth
                disabled={busy}
                onPress={() => void handleReload()}
              >
                Recargar
              </Button>
            ) : (
              <Button
                variant="primary"
                size="large"
                icon={<Check />}
                fullWidth
                disabled={busy}
                onPress={() => void submit()}
              >
                Guardar
              </Button>
            )}
          </>
        }
      >
        {target ? (
          <div className="flex flex-col gap-4">
            {notice?.kind === "attemptFailed" && (
              <InlineNotice
                tone="error"
                icon={<TriangleAlert />}
                title="No se pudo guardar la terminal"
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
            {notice?.kind === "staleVersion" && (
              <InlineNotice
                tone="error"
                icon={<RotateCcw />}
                title="La terminal de la caja cambió mientras la editabas"
                description="Recargá los datos y volvé a hacer el cambio."
              />
            )}
            <form.AppField name="terminalId">
              {(field) => (
                <field.TextField kind="plain-text" label="Identificador de la terminal" required />
              )}
            </form.AppField>
            {target.pointTerminalId !== null && (
              <div className="flex">
                <Button
                  variant="text"
                  destructive
                  disabled={busy}
                  onPress={() => void handleRemove()}
                >
                  Quitar terminal
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
      {modal}
    </>
  );
}
