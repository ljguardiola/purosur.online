import {
  type BrandSummary,
  type CategorySummary,
  type ProductSummary,
  productEditBodySchema,
  type TagSummary,
} from "@purosur/contracts";
import { Button, FieldGroup, InlineNotice, Modal, useRequestForm } from "@purosur/ui";
import { Check, Pencil, RotateCcw, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { BarcodeChips, useBarcodeChips } from "../platform/barcode-chips";
import { barcodeTakenError } from "../platform/barcode-list";
import type { createBrand } from "../platform/brand-creation-api";
import { categorySelectOptions, withCreatedCategory } from "../platform/category-path";
import { creatableChoice } from "../platform/creatable-options";
import { NewBrandModal } from "../platform/new-brand-modal";
import { NewTagModal } from "../platform/new-tag-modal";
import { brandFieldHelp, brandOptions, withCreatedBrand } from "../platform/product-brand-field";
import {
  EMPTY_PRODUCT_FORM,
  NET_CONTENT_UNIT_OPTIONS,
  PRODUCT_BRAND_INACTIVE_ERROR,
  tagInactiveError,
} from "../platform/product-form";
import { TagsField, useStackedTagCreation, withCreatedTags } from "../platform/product-tags-field";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { SALE_UNIT_OPTIONS } from "../platform/sale-unit-options";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { useStackedCreation } from "../platform/stacked-creation";
import type { createTag } from "../platform/tag-creation-api";
import { type ProductReload, useMarkCatalogStale, useRefreshCatalog } from "./catalog-queries";
import type { createCategory } from "./categories-api";
import { NewCategoryModal } from "./new-category-modal";
import { productDescription } from "./product-description";
import {
  categoryNameOf,
  editedProductBarcodeProblemMessage,
  PRODUCT_CATEGORY_NOT_LEAF_ERROR,
  PRODUCT_EDIT_FIELDS,
  PRODUCT_EDIT_MESSAGES,
  PRODUCT_INTERNAL_BARCODE_ON_PRODUCT_WITH_BARCODES_ERROR,
  productEditRequestFrom,
  productFormValues,
  saleUnitHeldByDiscountError,
  saleUnitHeldByPackagingError,
  saleUnitHeldBySupplierItemError,
} from "./product-form";
import type { editProduct } from "./products-api";

export type EditProductModalServices = {
  editProduct: typeof editProduct;
  createBrand: typeof createBrand;
  createCategory: typeof createCategory;
  createTag: typeof createTag;
};

type EditProductModalProps = {
  target: ProductSummary | null;
  onClose: () => void;
  onSaved: () => void;
  onSessionEnded: () => void;
  reload: (id: string) => Promise<ProductReload>;
  categories: CategorySummary[];
  brands: BrandSummary[];
  tags: TagSummary[];
  services: EditProductModalServices;
};

type EditNotice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "staleVersion" }
  | { kind: "notFound" }
  | { kind: "reloadFailed" };

export function EditProductModal({
  target,
  onClose,
  onSaved,
  onSessionEnded,
  reload,
  categories,
  brands,
  tags,
  services,
}: EditProductModalProps) {
  const { editProduct, createBrand, createCategory, createTag } = services;
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [title, setTitle] = useState("");
  const [keptBrandId, setKeptBrandId] = useState<string | null>(null);
  const [notice, setNotice] = useState<EditNotice | null>(null);
  const [reloading, setReloading] = useState(false);
  const { form, submit, submitting, values, reset } = useRequestForm({
    defaultValues: { ...EMPTY_PRODUCT_FORM, version: 1 },
    request: { schema: productEditBodySchema, from: productEditRequestFrom },
    fields: PRODUCT_EDIT_FIELDS,
    messages: PRODUCT_EDIT_MESSAGES,
    onSubmit: async (_request, { parsed, showFieldError, showWireFieldError }) => {
      if (!target) {
        return;
      }
      if (!parsed) {
        setNotice({ kind: "attemptFailed" });
        return;
      }
      setNotice(null);
      const outcome = await editProduct(target.id, parsed);
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
      if (outcome.kind === "stale_version") {
        setNotice({ kind: "staleVersion" });
        return;
      }
      if (outcome.kind === "validation_failed" && showWireFieldError(outcome.field)) {
        return;
      }
      if (outcome.kind === "internal_barcode_on_product_with_barcodes") {
        showFieldError("barcodes", PRODUCT_INTERNAL_BARCODE_ON_PRODUCT_WITH_BARCODES_ERROR);
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
      if (outcome.kind === "sale_unit_held_by_packaging") {
        showFieldError("saleUnit", saleUnitHeldByPackagingError(outcome.packagingName));
        return;
      }
      if (outcome.kind === "sale_unit_held_by_supplier_item") {
        showFieldError("saleUnit", saleUnitHeldBySupplierItemError);
        return;
      }
      if (outcome.kind === "sale_unit_held_by_discount") {
        showFieldError("saleUnit", saleUnitHeldByDiscountError(outcome.discountName));
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
    problemMessage: editedProductBarcodeProblemMessage,
  });

  const markCatalogStale = useMarkCatalogStale();
  const refreshCatalog = useRefreshCatalog();
  const catalog = { markStale: markCatalogStale, refresh: refreshCatalog };
  const brandCreation = useStackedCreation<BrandSummary>(
    (brand) => form.setFieldValue("brandId", brand.id),
    catalog,
  );
  const categoryCreation = useStackedCreation<CategorySummary>(
    (category) => form.setFieldValue("categoryId", category.id),
    catalog,
  );
  const tagCreation = useStackedTagCreation(
    (tagId) => form.setFieldValue("tagIds", [...form.state.values.tagIds, tagId]),
    catalog,
  );
  const closeForm = () => {
    brandCreation.finish();
    categoryCreation.finish();
    tagCreation.finish();
    onClose();
  };

  const describe = useEffectEvent((product: ProductSummary) => productDescription(product, brands));

  useEffect(() => {
    if (open && target) {
      reset(productFormValues(target));
      setTitle(describe(target));
      setKeptBrandId(target.brandId);
      chips.reset();
      setNotice(null);
      setReloading(false);
      brandCreation.reset();
      categoryCreation.reset();
      tagCreation.reset();
    }
  }, [
    open,
    target,
    reset,
    chips.reset,
    brandCreation.reset,
    categoryCreation.reset,
    tagCreation.reset,
  ]);

  const offeredCategories = [...withCreatedCategory(categories, categoryCreation.created)];
  const categoryChoice = creatableChoice(categorySelectOptions(offeredCategories), {
    recordKind: "categoría",
    onCreate: categoryCreation.start,
  });

  async function handleReload() {
    if (!target) {
      return;
    }
    setReloading(true);
    const outcome = await reload(target.id);
    if (outcome.kind === "found") {
      reset(productFormValues(outcome.product));
      setTitle(productDescription(outcome.product, brands));
      setKeptBrandId(outcome.product.brandId);
      chips.reset();
      setNotice(null);
      setReloading(false);
      return;
    }
    if (outcome.kind === "not_found") {
      setNotice({ kind: "notFound" });
      setReloading(false);
      return;
    }
    if (outcome.kind === "list_failed") {
      setReloading(false);
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
    if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
      setReloading(false);
      return;
    }
    setNotice({ kind: "reloadFailed" });
    setReloading(false);
  }

  const offersReload = notice?.kind === "staleVersion" || notice?.kind === "reloadFailed";
  const busy = submitting || reloading;

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
      icon={<Pencil />}
      context="Catálogo · Productos"
      title={title}
      closable
      footer={
        <>
          <Button variant="secondary" size="large" icon={<X />} disabled={busy} onPress={closeForm}>
            Cancelar
          </Button>
          {offersReload ? (
            <Button
              variant="primary"
              size="large"
              icon={<RotateCcw />}
              fullWidth
              disabled={busy}
              onPress={() => void handleReload()}
            >
              Recargar el producto
            </Button>
          ) : (
            <Button
              variant="primary"
              size="large"
              icon={<Check />}
              fullWidth
              disabled={busy}
              onPress={() => void submit()}
            >
              Guardar los cambios
            </Button>
          )}
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
              icon={<RotateCcw />}
              title="Otra persona cambió este producto"
              description="Mientras lo editabas se guardó otra versión. Tus cambios no se guardaron: recargá el producto para verla y volvé a hacerlos."
            />
          )}
          {notice?.kind === "notFound" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Este producto ya no existe"
            />
          )}
          {notice?.kind === "reloadFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudieron recargar los datos"
              description="Probá de nuevo."
            />
          )}
          <form.AppField name="name">
            {(field) => <field.TextField kind="plain-text" label="Nombre" required />}
          </form.AppField>
          <form.AppField name="categoryId">
            {(field) => <field.ComboBox label="Categoría" required {...categoryChoice} />}
          </form.AppField>
          <form.AppField name="brandId">
            {(field) => {
              const offered = withCreatedBrand(brands, brandCreation.created);
              return (
                <field.ComboBox
                  label="Marca"
                  options={brandOptions(offered, keptBrandId)}
                  {...brandFieldHelp(offered, field.state.value)}
                  creation={{ recordKind: "marca", onCreate: brandCreation.start }}
                />
              );
            }}
          </form.AppField>
          <form.AppField name="netContent">
            {(field) => (
              <field.QuantityUnitField
                label="Contenido neto"
                options={NET_CONTENT_UNIT_OPTIONS}
                unitLabel="Unidad"
              />
            )}
          </form.AppField>
          <form.AppField name="tagIds">
            {() => (
              <TagsField
                tags={withCreatedTags(tags, tagCreation.created)}
                onCreateTag={tagCreation.start}
                disabled={busy}
              />
            )}
          </form.AppField>
          <FieldGroup label="Unidad de venta" required>
            <form.AppField name="saleUnit">
              {(field) => (
                <field.OptionCardGroup
                  label="Unidad de venta"
                  options={SALE_UNIT_OPTIONS}
                  required
                />
              )}
            </form.AppField>
          </FieldGroup>
          <form.AppField name="barcodes">{() => <BarcodeChips chips={chips} />}</form.AppField>
          <NewBrandModal
            open={brandCreation.open}
            initialName={brandCreation.initialName}
            context="Marcas"
            createBrand={createBrand}
            onCreated={brandCreation.select}
            onClose={brandCreation.close}
            onSessionEnded={onSessionEnded}
          />
          <NewCategoryModal
            open={categoryCreation.open}
            initialName={categoryCreation.initialName}
            onClose={categoryCreation.close}
            onCreated={categoryCreation.select}
            onSessionEnded={onSessionEnded}
            createCategory={createCategory}
            categories={offeredCategories}
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
      ) : null}
    </Modal>
  );
}
