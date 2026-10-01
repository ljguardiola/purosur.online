import { Button, type Icon, InlineNotice, Modal, useRequestForm } from "@purosur/ui";
import type { StandardSchemaV1 } from "@tanstack/react-form";
import { Check, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSendToMyAccount } from "../access/send-to-my-account";
import { retryAfterDetail } from "../platform/retry-after-detail";

export type NameCreationOutcome<Created> =
  | { kind: "ok"; created: Created }
  | { kind: "validation_failed"; field: string }
  | { kind: "name_taken" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

type NameCreationTexts = {
  title: string;
  submitLabel: string;
  nameTaken: string;
  failed: string;
};

export type NameCreationModalProps<Created> = {
  open: boolean;
  context: string;
  icon: Icon;
  texts: NameCreationTexts;
  schema: StandardSchemaV1<{ name: string }, { name: string }>;
  nameMessage: (values: { name: string }) => string;
  create: (name: string) => Promise<NameCreationOutcome<Created>>;
  onCreated: (created: Created) => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

type Notice = { kind: "attemptFailed" } | { kind: "rateLimited"; retryAfterSeconds: number };

// Opens on its own or stacked over another open modal, such as the product form, which stays
// mounted with everything typed in it while this one is on top.
export function NameCreationModal<Created>({
  open,
  context,
  icon,
  texts,
  schema,
  nameMessage,
  create,
  onCreated,
  onClose,
  onSessionEnded,
}: NameCreationModalProps<Created>) {
  const sendToMyAccount = useSendToMyAccount();
  const [notice, setNotice] = useState<Notice | null>(null);
  const { form, submit, submitting, reset } = useRequestForm({
    defaultValues: { name: "" },
    request: { schema, from: ({ name }) => ({ name: name.trim() }) },
    fields: { name: "name" },
    messages: { name: nameMessage },
    onSubmit: async (request, { showWireFieldError, showFieldError }) => {
      setNotice(null);
      const outcome = await create(request.name);
      if (outcome.kind === "ok") {
        onCreated(outcome.created);
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
      if (outcome.kind === "name_taken") {
        showFieldError("name", texts.nameTaken);
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

  useEffect(() => {
    if (open) {
      reset();
      setNotice(null);
    }
  }, [open, reset]);

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
      icon={icon}
      context={context}
      title={texts.title}
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
            {texts.submitLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={texts.failed}
            description="Volvé a intentarlo."
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
        <form.AppField name="name">
          {(field) => <field.TextField kind="plain-text" label="Nombre" required />}
        </form.AppField>
      </div>
    </Modal>
  );
}
