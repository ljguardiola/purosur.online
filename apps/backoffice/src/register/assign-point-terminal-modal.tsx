import { pointTerminalAssignmentBodySchema } from "@purosur/contracts";
import { Button, InlineNotice, Modal, useRequestForm } from "@purosur/ui";
import { Check, CreditCard, RotateCcw, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import {
  EMPTY_POINT_TERMINAL_FORM,
  pointTerminalFormValuesFrom,
  pointTerminalMessage,
  pointTerminalRequestFrom,
} from "./point-terminal-form";
import type { RegisterReload } from "./register-queries";
import type { assignPointTerminal, RegisterSummary } from "./registers-api";

export type AssignPointTerminalModalServices = {
  assignPointTerminal: typeof assignPointTerminal;
};

type ModalNotice =
  | { kind: "attemptFailed" }
  | { kind: "staleVersion" }
  | { kind: "notFound" }
  | { kind: "reloadFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number };

type AssignPointTerminalModalProps = {
  target: RegisterSummary | null;
  onClose: () => void;
  onSaved: () => void;
  reload: (id: string) => Promise<RegisterReload>;
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
  const { assignPointTerminal } = services;
  const open = target !== null;
  const [seededFrom, setSeededFrom] = useState<RegisterSummary | null>(null);
  const [loaded, setLoaded] = useState<RegisterSummary | null>(null);
  const [notice, setNotice] = useState<ModalNotice | null>(null);
  const [reloading, setReloading] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function settle(
    outcome: Awaited<ReturnType<typeof assignPointTerminal>>,
    register: RegisterSummary,
  ): Promise<boolean> {
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
      applyReload(await reload(register.id));
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
      const outcome = await assignPointTerminal(target.id, request);
      if (await settle(outcome, target)) {
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
        setLoaded(null);
      }
    } else if (target !== seededFrom && !dirty) {
      reset(pointTerminalFormValuesFrom(target));
      setSeededFrom(target);
      setLoaded(target);
      setNotice(null);
    }
  }, [target, seededFrom, dirty, reset]);

  async function handleRemove() {
    if (loaded === null) {
      return;
    }
    setNotice(null);
    setRemoving(true);
    const outcome = await assignPointTerminal(loaded.id, {
      terminal_id: null,
      version: loaded.pointTerminalVersion,
    });
    if (!(await settle(outcome, loaded))) {
      setNotice({ kind: "attemptFailed" });
    }
    setRemoving(false);
  }

  function applyReload(outcome: RegisterReload) {
    if (outcome.kind === "found") {
      reset(pointTerminalFormValuesFrom(outcome.register));
      setLoaded(outcome.register);
      setNotice(null);
    } else if (outcome.kind === "not_found") {
      setNotice({ kind: "notFound" });
    } else if (outcome.kind === "unauthenticated") {
      onSessionEnded();
    } else if (outcome.kind === "forbidden") {
      sendToMyAccount();
    } else if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else {
      setNotice({ kind: "reloadFailed" });
    }
  }

  async function handleReload() {
    if (target === null) {
      return;
    }
    setReloading(true);
    applyReload(await reload(target.id));
    setReloading(false);
  }

  const busy = submitting || reloading || removing;
  const actionsDisabled = busy || notice?.kind === "notFound";
  const offersReload = notice?.kind === "staleVersion" || notice?.kind === "reloadFailed";

  return (
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
          {offersReload ? (
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
              disabled={actionsDisabled}
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
          {notice?.kind === "notFound" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="La caja ya no existe"
              description="Cerrá esta ventana: la lista ya se actualizó."
            />
          )}
          {notice?.kind === "reloadFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudieron recargar los datos"
              description="Probá de nuevo."
            />
          )}
          <form.AppField name="terminalId">
            {(field) => (
              <field.TextField kind="plain-text" label="Identificador de la terminal" required />
            )}
          </form.AppField>
          {loaded !== null && loaded.pointTerminalId !== null && (
            <div className="flex">
              <Button
                variant="text"
                destructive
                disabled={actionsDisabled}
                onPress={() => void handleRemove()}
              >
                Quitar terminal
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
