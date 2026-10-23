import type { FiscalTaskItem } from "@purosur/contracts";
import { fiscalTaskClosingBodySchema } from "@purosur/contracts";
import { Button, InlineNotice, Modal, useRequestForm } from "@purosur/ui";
import { Check, CircleCheck, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import {
  EMPTY_FISCAL_TASK_CLOSING_FORM,
  fiscalTaskClosingNoteMessage,
  fiscalTaskClosingRequestFrom,
} from "./fiscal-task-closing-form";
import { fiscalTaskDescription, fiscalTaskTitle } from "./fiscal-task-text";
import type { closeFiscalTask } from "./fiscal-tasks-api";

export type CloseFiscalTaskModalServices = {
  closeFiscalTask: typeof closeFiscalTask;
};

type ModalNotice =
  | { kind: "failed" }
  | { kind: "alreadyClosed" }
  | { kind: "notFound" }
  | { kind: "rateLimited"; retryAfterSeconds: number };

type CloseFiscalTaskModalProps = {
  target: FiscalTaskItem | null;
  onClose: () => void;
  onClosed: () => void;
  reload: () => Promise<unknown>;
  onSessionEnded: () => void;
  services: CloseFiscalTaskModalServices;
};

export function CloseFiscalTaskModal({
  target,
  onClose,
  onClosed,
  reload,
  onSessionEnded,
  services,
}: CloseFiscalTaskModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const [notice, setNotice] = useState<ModalNotice | null>(null);
  const openingRef = useRef(0);
  const { form, submit, submitting, reset } = useRequestForm({
    defaultValues: EMPTY_FISCAL_TASK_CLOSING_FORM,
    request: { schema: fiscalTaskClosingBodySchema, from: fiscalTaskClosingRequestFrom },
    fields: { note: "note" },
    messages: { note: fiscalTaskClosingNoteMessage },
    onSubmit: async (request, { showWireFieldError }) => {
      if (target === null) {
        return;
      }
      setNotice(null);
      const opening = openingRef.current;
      const outcome = await services.closeFiscalTask(target.id, request);
      const isCurrent = () => opening === openingRef.current;
      if (outcome.kind === "ok") {
        await reload();
        if (isCurrent()) {
          onClosed();
        }
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
      if (outcome.kind === "already_closed" || outcome.kind === "not_found") {
        await reload();
      }
      if (!isCurrent()) {
        return;
      }
      if (outcome.kind === "already_closed") {
        setNotice({ kind: "alreadyClosed" });
        return;
      }
      if (outcome.kind === "not_found") {
        setNotice({ kind: "notFound" });
        return;
      }
      if (outcome.kind === "validation_failed" && showWireFieldError(outcome.field)) {
        return;
      }
      if (outcome.kind === "rate_limited") {
        setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
        return;
      }
      setNotice({ kind: "failed" });
    },
  });

  useEffect(() => {
    openingRef.current += 1;
    if (target === null) {
      reset();
      setNotice(null);
    }
  }, [target, reset]);

  const gone = notice?.kind === "alreadyClosed" || notice?.kind === "notFound";

  return (
    <Modal
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      width="standard"
      tone="info"
      icon={<Check />}
      context={target ? fiscalTaskTitle(target) : "Tareas fiscales"}
      title="Cerrar tarea fiscal"
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
            disabled={submitting || gone}
            onPress={() => void submit()}
          >
            Cerrar tarea
          </Button>
        </>
      }
    >
      {target ? (
        <div className="flex flex-col gap-4">
          <p className="text-body">{fiscalTaskDescription(target)}</p>
          {notice?.kind === "failed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo cerrar la tarea"
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
          {notice?.kind === "alreadyClosed" && (
            <InlineNotice
              tone="info"
              icon={<CircleCheck />}
              title="Esta tarea ya estaba cerrada."
            />
          )}
          {notice?.kind === "notFound" && (
            <InlineNotice
              tone="info"
              icon={<CircleCheck />}
              title="Esta tarea ya no está disponible."
            />
          )}
          <form.AppField name="note">
            {(field) => <field.TextField kind="plain-text" label="Cómo se regularizó" required />}
          </form.AppField>
        </div>
      ) : null}
    </Modal>
  );
}
