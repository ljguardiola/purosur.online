import { type CategorySummary, categoryCreationBodySchema } from "@purosur/contracts";
import { Button, InlineNotice, Modal, useRequestForm } from "@purosur/ui";
import { Check, ShieldX, Tags, TriangleAlert, X } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { withCreatedCategory } from "../platform/category-path";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { useStackedCreation } from "../platform/stacked-creation";
import { useMarkCatalogStale, useRefreshCatalog } from "./catalog-queries";
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
  initialName?: string;
  onClose: () => void;
  onCreated: (category: CategorySummary) => void;
  onSessionEnded: () => void;
  createCategory: typeof createCategory;
  categories: CategorySummary[];
};

export function NewCategoryModal({
  open,
  initialName = "",
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
  const { form, submit, submitting, reset } = useRequestForm({
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
        onCreated(outcome.category);
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

  const markCatalogStale = useMarkCatalogStale();
  const refreshCatalog = useRefreshCatalog();
  const parentCreation = useStackedCreation<CategorySummary>(
    (parent) => form.setFieldValue("parentValue", parent.id),
    { markStale: markCatalogStale, refresh: refreshCatalog },
  );
  const closeForm = () => {
    parentCreation.finish();
    onClose();
  };

  const seed = useEffectEvent(() => {
    reset({ ...EMPTY_CATEGORY_FORM, name: initialName });
    parentCreation.reset();
  });

  useEffect(() => {
    if (open) {
      seed();
      setNotice(null);
    }
  }, [open]);

  const offeredCategories = withCreatedCategory(categories, parentCreation.created);
  const parentOptions = parentSelectOptions([...offeredCategories], new Set());

  return (
    <Modal
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          closeForm();
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
            onPress={closeForm}
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
            <field.ComboBox
              label="Categoría superior"
              options={parentOptions}
              description={CATEGORY_PARENT_HELPER_TEXT}
              creation={{ recordKind: "categoría", onCreate: parentCreation.start }}
            />
          )}
        </form.AppField>
        {parentCreation.open ? (
          <NewCategoryModal
            open
            initialName={parentCreation.initialName}
            onClose={parentCreation.close}
            onCreated={parentCreation.select}
            onSessionEnded={onSessionEnded}
            createCategory={createCategory}
            categories={[...offeredCategories]}
          />
        ) : null}
      </div>
    </Modal>
  );
}
