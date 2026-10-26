import { supplierPriceListRowLinkBodySchema } from "@purosur/contracts";
import {
  Button,
  ButtonLink,
  EmptyState,
  formatCents,
  type Icon,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  Modal,
  useRequestForm,
} from "@purosur/ui";
import {
  Check,
  ExternalLink,
  Link2,
  LoaderCircle,
  Package,
  Plus,
  RotateCcw,
  ScanBarcode,
  Sparkles,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { NewPackagingModal, type NewPackagingModalServices } from "./new-packaging-modal";
import {
  useRefreshSupplierItemLinkChoices,
  useSupplierItemLinkChoicesQuery,
  useSupplierItemLinkProposalQuery,
} from "./purchasing-queries";
import {
  EMPTY_SUPPLIER_ITEM_LINK_FORM,
  linkPackagingOptions,
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
} & NewPackagingModalServices;

type LinkSupplierItemModalProps = {
  list: Pick<SupplierPriceListReviewList, "id" | "version" | "pricesIncludeVat" | "source">;
  target: SupplierPriceListRow | null;
  mayCreatePackaging: boolean;
  services: LinkSupplierItemModalServices;
  onLinked: () => void;
  onOutdated: () => void;
  onClose: () => void;
  onSessionEnded: () => void;
};

const CONTEXT = "Pedidos · Vincular un ítem";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-detail text-text-subtle">{label}</span>
      <span className="text-body font-bold">{children}</span>
    </div>
  );
}

function FieldHeading({ children }: { children: string }) {
  return <p className="text-detail font-bold">{children}</p>;
}

export function LinkSupplierItemModal({
  list,
  target,
  mayCreatePackaging,
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
  const [creatingPackaging, setCreatingPackaging] = useState(false);
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
      from: (current) => supplierItemLinkRequestFrom(current, list.pricesIncludeVat),
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
      if (outcome.kind === "packaging_not_linkable") {
        form.setFieldValue("packagingId", null);
        void refreshChoices();
      }
      setNotice(supplierPriceListChangeNoticeOf(outcome));
    },
  });

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

  const products =
    choices.status === "loaded" ? choices.value.products.map(({ id, name }) => ({ id, name })) : [];
  const productOptions =
    choices.status === "loaded" ? linkProductOptions(choices.value) : undefined;
  const packagingOptions =
    choices.status === "loaded" ? linkPackagingOptions(choices.value, values.productId) : undefined;
  const chosenProduct =
    choices.status === "loaded"
      ? choices.value.products.find((product) => product.id === values.productId)
      : undefined;
  const asksForVatRate = list.pricesIncludeVat !== true;
  const pageLink =
    row?.page != null && list.source.kind === "PDF"
      ? `/api/supplier-price-lists/${list.id}/file#page=${row.page}`
      : null;

  function proposalNotice() {
    if (proposal.status === "loading") {
      return <InlineNotice tone="info" icon={<LoaderCircle />} title="Buscando una propuesta…" />;
    }
    if (proposal.status === "failed" || proposal.value.kind === "unavailable") {
      return (
        <p className="text-detail text-text-subtle">
          No pudimos proponer un producto. Podés buscarlo vos.
        </p>
      );
    }
    if (proposal.value.kind === "none") {
      return <p className="text-detail text-text-subtle">Sin propuesta para este ítem.</p>;
    }
    const { by, product } = proposal.value;
    return by === "barcode" ? (
      <InlineNotice
        tone="info"
        icon={<ScanBarcode />}
        title={`Propuesto por código de barras: ${product.name}`}
      />
    ) : (
      <InlineNotice tone="info" icon={<Sparkles />} title={`Propuesto por IA: ${product.name}`} />
    );
  }

  function choiceFields() {
    if (choices.status === "loading") {
      return <LoadingPlaceholder variant="form" fields={2} />;
    }
    if (choices.status === "failed") {
      return <LoadFailure {...cloudLoadFailure(choices, "los productos")} />;
    }
    if (!productOptions) {
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
          listeners={{ onChange: () => form.setFieldValue("packagingId", null) }}
        >
          {(field) => (
            <field.ComboBox
              variant="search"
              label="Producto del catálogo"
              placeholder="Buscar un producto"
              options={productOptions}
              required
            />
          )}
        </form.AppField>
        {values.productId === null ? null : (
          <div className="flex flex-col gap-2">
            <FieldHeading>Presentación de compra</FieldHeading>
            {packagingOptions ? (
              <form.AppField name="packagingId">
                {(field) => (
                  <field.OptionCardGroup
                    layout="row"
                    label="Presentación de compra"
                    options={withPackageIcon(packagingOptions)}
                    required
                  />
                )}
              </form.AppField>
            ) : (
              <InlineNotice
                tone="info"
                icon={<Package />}
                title="Este producto no tiene presentaciones de compra"
                {...(mayCreatePackaging
                  ? { description: "Creá una para poder vincular el ítem." }
                  : {})}
              />
            )}
            {mayCreatePackaging ? (
              <div>
                <Button variant="text" icon={<Plus />} onPress={() => setCreatingPackaging(true)}>
                  Nueva presentación
                </Button>
              </div>
            ) : null}
          </div>
        )}
        {asksForVatRate && vatRateOptions !== undefined ? (
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
            onClose();
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
              {row.code === null ? null : <Fact label="Código">{row.code}</Fact>}
              {row.presentation === null ? null : (
                <Fact label="Presentación">{row.presentation}</Fact>
              )}
              {row.priceCents === null ? null : (
                <Fact label="Precio">{formatCents(row.priceCents)}</Fact>
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
              El vínculo se recuerda: en las próximas listas de este proveedor el ítem se reconoce
              solo.
            </p>
          </div>
        ) : null}
      </Modal>
      <NewPackagingModal
        open={creatingPackaging && chosenProduct !== undefined}
        products={products.length === 0 || !chosenProduct ? [] : [chosenProduct]}
        {...(chosenProduct ? { productId: chosenProduct.id } : {})}
        context={CONTEXT}
        services={services}
        onCreated={(packaging) => {
          setCreatingPackaging(false);
          void refreshChoices();
          form.setFieldValue("packagingId", packaging.id);
        }}
        onClose={() => setCreatingPackaging(false)}
        onSessionEnded={onSessionEnded}
      />
    </>
  );
}

function withPackageIcon(
  options: NonNullable<ReturnType<typeof linkPackagingOptions>>,
): readonly [
  { value: string; label: string; description: string; icon: Icon },
  ...{ value: string; label: string; description: string; icon: Icon }[],
] {
  const [first, ...rest] = options;
  return [
    { ...first, icon: <Package /> },
    ...rest.map((option) => ({ ...option, icon: <Package /> })),
  ];
}
