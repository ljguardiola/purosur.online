import { supplierPriceListRowLinkBodySchema } from "@purosur/contracts";
import {
  Button,
  ButtonLink,
  EmptyState,
  formatCents,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  Modal,
  useRequestForm,
} from "@purosur/ui";
import { formatProductDescription } from "@purosur/ui/formatters";
import {
  Check,
  ExternalLink,
  Link2,
  Package,
  PackagePlus,
  RotateCcw,
  ScanBarcode,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { creatableChoice } from "../platform/creatable-options";
import { withCreatedProducts } from "../platform/created-products";
import type { CreatedProduct, ProductCreationModal } from "../platform/creation-parts";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { useStackedCreation } from "../platform/stacked-creation";
import {
  useMarkPurchasingStale,
  useRefreshSupplierItemLinkChoices,
  useSupplierItemLinkChoicesQuery,
  useSupplierItemLinkProposalQuery,
} from "./purchasing-queries";
import { SupplierItemFact } from "./supplier-item-fact";
import {
  EMPTY_SUPPLIER_ITEM_LINK_FORM,
  linkProductOptions,
  proposedProductIdOf,
  SUPPLIER_ITEM_LINK_FIELD_MESSAGES,
  SUPPLIER_ITEM_LINK_FIELDS,
  supplierItemLinkFormValuesOf,
  supplierItemLinkRequestFrom,
  vatRateOptionsOf,
  vatRateOrDefault,
} from "./supplier-item-link-form";
import type {
  fetchSupplierItemLinkChoices,
  fetchSupplierItemLinkProposal,
} from "./supplier-item-links-api";
import {
  SUPPLIER_ITEM_QUANTITY_UNIT_OPTIONS,
  supplierItemQuantityFieldKind,
} from "./supplier-item-quantity";
import {
  type SupplierPriceListChangeNotice,
  SupplierPriceListChangeNotices,
  supplierPriceListChangeNoticeOf,
  supplierPriceListChangeOutdates,
} from "./supplier-price-list-change-notice";
import type {
  linkSupplierPriceListRow,
  SupplierPriceListReviewList,
  SupplierPriceListRow,
} from "./supplier-price-lists-api";

export type LinkSupplierItemModalServices = {
  linkSupplierPriceListRow: typeof linkSupplierPriceListRow;
  fetchSupplierItemLinkProposal: typeof fetchSupplierItemLinkProposal;
  fetchSupplierItemLinkChoices: typeof fetchSupplierItemLinkChoices;
};

type LinkSupplierItemModalProps = {
  list: Pick<SupplierPriceListReviewList, "id" | "version" | "requiresVatRate" | "source">;
  target: SupplierPriceListRow | null;
  productCreationModal?: ProductCreationModal | undefined;
  remembersOnConfirm: boolean;
  onCreateProduct: ((row: SupplierPriceListRow) => void) | null;
  services: LinkSupplierItemModalServices;
  onLinked: () => void;
  onOutdated: () => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

const CONTEXT = "Pedidos · Vincular un ítem";

function FieldHeading({ children }: { children: string }) {
  return <p className="text-detail font-bold">{children}</p>;
}

export function LinkSupplierItemModal({
  list,
  target,
  productCreationModal: ProductCreation,
  remembersOnConfirm,
  onCreateProduct,
  services,
  onLinked,
  onOutdated,
  onClose,
  onSessionEnded,
}: LinkSupplierItemModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const refreshChoices = useRefreshSupplierItemLinkChoices();
  const open = target !== null;
  const [shown, setShown] = useState<SupplierPriceListRow | null>(null);
  const [notice, setNotice] = useState<SupplierPriceListChangeNotice | null>(null);
  const row = target ?? shown;
  const choices = useSupplierItemLinkChoicesQuery({
    enabled: open,
    fetchSupplierItemLinkChoices: services.fetchSupplierItemLinkChoices,
    onSessionEnded,
  });
  const proposal = useSupplierItemLinkProposalQuery({
    listId: list.id,
    rowId: row?.id ?? "",
    enabled: open,
    fetchSupplierItemLinkProposal: services.fetchSupplierItemLinkProposal,
    onSessionEnded,
  });
  const { form, values, submit, submitting, reset } = useRequestForm({
    defaultValues: EMPTY_SUPPLIER_ITEM_LINK_FORM,
    request: {
      schema: supplierPriceListRowLinkBodySchema,
      from: (current) => supplierItemLinkRequestFrom(current, list.requiresVatRate),
    },
    fields: SUPPLIER_ITEM_LINK_FIELDS,
    messages: SUPPLIER_ITEM_LINK_FIELD_MESSAGES,
    onSubmit: async (request, { showWireFieldError }) => {
      if (!target) {
        return;
      }
      setNotice(null);
      const outcome = await services.linkSupplierPriceListRow(list.id, target.id, request);
      if (outcome.kind === "ok") {
        onLinked();
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
      if (outcome.kind === "product_not_linkable") {
        form.setFieldValue("productId", null);
        void refreshChoices();
      }
      setNotice(supplierPriceListChangeNoticeOf(outcome));
    },
  });

  const markPurchasingStale = useMarkPurchasingStale();
  const productCreation = useStackedCreation<CreatedProduct>(
    (product) => {
      form.setFieldValue("productId", product.id);
      form.setFieldValue("quantity", "");
    },
    { markStale: markPurchasingStale, refresh: refreshChoices },
  );
  const resetProductCreation = productCreation.reset;
  useEffect(() => {
    if (target) {
      resetProductCreation();
    }
  }, [target, resetProductCreation]);
  const closeForm = () => {
    productCreation.finish();
    onClose();
  };
  const offered =
    choices.status === "loaded"
      ? {
          ...choices.value,
          products: withCreatedProducts(
            choices.value.products,
            productCreation.created
              ? [
                  {
                    id: productCreation.created.id,
                    name: productCreation.created.name,
                    saleUnit: productCreation.created.saleUnit,
                    brandName: productCreation.created.brandName,
                    netContent: productCreation.created.netContent,
                  },
                ]
              : [],
          ),
        }
      : undefined;

  const proposedId = proposal.status === "loaded" ? proposedProductIdOf(proposal.value) : null;
  const proposedOffered =
    choices.status === "loaded" &&
    choices.value.products.some((product) => product.id === proposedId);

  useEffect(() => {
    if (target) {
      reset(supplierItemLinkFormValuesOf(target.link, list.version));
      setShown(target);
      setNotice(null);
    }
  }, [target, list.version, reset]);

  const vatRates = choices.status === "loaded" ? choices.value.vatRates : null;
  const vatRateOptions = vatRates === null ? undefined : vatRateOptionsOf(vatRates);

  useEffect(() => {
    if (target && vatRates !== null) {
      form.setFieldValue("vatRate", vatRateOrDefault(form.getFieldValue("vatRate"), vatRates));
    }
  }, [target, vatRates, form]);

  useEffect(() => {
    if (target && proposedOffered && form.getFieldValue("productId") === null) {
      form.setFieldValue("productId", proposedId);
    }
  }, [target, proposedOffered, proposedId, form]);

  const productChoice = creatableChoice(
    offered ? linkProductOptions(offered) : undefined,
    ProductCreation ? { recordKind: "producto", onCreate: productCreation.start } : undefined,
  );
  const chosenProduct = offered?.products.find((product) => product.id === values.productId);
  const chosenSaleUnit = chosenProduct?.saleUnit;

  useEffect(() => {
    if (chosenSaleUnit !== undefined && form.getFieldValue("saleUnit") !== chosenSaleUnit) {
      form.setFieldValue("saleUnit", chosenSaleUnit);
    }
  }, [chosenSaleUnit, form]);
  const pageLink =
    row?.page != null && list.source.kind === "PDF"
      ? `/api/supplier-price-lists/${list.id}/file#page=${row.page}`
      : null;

  function proposalNotice() {
    if (proposal.status === "loading") {
      return <LoadingPlaceholder variant="card" lines={0} />;
    }
    if (proposal.status === "failed") {
      return <LoadFailure {...cloudLoadFailure(proposal, "la propuesta de producto")} />;
    }
    if (proposal.value.kind === "unavailable") {
      return (
        <p className="text-detail text-text-subtle">
          No pudimos proponer un producto. Podés buscarlo vos.
        </p>
      );
    }
    if (proposal.value.kind === "none") {
      return (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-detail text-text-subtle">Sin propuesta para este ítem.</p>
          {onCreateProduct !== null && row?.mayCreateProduct ? (
            <Button variant="text" icon={<PackagePlus />} onPress={() => onCreateProduct(row)}>
              Crear producto
            </Button>
          ) : null}
        </div>
      );
    }
    const { by, product } = proposal.value;
    return by === "barcode" ? (
      <InlineNotice
        tone="info"
        icon={<ScanBarcode />}
        title={`Propuesto por código de barras: ${formatProductDescription(product)}`}
      />
    ) : (
      <InlineNotice
        tone="info"
        icon={<Sparkles />}
        title={`Propuesto por IA: ${formatProductDescription(product)}`}
      />
    );
  }

  function choiceFields() {
    if (choices.status === "loading") {
      return <LoadingPlaceholder variant="form" fields={2} />;
    }
    if (choices.status === "failed") {
      return <LoadFailure {...cloudLoadFailure(choices, "los productos")} />;
    }
    if (!productChoice) {
      return (
        <EmptyState
          icon={<Package />}
          title="No hay productos activos"
          description="Creá uno en Productos para vincular el ítem."
          variant="blank"
        />
      );
    }
    return (
      <>
        <form.AppField
          name="productId"
          listeners={{ onChange: () => form.setFieldValue("quantity", "") }}
        >
          {(field) => (
            <field.ComboBox
              label="Producto del catálogo"
              placeholder="Buscar un producto"
              required
              {...productChoice}
            />
          )}
        </form.AppField>
        {chosenProduct === undefined ? null : (
          <div className="flex flex-col gap-2">
            <form.AppField name="quantity">
              {(field) => (
                <field.TextField
                  {...supplierItemQuantityFieldKind(chosenProduct.saleUnit, values.quantityUnit)}
                  label="Cantidad que trae"
                  required
                />
              )}
            </form.AppField>
            {chosenProduct.saleUnit === "KG" ? (
              <>
                <FieldHeading>Unidad de la cantidad</FieldHeading>
                <form.AppField name="quantityUnit">
                  {(field) => (
                    <field.SegmentedControl
                      label="Unidad de la cantidad"
                      options={SUPPLIER_ITEM_QUANTITY_UNIT_OPTIONS}
                    />
                  )}
                </form.AppField>
              </>
            ) : null}
          </div>
        )}
        {list.requiresVatRate && vatRateOptions !== undefined ? (
          <div className="flex flex-col gap-2">
            <FieldHeading>IVA del ítem</FieldHeading>
            <form.AppField name="vatRate">
              {(field) => <field.SegmentedControl label="IVA del ítem" options={vatRateOptions} />}
            </form.AppField>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            closeForm();
          }
        }}
        width="standard"
        tone="info"
        icon={<Link2 />}
        context={CONTEXT}
        title={row?.description ?? ""}
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
                dataStatus={choices.status}
                disabled={submitting}
                onPress={() => void submit()}
              >
                Vincular
              </Button>
            )}
          </>
        }
      >
        {row ? (
          <div className="flex flex-col gap-4">
            <SupplierPriceListChangeNotices notice={notice} failedTitle="No se vinculó el ítem" />
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
              {pageLink === null ? null : (
                <ButtonLink
                  variant="text"
                  icon={<ExternalLink />}
                  href={pageLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {`Ver la página ${row.page}`}
                </ButtonLink>
              )}
            </div>
            {proposalNotice()}
            {choiceFields()}
            <p className="text-detail text-text-subtle">
              {remembersOnConfirm
                ? "Al confirmar la lista, el vínculo se recuerda y las próximas listas de este proveedor reconocen el ítem solas."
                : "El vínculo se recuerda: en las próximas listas de este proveedor el ítem se reconoce solo."}
            </p>
          </div>
        ) : null}
      </Modal>
      {ProductCreation ? (
        <ProductCreation
          open={productCreation.open}
          initialName={productCreation.initialName}
          onCreated={productCreation.select}
          onClose={productCreation.close}
          onSessionEnded={onSessionEnded}
        />
      ) : null}
    </>
  );
}
