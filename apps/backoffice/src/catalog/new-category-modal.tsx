import { type CategorySummary, categoryCreationBodySchema } from "@purosur/contracts";
import { Button, InlineNotice, Modal } from "@purosur/ui";
import { Check, ShieldX, Tags, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSendToMyAccount } from "../access/send-to-my-account";
import { useCloudForm } from "../platform/cloud-form";
import { retryAfterDetail } from "../platform/retry-after-detail";
import type { createCategory } from "./categories-api";
import {
  CATEGORY_FIELDS,
  CATEGORY_MESSAGES,
  CATEGORY_NAME_TAKEN,
  CATEGORY_PARENT_HELPER_TEXT,
  categoryName,
  categoryRequestFrom,
  EMPTY_CATEGORY_FORM,
  nameTakenUnderParentError,
  parentSelectOptions,
} from "./category-form";

type NewCategoryModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  onSessionEnded: () => void;
  createCategory: typeof createCategory;
  categories: CategorySummary[];
};

export function NewCategoryModal({
  open,
  onClose,
  onCreated,
  onSessionEnded,
  createCategory,
  categories,
}: NewCategoryModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const [notice, setNotice] = useState<
    { kind: "attemptFailed" } | { kind: "rateLimited"; retryAfterSeconds: number } | null
  >(null);
  const { form, submit, submitting, reset } = useCloudForm({
    defaultValues: EMPTY_CATEGORY_FORM,
    request: { schema: categoryCreationBodySchema, from: categoryRequestFrom },
    fields: CATEGORY_FIELDS,
    messages: CATEGORY_MESSAGES,
    onSubmit: async (request, { showWireFieldError, showFieldError }) => {
      setNotice(null);
      const parentName = categoryName(categories, request.parentId);
      const outcome = await createCategory({
        name: request.name,
        parentId: request.parentId ?? null,
      });
      if (outcome.kind === "ok") {
        onCreated();
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
        showFieldError(
          "name",
          request.parentId
            ? nameTakenUnderParentError({ name: request.name, parent: parentName })
            : CATEGORY_NAME_TAKEN,
        );
        return;
      }
      if (outcome.kind === "parent_has_products") {
        showFieldError(
          "parentValue",
          `"${parentName}" tiene productos asignados. Movelos a otra categoría antes de crear una subcategoría.`,
        );
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

  const parentOptions = parentSelectOptions(categories, new Set());

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
      icon={<Tags />}
      context="Catálogo"
      title="Nueva categoría"
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
            Crear la categoría
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No se pudo crear la categoría"
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
        <form.AppField name="name">
          {(field) => <field.TextField kind="plain-text" label="Nombre de la categoría" required />}
        </form.AppField>
        <form.AppField name="parentValue">
          {(field) => (
            <field.Select
              label="Categoría superior"
              options={parentOptions}
              description={CATEGORY_PARENT_HELPER_TEXT}
            />
          )}
        </form.AppField>
      </div>
    </Modal>
  );
}
