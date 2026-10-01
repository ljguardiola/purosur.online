import { type TagSummary, tagEditBodySchema } from "@purosur/contracts";
import { Button, InlineNotice, Modal, useRequestForm } from "@purosur/ui";
import { Check, Pencil, RotateCcw, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSendToMyAccount } from "../access/send-to-my-account";
import { retryAfterDetail } from "../platform/retry-after-detail";
import type { TagReload } from "./catalog-queries";
import {
  EMPTY_TAG_EDIT_FORM,
  renameReachText,
  TAG_EDIT_FIELDS,
  TAG_NAME_TAKEN,
  tagEditRequestFrom,
  tagNameMessage,
} from "./tag-form";
import type { editTag } from "./tags-api";

export type EditTagModalServices = {
  editTag: typeof editTag;
};

type EditTagModalProps = {
  target: TagSummary | null;
  onClose: () => void;
  onSaved: () => void;
  onSessionEnded: () => void;
  reload: (id: string) => Promise<TagReload>;
  services: EditTagModalServices;
};

type EditNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "staleVersion" }
  | { kind: "notFound" };

export function EditTagModal({
  target,
  onClose,
  onSaved,
  onSessionEnded,
  reload,
  services,
}: EditTagModalProps) {
  const { editTag } = services;
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [loaded, setLoaded] = useState<TagSummary | null>(null);
  const [notice, setNotice] = useState<EditNotice | null>(null);
  const [reloading, setReloading] = useState(false);
  const { form, submit, submitting, reset } = useRequestForm({
    defaultValues: EMPTY_TAG_EDIT_FORM,
    request: { schema: tagEditBodySchema, from: tagEditRequestFrom },
    fields: TAG_EDIT_FIELDS,
    messages: { name: tagNameMessage },
    onSubmit: async (request, { showWireFieldError, showFieldError }) => {
      if (!target) {
        return;
      }
      setNotice(null);
      const outcome = await editTag(target.id, request);
      if (outcome.kind === "ok") {
        onSaved();
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
      if (outcome.kind === "not_found") {
        setNotice({ kind: "notFound" });
        return;
      }
      if (outcome.kind === "name_taken") {
        showFieldError("name", TAG_NAME_TAKEN);
        return;
      }
      if (outcome.kind === "stale_version") {
        setNotice({ kind: "staleVersion" });
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

  function load(tag: TagSummary) {
    reset({ name: tag.name, version: tag.version });
    setLoaded(tag);
    setNotice(null);
  }

  useEffect(() => {
    if (open && target) {
      reset({ name: target.name, version: target.version });
      setLoaded(target);
      setNotice(null);
      setReloading(false);
    }
  }, [open, target, reset]);

  async function handleReload() {
    if (!target) {
      return;
    }
    setReloading(true);
    const outcome = await reload(target.id);
    if (outcome.kind === "found") {
      load(outcome.tag);
    }
    if (outcome.kind === "not_found") {
      setNotice({ kind: "notFound" });
    }
    setReloading(false);
  }

  const reach = loaded ? renameReachText(loaded.productCount) : undefined;

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
      icon={<Pencil />}
      context="Catálogo · Distintivos"
      title={loaded?.name ?? ""}
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
            disabled={submitting || reloading}
            onPress={() => void submit()}
          >
            Guardar los cambios
          </Button>
        </>
      }
    >
      {target ? (
        <div className="flex flex-col gap-4">
          {notice?.kind === "attemptFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se guardó el distintivo"
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
          {notice?.kind === "staleVersion" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Este distintivo cambió mientras lo editabas"
              description="Recargá sus datos y volvé a hacer el cambio."
            />
          )}
          {notice?.kind === "notFound" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Este distintivo ya no existe"
            />
          )}
          {notice?.kind === "staleVersion" ? (
            <Button
              variant="secondary"
              icon={<RotateCcw />}
              disabled={submitting || reloading}
              onPress={() => void handleReload()}
            >
              Recargar
            </Button>
          ) : null}
          <form.AppField name="name">
            {(field) => (
              <field.TextField
                kind="plain-text"
                label="Nombre"
                required
                {...(reach === undefined ? {} : { description: reach })}
              />
            )}
          </form.AppField>
        </div>
      ) : null}
    </Modal>
  );
}
