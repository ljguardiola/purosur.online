import { type CategorySummary, categoryEditBodySchema } from "@purosur/contracts";
import { Button, InlineNotice, Modal, useRequestForm } from "@purosur/ui";
import { Check, RotateCcw, ShieldX, Tags, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import type { CategoryReload } from "./catalog-queries";
import type { editCategory } from "./categories-api";
import {
  CATEGORY_EDIT_FIELDS,
  CATEGORY_MESSAGES,
  CATEGORY_NAME_TAKEN,
  CATEGORY_PARENT_HELPER_TEXT,
  categoryEditRequestFrom,
  categoryFormValues,
  categoryName,
  EMPTY_CATEGORY_FORM,
  nameTakenUnderParentError,
  parentSelectOptions,
} from "./category-form";
import { selfAndDescendantIds } from "./category-path";

type EditCategoryModalProps = {
  target: CategorySummary | null;
  onClose: () => void;
  onSaved: () => void;
  onSessionEnded: () => void;
  reload: (id: string) => Promise<CategoryReload>;
  editCategory: typeof editCategory;
  categories: CategorySummary[];
};

type EditNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "staleVersion" }
  | { kind: "notFound" };

export function EditCategoryModal({
  target,
  onClose,
  onSaved,
  onSessionEnded,
  reload,
  editCategory,
  categories,
}: EditCategoryModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [title, setTitle] = useState("");
  const [notice, setNotice] = useState<EditNotice | null>(null);
  const [reloading, setReloading] = useState(false);
  const { form, submit, submitting, reset } = useRequestForm({
    defaultValues: { ...EMPTY_CATEGORY_FORM, version: 1 },
    request: { schema: categoryEditBodySchema, from: categoryEditRequestFrom },
    fields: CATEGORY_EDIT_FIELDS,
    messages: CATEGORY_MESSAGES,
    onSubmit: async (request, { showWireFieldError, showFieldError }) => {
      if (!target) {
        return;
      }
      setNotice(null);
      const parentName = categoryName(categories, request.parentId);
      const outcome = await editCategory(target.id, request);
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
          `"${parentName}" tiene productos asignados. Movelos a otra categoría antes de convertirla en categoría superior.`,
        );
        return;
      }
      if (outcome.kind === "move_not_allowed") {
        showFieldError(
          "parentValue",
          `No se puede mover "${target.name}" bajo "${parentName}": es una de sus subcategorías.`,
        );
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

  useEffect(() => {
    if (open && target) {
      reset(categoryFormValues(target));
      setTitle(target.name);
      setNotice(null);
      setReloading(false);
    }
  }, [open, target, reset]);

  const excludeIds = target ? selfAndDescendantIds(categories, target.id) : new Set<string>();
  const parentOptions = parentSelectOptions(categories, excludeIds);

  async function handleReload() {
    if (!target) {
      return;
    }
    setReloading(true);
    const outcome = await reload(target.id);
    if (outcome.kind === "found") {
      reset(categoryFormValues(outcome.category));
      setTitle(outcome.category.name);
      setNotice(null);
    }
    if (outcome.kind === "not_found") {
      setNotice({ kind: "notFound" });
    }
    setReloading(false);
  }

  const offersReload = notice?.kind === "staleVersion";

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
      context="Catálogo · Categorías"
      title={title}
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
              title="No se pudo guardar el cambio"
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
              icon={<TriangleAlert />}
              title="Esta categoría cambió mientras la editabas"
              description="Recargá sus datos y volvé a hacer el cambio."
            />
          )}
          {notice?.kind === "notFound" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Esta categoría ya no existe"
            />
          )}
          {offersReload ? (
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
              <field.TextField kind="plain-text" label="Nombre de la categoría" required />
            )}
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
      ) : null}
    </Modal>
  );
}
