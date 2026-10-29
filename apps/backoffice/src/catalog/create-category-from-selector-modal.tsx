import type { CategorySummary } from "@purosur/contracts";
import type { CreationModalProps } from "../platform/creation-parts";
import { useCategoriesQuery } from "./catalog-queries";
import {
  type CategoryCreationModalServices,
  defaultCategoryCreationModalServices,
} from "./category-creation-modal-services";
import { NewCategoryModal } from "./new-category-modal";

export type CategoryCreationModalProps = CreationModalProps<CategorySummary> & {
  services?: CategoryCreationModalServices | undefined;
};

const NO_CATEGORIES: CategorySummary[] = [];

function OpenCategoryCreationModal({
  services = defaultCategoryCreationModalServices,
  initialName,
  onCreated,
  onClose,
  onSessionEnded,
}: Omit<CategoryCreationModalProps, "open">) {
  const categories = useCategoriesQuery({
    fetchCategories: services.fetchCategories,
    onSessionEnded,
  });
  if (categories.status === "loading") {
    return null;
  }
  return (
    <NewCategoryModal
      open
      initialName={initialName}
      onClose={onClose}
      onCreated={onCreated}
      onSessionEnded={onSessionEnded}
      createCategory={services.createCategory}
      categories={categories.status === "loaded" ? categories.value : NO_CATEGORIES}
    />
  );
}

export function CategoryCreationModal({ open, ...modal }: CategoryCreationModalProps) {
  return open ? <OpenCategoryCreationModal {...modal} /> : null;
}
