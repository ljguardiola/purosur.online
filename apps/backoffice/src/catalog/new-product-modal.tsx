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
import { useSendToMyAccount } from "../access/send-to-my-account";
import { retryAfterDetail } from "../platform/retry-after-detail";
import {
  BarcodeChips,
  PRODUCT_GENERATE_INTERNAL_BARCODE_FAILED,
  useBarcodeChips,
  useGenerateInternalBarcode,
} from "./barcode-chips";
import type { createBrand } from "./brands-api";
import { NewBrandModal } from "./new-brand-modal";
import { NewTagModal } from "./new-tag-modal";
import {
  BrandFieldWithCreation,
  brandFieldHelp,
  brandOptions,
  useStackedBrandCreation,
  withCreatedBrand,
} from "./product-brand-field";
import {
  barcodeTakenError,
  categoryNameOf,
  categorySelectOptions,
  EMPTY_PRODUCT_FORM,
  NET_CONTENT_UNIT_OPTIONS,
  PRODUCT_BRAND_INACTIVE_ERROR,
  PRODUCT_CATEGORY_NOT_LEAF_ERROR,
  PRODUCT_FIELDS,
  PRODUCT_MESSAGES,
  productRequestFrom,
  SALE_UNIT_OPTIONS,
  tagInactiveError,
} from "./product-form";
import { TagsField, useStackedTagCreation, withCreatedTags } from "./product-tags-field";
import type { createProduct, generateInternalBarcode } from "./products-api";
import type { createTag } from "./tags-api";

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
    latest: () => form.state.values.barcodes,
    setList: (next) => form.setFieldValue("barcodes", next),
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

  const brandCreation = useStackedBrandCreation((brandId) =>
    form.setFieldValue("brandId", brandId),
  );
  const tagCreation = useStackedTagCreation((tagId) =>
    form.setFieldValue("tagIds", [...form.state.values.tagIds, tagId]),
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
        <form.AppField name="name">
          {(field) => <field.TextField kind="plain-text" label="Nombre" required />}
        </form.AppField>
        <form.AppField name="categoryId">
          {(field) =>
            categoryOptions ? (
              <field.Select
                label="Categoría"
                placeholder="Elegí una categoría"
                options={categoryOptions}
                required
              />
            ) : (
              <FieldGroup label="Categoría" required>
                <SharedFieldError>{() => null}</SharedFieldError>
              </FieldGroup>
            )
          }
        </form.AppField>
        <form.AppField name="brandId">
          {(field) => {
            const offered = withCreatedBrand(brands, brandCreation.created);
            return (
              <BrandFieldWithCreation
                disabled={submitting}
                onCreateBrand={brandCreation.start}
                select={
                  <field.Select
                    label="Marca"
                    options={brandOptions(offered, null)}
                    {...brandFieldHelp(offered, field.state.value)}
                  />
                }
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
              disabled={submitting}
            />
          )}
        </form.AppField>
        <FieldGroup label="Unidad de venta" required>
          <form.AppField name="saleUnit">
            {(field) => (
              <field.OptionCardGroup label="Unidad de venta" options={SALE_UNIT_OPTIONS} required />
            )}
          </form.AppField>
        </FieldGroup>
        <form.AppField name="barcodes">
          {() => (
            <BarcodeChips
              chips={chips}
              onGenerate={() => void generate.handleGenerate()}
              generateDisabled={generate.disabled}
              generateError={generate.generateError}
            />
          )}
        </form.AppField>
        <NewBrandModal
          open={brandCreation.open}
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
