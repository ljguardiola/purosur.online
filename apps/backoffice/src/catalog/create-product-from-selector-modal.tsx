import type { BrandSummary, CategorySummary, TagSummary } from "@purosur/contracts";
import { combineCloudData } from "../platform/combine-cloud-data";
import type { CreatedProduct, CreationModalProps } from "../platform/creation-parts";
import { useBrandsQuery, useCategoriesQuery, useTagsQuery } from "./catalog-queries";
import { NewProductModal } from "./new-product-modal";
import {
  defaultProductCreationModalServices,
  type ProductCreationModalServices,
} from "./product-creation-modal-services";

export type ProductCreationModalProps = CreationModalProps<CreatedProduct> & {
  services?: ProductCreationModalServices | undefined;
};

const NOTHING_LOADED: [[CategorySummary[], BrandSummary[]], { tags: TagSummary[] }] = [
  [[], []],
  { tags: [] },
];

function OpenProductCreationModal({
  services = defaultProductCreationModalServices,
  initialName,
  onCreated,
  onClose,
  onSessionEnded,
}: Omit<ProductCreationModalProps, "open">) {
  const data = combineCloudData(
    combineCloudData(
      useCategoriesQuery({ fetchCategories: services.fetchCategories, onSessionEnded }),
      useBrandsQuery({ fetchBrands: services.fetchBrands, onSessionEnded }),
    ),
    useTagsQuery({ fetchTags: services.fetchTags, onSessionEnded }),
  );
  if (data.status === "loading") {
    return null;
  }
  const [[categories, brands], { tags }] = data.status === "loaded" ? data.value : NOTHING_LOADED;
  return (
    <NewProductModal
      open
      initialName={initialName}
      onClose={onClose}
      onCreated={onCreated}
      onSessionEnded={onSessionEnded}
      categories={categories}
      brands={brands}
      tags={tags}
      services={services}
    />
  );
}

export function ProductCreationModal({ open, ...modal }: ProductCreationModalProps) {
  return open ? <OpenProductCreationModal {...modal} /> : null;
}
