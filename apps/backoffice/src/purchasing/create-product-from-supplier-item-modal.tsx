import { supplierPriceListRowProductCreationBodySchema } from "@purosur/contracts";
import {
  Button,
  EmptyState,
  FieldGroup,
  formatCents,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  Modal,
  useRequestForm,
} from "@purosur/ui";
import { Check, PackagePlus, RotateCcw, ShieldX, Tags, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  BarcodeChips,
  PRODUCT_GENERATE_INTERNAL_BARCODE_FAILED,
  useBarcodeChips,
  useGenerateInternalBarcode,
} from "../platform/barcode-chips";
import { barcodeProblemMessage, barcodeTakenError } from "../platform/barcode-list";
import type { createBrand } from "../platform/brand-creation-api";
import { categorySelectOptions } from "../platform/category-path";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { combineCloudData } from "../platform/combine-cloud-data";
import type { generateInternalBarcode } from "../platform/internal-barcodes-api";
import { NewBrandModal } from "../platform/new-brand-modal";
import { NewTagModal } from "../platform/new-tag-modal";
import {
  BrandFieldWithCreation,
  brandFieldHelp,
  brandOptions,
  useStackedBrandCreation,
  withCreatedBrand,
} from "../platform/product-brand-field";
import {
  NET_CONTENT_UNIT_OPTIONS,
  PRODUCT_BRAND_INACTIVE_ERROR,
  tagInactiveError,
} from "../platform/product-form";
import { TagsField, useStackedTagCreation, withCreatedTags } from "../platform/product-tags-field";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { SALE_UNIT_OPTIONS } from "../platform/sale-unit-options";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { quantityFieldKind } from "../platform/stock-quantity";
import type { createTag } from "../platform/tag-creation-api";
import {
  useProductCreationBrandsQuery,
  useProductCreationCategoriesQuery,
  useProductCreationChoicesRefresh,
  useProductCreationTagsQuery,
  useSupplierItemLinkChoicesQuery,
} from "./purchasing-queries";
import { SupplierItemFact } from "./supplier-item-fact";
import { vatRateOptionsOf, vatRateOrDefault } from "./supplier-item-link-form";
import type { fetchSupplierItemLinkChoices } from "./supplier-item-links-api";
import {
  EMPTY_SUPPLIER_ITEM_PRODUCT_FORM,
  SUPPLIER_ITEM_PRODUCT_CATEGORY_NOT_LEAF_ERROR,
  SUPPLIER_ITEM_PRODUCT_FIELDS,
  SUPPLIER_ITEM_PRODUCT_MESSAGES,
  supplierItemProductFormValuesOf,
  supplierItemProductRequestFrom,
} from "./supplier-item-product-form";
import type {
  createProductFromSupplierItem,
  fetchProductCreationBrands,
  fetchProductCreationCategories,
  fetchProductCreationTags,
} from "./supplier-item-products-api";
import {
  type SupplierPriceListChangeNotice,
  SupplierPriceListChangeNotices,
  supplierPriceListChangeNoticeOf,
  supplierPriceListChangeOutdates,
} from "./supplier-price-list-change-notice";
import type { SupplierPriceListReviewList, SupplierPriceListRow } from "./supplier-price-lists-api";

export type CreateProductFromSupplierItemModalServices = {
  createProductFromSupplierItem: typeof createProductFromSupplierItem;
  fetchProductCreationCategories: typeof fetchProductCreationCategories;
  fetchProductCreationBrands: typeof fetchProductCreationBrands;
  fetchProductCreationTags: typeof fetchProductCreationTags;
  createBrand: typeof createBrand;
  createTag: typeof createTag;
  fetchSupplierItemLinkChoices: typeof fetchSupplierItemLinkChoices;
  generateInternalBarcode: typeof generateInternalBarcode;
};

type CreateProductFromSupplierItemModalProps = {
  list: Pick<SupplierPriceListReviewList, "id" | "version" | "requiresVatRate" | "supplier">;
  target: SupplierPriceListRow | null;
  mayCreateBrandsAndTags: boolean;
  services: CreateProductFromSupplierItemModalServices;
  onCreated: () => void;
  onOutdated: () => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

function FieldHeading({ children }: { children: string }) {
  return <p className="text-detail font-bold">{children}</p>;
}

export function CreateProductFromSupplierItemModal({
  list,
  target,
  mayCreateBrandsAndTags,
  services,
  onCreated,
  onOutdated,
  onClose,
  onSessionEnded,
}: CreateProductFromSupplierItemModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const open = target !== null;
  const [shown, setShown] = useState<SupplierPriceListRow | null>(null);
  const [notice, setNotice] = useState<SupplierPriceListChangeNotice | null>(null);
  const [generateRateLimit, setGenerateRateLimit] = useState<number | null>(null);
  const row = target ?? shown;
  const categories = useProductCreationCategoriesQuery({
    enabled: open,
    fetchProductCreationCategories: services.fetchProductCreationCategories,
    onSessionEnded,
  });
  const brands = useProductCreationBrandsQuery({
    enabled: open,
    fetchProductCreationBrands: services.fetchProductCreationBrands,
    onSessionEnded,
  });
  const tags = useProductCreationTagsQuery({
    enabled: open,
    fetchProductCreationTags: services.fetchProductCreationTags,
    onSessionEnded,
  });
  const choices = useSupplierItemLinkChoicesQuery({
    enabled: open && list.requiresVatRate,
    fetchSupplierItemLinkChoices: services.fetchSupplierItemLinkChoices,
    onSessionEnded,
  });
  const { form, values, submit, submitting, reset } = useRequestForm({
    defaultValues: EMPTY_SUPPLIER_ITEM_PRODUCT_FORM,
    request: {
      schema: supplierPriceListRowProductCreationBodySchema,
      from: (current) => supplierItemProductRequestFrom(current, list.requiresVatRate),
    },
    fields: SUPPLIER_ITEM_PRODUCT_FIELDS,
    messages: SUPPLIER_ITEM_PRODUCT_MESSAGES,
    onSubmit: async (request, { showFieldError, showWireFieldError }) => {
      if (!target) {
        return;
      }
      setNotice(null);
      const outcome = await services.createProductFromSupplierItem(list.id, target.id, request);
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
        showFieldError("categoryId", SUPPLIER_ITEM_PRODUCT_CATEGORY_NOT_LEAF_ERROR);
        return;
      }
      if (outcome.kind === "brand_inactive") {
        showFieldError("brandId", PRODUCT_BRAND_INACTIVE_ERROR);
        return;
      }
      if (outcome.kind === "tag_inactive") {
        showFieldError(
          "tagIds",
          tagInactiveError(tags.status === "loaded" ? tags.value.tags : [], outcome.tagId),
        );
        return;
      }
      setNotice(supplierPriceListChangeNoticeOf(outcome));
    },
  });
  const chips = useBarcodeChips({
    list: values.barcodes,
    setList: (next) => form.setFieldValue("barcodes", next),
    problemMessage: barcodeProblemMessage,
  });
  const generate = useGenerateInternalBarcode(
    chips,
    services.generateInternalBarcode,
    onSessionEnded,
    setGenerateRateLimit,
    () => setGenerateRateLimit(null),
    PRODUCT_GENERATE_INTERNAL_BARCODE_FAILED,
  );

  const catalog = useProductCreationChoicesRefresh();
  const brandCreation = useStackedBrandCreation(
    (brandId) => form.setFieldValue("brandId", brandId),
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
    if (target) {
      reset(supplierItemProductFormValuesOf(target, list.version));
      chips.reset();
      generate.reset();
      setGenerateRateLimit(null);
      setShown(target);
      setNotice(null);
      brandCreation.reset();
      tagCreation.reset();
    }
  }, [
    target,
    list.version,
    reset,
    chips.reset,
    generate.reset,
    brandCreation.reset,
    tagCreation.reset,
  ]);

  const vatRates = choices.status === "loaded" ? choices.value.vatRates : null;
  const vatRateOptions = vatRates === null ? undefined : vatRateOptionsOf(vatRates);

  useEffect(() => {
    if (target && vatRates !== null) {
      form.setFieldValue("vatRate", vatRateOrDefault(form.getFieldValue("vatRate"), vatRates));
    }
  }, [target, vatRates, form]);

  const categoryOptions =
    categories.status === "loaded" ? categorySelectOptions(categories.value) : undefined;
  const productData = combineCloudData(combineCloudData(categories, brands), tags);
  const dataStatus = list.requiresVatRate
    ? combineCloudData(productData, choices).status
    : productData.status;

  function categoryField() {
    if (categories.status === "loading") {
      return <LoadingPlaceholder variant="form" fields={1} />;
    }
    if (categories.status === "failed") {
      return <LoadFailure {...cloudLoadFailure(categories, "las categorías")} />;
    }
    if (!categoryOptions) {
      return <EmptyState icon={<Tags />} title="No hay categorías para elegir" variant="blank" />;
    }
    return (
      <form.AppField name="categoryId">
        {(field) => (
          <field.Select
            label="Categoría"
            placeholder="Elegí una categoría"
            options={categoryOptions}
            required
          />
        )}
      </form.AppField>
    );
  }

  function brandField() {
    if (brands.status === "loading") {
      return <LoadingPlaceholder variant="form" fields={1} />;
    }
    if (brands.status === "failed") {
      return <LoadFailure {...cloudLoadFailure(brands, "las marcas")} />;
    }
    const offered = withCreatedBrand(brands.value, brandCreation.created);
    return (
      <form.AppField name="brandId">
        {(field) => {
          const select = (
            <field.Select
              label="Marca"
              options={brandOptions(offered, null)}
              {...brandFieldHelp(offered, field.state.value)}
            />
          );
          return mayCreateBrandsAndTags ? (
            <BrandFieldWithCreation
              disabled={submitting}
              onCreateBrand={brandCreation.start}
              select={select}
            />
          ) : (
            select
          );
        }}
      </form.AppField>
    );
  }

  function tagsField() {
    if (tags.status === "loading") {
      return <LoadingPlaceholder variant="form" fields={1} />;
    }
    if (tags.status === "failed") {
      return <LoadFailure {...cloudLoadFailure(tags, "los distintivos")} />;
    }
    return (
      <form.AppField name="tagIds">
        {() => (
          <TagsField
            tags={withCreatedTags(tags.value.tags, tagCreation.created)}
            onCreateTag={mayCreateBrandsAndTags ? tagCreation.start : undefined}
            disabled={submitting}
          />
        )}
      </form.AppField>
    );
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          closeForm();
        }
      }}
      width="standard"
      tone="info"
      icon={<PackagePlus />}
      context={list.supplier.name}
      title="Crear producto desde la lista"
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
          {supplierPriceListChangeOutdates(notice) ? (
            <Button
              variant="primary"
              size="large"
              icon={<RotateCcw />}
              fullWidth
              onPress={onOutdated}
            >
              Actualizar la lista
            </Button>
          ) : (
            <Button
              variant="primary"
              size="large"
              icon={<Check />}
              fullWidth
              dataStatus={dataStatus}
              disabled={submitting}
              onPress={() => void submit()}
            >
              Crear el producto
            </Button>
          )}
        </>
      }
    >
      {row ? (
        <div className="flex flex-col gap-4">
          <SupplierPriceListChangeNotices
            notice={notice}
            failedTitle="No se pudo crear el producto"
          />
          {generateRateLimit === null ? null : (
            <InlineNotice
              tone="error"
              icon={<ShieldX />}
              title="Demasiadas solicitudes"
              description={retryAfterDetail(generateRateLimit)}
            />
          )}
          <div className="flex flex-wrap items-end gap-6">
            {row.code === null ? null : (
              <SupplierItemFact label="Código">{row.code}</SupplierItemFact>
            )}
            {row.presentation === null ? null : (
              <SupplierItemFact label="Presentación de compra">{row.presentation}</SupplierItemFact>
            )}
            {row.priceCents === null ? null : (
              <SupplierItemFact label="Precio">{formatCents(row.priceCents)}</SupplierItemFact>
            )}
          </div>
          <form.AppField name="name">
            {(field) => <field.TextField kind="plain-text" label="Nombre" required />}
          </form.AppField>
          {categoryField()}
          {brandField()}
          <form.AppField name="netContent">
            {(field) => (
              <field.QuantityUnitField
                label="Contenido neto"
                options={NET_CONTENT_UNIT_OPTIONS}
                unitLabel="Unidad"
              />
            )}
          </form.AppField>
          {tagsField()}
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
          <form.AppField name="barcodes">
            {() => <BarcodeChips chips={chips} generation={generate.generation} />}
          </form.AppField>
          <div className="grid grid-cols-3 items-start gap-3">
            {row.presentation === null ? (
              <div className="col-span-2">
                <form.AppField name="packagingName">
                  {(field) => (
                    <field.TextField kind="plain-text" label="Presentación de compra" required />
                  )}
                </form.AppField>
              </div>
            ) : null}
            <div>
              <form.AppField name="quantity">
                {(field) => (
                  <field.TextField
                    {...quantityFieldKind(values.saleUnit)}
                    label="Contiene"
                    required
                  />
                )}
              </form.AppField>
            </div>
          </div>
          {list.requiresVatRate ? (
            choices.status === "failed" ? (
              <LoadFailure {...cloudLoadFailure(choices, "el IVA")} />
            ) : vatRateOptions === undefined ? (
              <LoadingPlaceholder variant="form" fields={1} />
            ) : (
              <div className="flex flex-col gap-2">
                <FieldHeading>IVA del ítem</FieldHeading>
                <form.AppField name="vatRate">
                  {(field) => (
                    <field.SegmentedControl label="IVA del ítem" options={vatRateOptions} />
                  )}
                </form.AppField>
              </div>
            )
          ) : null}
          {mayCreateBrandsAndTags ? (
            <>
              <NewBrandModal
                open={brandCreation.open}
                context="Marcas"
                createBrand={services.createBrand}
                onCreated={brandCreation.select}
                onClose={brandCreation.close}
                onSessionEnded={onSessionEnded}
              />
              <NewTagModal
                open={tagCreation.open}
                context="Distintivos"
                services={{ createTag: services.createTag }}
                onCreated={tagCreation.select}
                onClose={tagCreation.close}
                onSessionEnded={onSessionEnded}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
