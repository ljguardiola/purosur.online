import {
  type BrandSummary,
  type CategorySummary,
  type ProductSummary,
  productEditBodySchema,
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
import { Check, Pencil, RotateCcw, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { BarcodeChips, useBarcodeChips } from "./barcode-chips";
import type { createBrand } from "./brands-api";
import type { ProductReload } from "./catalog-queries";
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
  editedProductBarcodeProblemMessage,
  NET_CONTENT_UNIT_OPTIONS,
  PRODUCT_BRAND_INACTIVE_ERROR,
  PRODUCT_CATEGORY_NOT_LEAF_ERROR,
  PRODUCT_EDIT_FIELDS,
  PRODUCT_EDIT_MESSAGES,
  PRODUCT_INTERNAL_BARCODE_ON_PRODUCT_WITH_BARCODES_ERROR,
  productEditRequestFrom,
  productFormValues,
  SALE_UNIT_OPTIONS,
  saleUnitHeldByDiscountError,
  tagInactiveError,
} from "./product-form";
import { TagsField, useStackedTagCreation, withCreatedTags } from "./product-tags-field";
import type { editProduct } from "./products-api";
import type { createTag } from "./tags-api";

export type EditProductModalServices = {
  editProduct: typeof editProduct;
  createBrand: typeof createBrand;
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
  const { editProduct, createBrand, createTag } = services;
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
    latest: () => form.state.values.barcodes,
    setList: (next) => form.setFieldValue("barcodes", next),
    problemMessage: editedProductBarcodeProblemMessage,
  });

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
    if (open && target) {
      reset(productFormValues(target));
      setTitle(target.name);
      setKeptBrandId(target.brandId);
      chips.reset();
      setNotice(null);
      setReloading(false);
      brandCreation.reset();
      tagCreation.reset();
    }
  }, [open, target, reset, chips.reset, brandCreation.reset, tagCreation.reset]);

  const categoryOptions = categorySelectOptions(categories);

  async function handleReload() {
    if (!target) {
      return;
    }
    setReloading(true);
    const outcome = await reload(target.id);
    if (outcome.kind === "found") {
      reset(productFormValues(outcome.product));
      setTitle(outcome.product.name);
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
            {(field) =>
              categoryOptions ? (
                <field.Select label="Categoría" options={categoryOptions} required />
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
                  disabled={busy}
                  onCreateBrand={brandCreation.start}
                  select={
                    <field.Select
                      label="Marca"
                      options={brandOptions(offered, keptBrandId)}
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
      ) : null}
    </Modal>
  );
}
