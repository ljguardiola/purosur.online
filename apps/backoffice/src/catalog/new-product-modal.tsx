import {
  type BrandSummary,
  type CategorySummary,
  productCreationBodySchema,
  type TagSummary,
} from "@purosur/contracts";
import {
  Button,
  FieldGroup,
  InlineNotice,
  Modal,
  SharedFieldError,
  useRequestForm,
} from "@purosur/ui";
import { Check, PackagePlus, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  PRODUCT_GENERATE_INTERNAL_BARCODE_FAILED,
  useBarcodeChips,
  useGenerateInternalBarcode,
} from "../platform/barcode-chips";
import { barcodeProblemMessage, barcodeTakenError } from "../platform/barcode-list";
import type { createBrand } from "../platform/brand-creation-api";
import { categorySelectOptions } from "../platform/category-path";
import type { generateInternalBarcode } from "../platform/internal-barcodes-api";
import { NewBrandModal } from "../platform/new-brand-modal";
import { NewTagModal } from "../platform/new-tag-modal";
import { PRODUCT_GROUP_FIELDS, ProductFields } from "../platform/product-fields";
import {
  EMPTY_PRODUCT_FORM,
  PRODUCT_BRAND_INACTIVE_ERROR,
  PRODUCT_FIELDS,
  PRODUCT_MESSAGES,
  productRequestFrom,
  tagInactiveError,
} from "../platform/product-form";
import { useStackedTagCreation } from "../platform/product-tags-field";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { useStackedCreation } from "../platform/stacked-creation";
import type { createTag } from "../platform/tag-creation-api";
import { useMarkCatalogStale, useRefreshCatalog } from "./catalog-queries";
import { categoryNameOf, PRODUCT_CATEGORY_NOT_LEAF_ERROR } from "./product-form";
import type { createProduct } from "./products-api";

export type NewProductModalServices = {
  createProduct: typeof createProduct;
  createBrand: typeof createBrand;
  createTag: typeof createTag;
  generateInternalBarcode: typeof generateInternalBarcode;
};

type NewProductModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  onSessionEnded: () => void;
  categories: CategorySummary[];
  brands: BrandSummary[];
  tags: TagSummary[];
  services: NewProductModalServices;
};

export function NewProductModal({
  open,
  onClose,
  onCreated,
  onSessionEnded,
  categories,
  brands,
  tags,
  services,
}: NewProductModalProps) {
  const { createProduct, createBrand, createTag, generateInternalBarcode } = services;
  const sendToMyAccount = useSendToMyAccount();
  const [notice, setNotice] = useState<
    | { kind: "attemptFailed" }
    | { kind: "rateLimited"; retryAfterSeconds: number; raisedByGenerate?: true }
    | null
  >(null);
  const { form, submit, submitting, values, reset } = useRequestForm({
    defaultValues: EMPTY_PRODUCT_FORM,
    request: { schema: productCreationBodySchema, from: productRequestFrom },
    fields: PRODUCT_FIELDS,
    messages: PRODUCT_MESSAGES,
    onSubmit: async (_request, { parsed, showFieldError, showWireFieldError }) => {
      if (!parsed) {
        setNotice({ kind: "attemptFailed" });
        return;
      }
      setNotice(null);
      const outcome = await createProduct(parsed);
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
      if (outcome.kind === "validation_failed" && showWireFieldError(outcome.field)) {
        return;
      }
      if (outcome.kind === "barcode_taken") {
        showFieldError("barcodes", barcodeTakenError(outcome.codes));
        return;
      }
      if (outcome.kind === "category_not_leaf") {
        showFieldError(
          "categoryId",
          PRODUCT_CATEGORY_NOT_LEAF_ERROR({
            category: categoryNameOf(categories, parsed.categoryId),
          }),
        );
        return;
      }
      if (outcome.kind === "brand_inactive") {
        showFieldError("brandId", PRODUCT_BRAND_INACTIVE_ERROR);
        return;
      }
      if (outcome.kind === "tag_inactive") {
        showFieldError("tagIds", tagInactiveError(tags, outcome.tagId));
        return;
      }
      if (outcome.kind === "rate_limited") {
        setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
        return;
      }
      setNotice({ kind: "attemptFailed" });
    },
  });
  const chips = useBarcodeChips({
    list: values.barcodes,
    setList: (next) => form.setFieldValue("barcodes", next),
    problemMessage: barcodeProblemMessage,
  });
  const generate = useGenerateInternalBarcode(
    chips,
    generateInternalBarcode,
    onSessionEnded,
    (retryAfterSeconds) =>
      setNotice({ kind: "rateLimited", retryAfterSeconds, raisedByGenerate: true }),
    () =>
      setNotice((current) =>
        current?.kind === "rateLimited" && current.raisedByGenerate ? null : current,
      ),
    PRODUCT_GENERATE_INTERNAL_BARCODE_FAILED,
  );

  const markCatalogStale = useMarkCatalogStale();
  const refreshCatalog = useRefreshCatalog();
  const catalog = { markStale: markCatalogStale, refresh: refreshCatalog };
  const brandCreation = useStackedCreation<BrandSummary>(
    (brand) => form.setFieldValue("brandId", brand.id),
    catalog,
  );
  const tagCreation = useStackedTagCreation(
    (tagId) => form.setFieldValue("tagIds", [...form.state.values.tagIds, tagId]),
    catalog,
  );
  const closeForm = () => {
    brandCreation.finish();
    tagCreation.finish();
    onClose();
  };

  useEffect(() => {
    if (open) {
      reset();
      chips.reset();
      setNotice(null);
      generate.reset();
      brandCreation.reset();
      tagCreation.reset();
    }
  }, [open, reset, chips.reset, generate.reset, brandCreation.reset, tagCreation.reset]);

  const categoryOptions = categorySelectOptions(categories);

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
      icon={<PackagePlus />}
      context="Catálogo · Productos"
      title="Nuevo producto"
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
            Crear el producto
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No se pudo crear el producto"
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
        <ProductFields
          form={form}
          fields={PRODUCT_GROUP_FIELDS}
          categories={
            categoryOptions
              ? { state: "loaded", options: categoryOptions, creation: null }
              : {
                  state: "unavailable",
                  placeholder: (
                    <form.AppField name="categoryId">
                      {() => (
                        <FieldGroup label="Categoría" required>
                          <SharedFieldError>{() => null}</SharedFieldError>
                        </FieldGroup>
                      )}
                    </form.AppField>
                  ),
                }
          }
          brands={{ state: "loaded", items: brands, creation: brandCreation }}
          tags={{ state: "loaded", items: tags, creation: tagCreation }}
          chips={chips}
          generation={generate.generation}
          disabled={submitting}
        />
        <NewBrandModal
          open={brandCreation.open}
          initialName={brandCreation.initialName}
          context="Marcas"
          createBrand={createBrand}
          onCreated={brandCreation.select}
          onClose={brandCreation.close}
          onSessionEnded={onSessionEnded}
        />
        <NewTagModal
          open={tagCreation.open}
          context="Distintivos"
          services={{ createTag }}
          onCreated={tagCreation.select}
          onClose={tagCreation.close}
          onSessionEnded={onSessionEnded}
        />
      </div>
    </Modal>
  );
}
