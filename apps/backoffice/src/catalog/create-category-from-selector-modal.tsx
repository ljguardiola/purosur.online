import type { CategorySummary } from "@purosur/contracts";
import { Button, LoadFailure, LoadingPlaceholder, Modal } from "@purosur/ui";
import { Check, Tags, X } from "lucide-react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import type { CreationModalProps } from "../platform/creation-parts";
import type { CloudData } from "../platform/use-cloud-query";
import { useCategoriesQuery } from "./catalog-queries";
import { createCategory, fetchCategories } from "./categories-api";
import { NewCategoryModal } from "./new-category-modal";

export type CreateCategoryFromSelectorModalServices = {
  fetchCategories: typeof fetchCategories;
  createCategory: typeof createCategory;
};

const defaultCreateCategoryFromSelectorModalServices: CreateCategoryFromSelectorModalServices = {
  fetchCategories,
  createCategory,
};

export type CreateCategoryFromSelectorModalProps = CreationModalProps<CategorySummary> & {
  services?: CreateCategoryFromSelectorModalServices | undefined;
};

function PendingNewCategoryModal({
  categories,
  onClose,
}: {
  categories: Exclude<CloudData<CategorySummary[]>, { status: "loaded" }>;
  onClose: () => void;
}) {
  return (
    <Modal
      open
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
          <Button variant="secondary" size="large" icon={<X />} onPress={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="large"
            icon={<Check />}
            fullWidth
            dataStatus={categories.status}
            onPress={() => {}}
          >
            Crear la categoría
          </Button>
        </>
      }
    >
      {categories.status === "loading" ? (
        <LoadingPlaceholder variant="form" fields={2} />
      ) : (
        <LoadFailure {...cloudLoadFailure(categories, "las categorías")} />
      )}
    </Modal>
  );
}

function OpenCreateCategoryFromSelectorModal({
  services = defaultCreateCategoryFromSelectorModalServices,
  initialName,
  onCreated,
  onClose,
  onSessionEnded,
}: Omit<CreateCategoryFromSelectorModalProps, "open">) {
  const categories = useCategoriesQuery({
    fetchCategories: services.fetchCategories,
    onSessionEnded,
  });
  if (categories.status !== "loaded") {
    return <PendingNewCategoryModal categories={categories} onClose={onClose} />;
  }
  return (
    <NewCategoryModal
      open
      initialName={initialName}
      onClose={onClose}
      onCreated={onCreated}
      onSessionEnded={onSessionEnded}
      createCategory={services.createCategory}
      categories={categories.value}
    />
  );
}

export function CreateCategoryFromSelectorModal({
  open,
  ...modal
}: CreateCategoryFromSelectorModalProps) {
  return open ? <OpenCreateCategoryFromSelectorModal {...modal} /> : null;
}
