import { Button, LoadFailure, LoadingPlaceholder, Modal } from "@purosur/ui";
import { Check, PackagePlus, X } from "lucide-react";
import { createBrand } from "../platform/brand-creation-api";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { combineCloudData } from "../platform/combine-cloud-data";
import type { CreatedProduct, CreationModalProps } from "../platform/creation-parts";
import { generateInternalBarcode } from "../platform/internal-barcodes-api";
import { createTag } from "../platform/tag-creation-api";
import type { CloudData } from "../platform/use-cloud-query";
import { fetchBrands } from "./brands-api";
import { useBrandsQuery, useCategoriesQuery, useTagsQuery } from "./catalog-queries";
import { createCategory, fetchCategories } from "./categories-api";
import { NewProductModal, type NewProductModalServices } from "./new-product-modal";
import { createProduct } from "./products-api";
import { fetchTags } from "./tags-api";

export type CreateProductFromSelectorModalServices = {
  fetchCategories: typeof fetchCategories;
  fetchBrands: typeof fetchBrands;
  fetchTags: typeof fetchTags;
} & NewProductModalServices;

const defaultCreateProductFromSelectorModalServices: CreateProductFromSelectorModalServices = {
  fetchCategories,
  fetchBrands,
  fetchTags,
  createProduct,
  createBrand,
  createCategory,
  createTag,
  generateInternalBarcode,
};

export type CreateProductFromSelectorModalProps = CreationModalProps<CreatedProduct> & {
  services?: CreateProductFromSelectorModalServices | undefined;
};

function PendingNewProductModal({
  catalog,
  onClose,
}: {
  catalog: Exclude<CloudData<unknown>, { status: "loaded" }>;
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
      icon={<PackagePlus />}
      context="Catálogo · Productos"
      title="Nuevo producto"
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
            dataStatus={catalog.status}
            onPress={() => {}}
          >
            Crear el producto
          </Button>
        </>
      }
    >
      {catalog.status === "loading" ? (
        <LoadingPlaceholder variant="form" fields={6} />
      ) : (
        <LoadFailure {...cloudLoadFailure(catalog, "el catálogo")} />
      )}
    </Modal>
  );
}

function OpenCreateProductFromSelectorModal({
  services = defaultCreateProductFromSelectorModalServices,
  initialName,
  onCreated,
  onClose,
  onSessionEnded,
}: Omit<CreateProductFromSelectorModalProps, "open">) {
  const data = combineCloudData(
    combineCloudData(
      useCategoriesQuery({ fetchCategories: services.fetchCategories, onSessionEnded }),
      useBrandsQuery({ fetchBrands: services.fetchBrands, onSessionEnded }),
    ),
    useTagsQuery({ fetchTags: services.fetchTags, onSessionEnded }),
  );
  if (data.status !== "loaded") {
    return <PendingNewProductModal catalog={data} onClose={onClose} />;
  }
  const [[categories, brands], { tags }] = data.value;
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

export function CreateProductFromSelectorModal({
  open,
  ...modal
}: CreateProductFromSelectorModalProps) {
  return open ? <OpenCreateProductFromSelectorModal {...modal} /> : null;
}
