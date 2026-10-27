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
import { categorySelectOptions } from "../platform/category-path";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import type { generateInternalBarcode } from "../platform/internal-barcodes-api";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { SALE_UNIT_OPTIONS } from "../platform/sale-unit-options";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { quantityFieldKind } from "../platform/stock-quantity";
import {
  useProductCreationCategoriesQuery,
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
  fetchProductCreationCategories,
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
  fetchSupplierItemLinkChoices: typeof fetchSupplierItemLinkChoices;
  generateInternalBarcode: typeof generateInternalBarcode;
};

type CreateProductFromSupplierItemModalProps = {
  list: Pick<SupplierPriceListReviewList, "id" | "version" | "requiresVatRate" | "supplier">;
  target: SupplierPriceListRow | null;
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

  useEffect(() => {
    if (target) {
      reset(supplierItemProductFormValuesOf(target, list.version));
      chips.reset();
      generate.reset();
      setGenerateRateLimit(null);
      setShown(target);
      setNotice(null);
    }
  }, [target, list.version, reset, chips.reset, generate.reset]);

  const vatRates = choices.status === "loaded" ? choices.value.vatRates : null;
  const vatRateOptions = vatRates === null ? undefined : vatRateOptionsOf(vatRates);

  useEffect(() => {
    if (target && vatRates !== null) {
      form.setFieldValue("vatRate", vatRateOrDefault(form.getFieldValue("vatRate"), vatRates));
    }
  }, [target, vatRates, form]);

  const categoryOptions =
    categories.status === "loaded" ? categorySelectOptions(categories.value) : undefined;
  const dataStatus =
    categories.status !== "loaded" || !list.requiresVatRate ? categories.status : choices.status;

  function categoryField() {
    if (categories.status === "loading") {
      return <LoadingPlaceholder variant="form" fields={1} />;
    }
    if (categories.status === "failed") {
      return <LoadFailure {...cloudLoadFailure(categories, "las categorías")} />;
    }
    if (!categoryOptions) {
      return (
        <EmptyState
          icon={<Tags />}
          title="No hay categorías para elegir"
          description="Creá una en Categorías para crear el producto."
          variant="blank"
        />
      );
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

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      width="standard"
      tone="info"
      icon={<PackagePlus />}
      context={row === null ? "" : `${row.description} · ${list.supplier.name}`}
      title="Crear producto desde la lista"
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
              <SupplierItemFact label="Presentación">{row.presentation}</SupplierItemFact>
            )}
            {row.priceCents === null ? null : (
              <SupplierItemFact label="Precio">{formatCents(row.priceCents)}</SupplierItemFact>
            )}
          </div>
          <form.AppField name="name">
            {(field) => <field.TextField kind="plain-text" label="Nombre" required />}
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
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <form.AppField name="packagingName">
                {(field) => (
                  <field.TextField kind="plain-text" label="Presentación de compra" required />
                )}
              </form.AppField>
            </div>
            <div className="flex-1">
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
          <FieldHeading>Para guardarlo falta completar:</FieldHeading>
          <form.AppField name="barcodes">
            {() => <BarcodeChips chips={chips} generation={generate.generation} />}
          </form.AppField>
          {categoryField()}
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
        </div>
      ) : null}
    </Modal>
  );
}
