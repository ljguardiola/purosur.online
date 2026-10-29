import type { CalendarDate } from "@internationalized/date";
import type { PackagingSummary } from "@purosur/contracts";
import type { SaleUnit } from "@purosur/domain";
import {
  Button,
  Card,
  Checkbox,
  ComboBox,
  DateField,
  EmptyState,
  InlineNotice,
  SegmentedControl,
  SharedFieldError,
  TextField,
  useFieldContext,
} from "@purosur/ui";
import { Package, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { creatableChoice } from "../platform/creatable-options";
import type { CreatedProduct, ProductCreationModal } from "../platform/creation-parts";
import { useStackedCreation } from "../platform/stacked-creation";
import { quantityFieldKind } from "../platform/stock-quantity";
import {
  type BackofficeAccess,
  canManageProductsAndCategories,
  canManagePurchasePackagings,
  canSeePricesArea,
} from "../shell/backoffice-access";
import { NewPackagingModal, type NewPackagingModalServices } from "./new-packaging-modal";
import { packagingProductOptions } from "./packaging-form";
import {
  emptyPurchaseLine,
  nextPurchaseLineId,
  type PurchaseLineValues,
  type PurchaseProducts,
  purchasePackagingOptions,
} from "./purchase-form";
import { useMarkPurchasingStale, useRefreshPurchasing } from "./purchasing-queries";

const LOADED_BY_OPTIONS = [
  { value: "quantity" as const, label: "Cantidad" },
  { value: "packaging" as const, label: "Presentación" },
] as const;

type PurchaseLinesFieldProps = {
  access: BackofficeAccess;
  products: PurchaseProducts;
  productCreationModal: ProductCreationModal;
  onProductCreated: (product: CreatedProduct) => void;
  packagings: readonly PackagingSummary[];
  refusals: Readonly<Record<number, string>>;
  onLinesChange: () => void;
  services: NewPackagingModalServices;
  onSessionEnded: () => void;
};

export function PurchaseLinesField({
  access,
  products,
  productCreationModal: ProductCreation,
  onProductCreated,
  packagings,
  refusals,
  onLinesChange,
  services,
  onSessionEnded,
}: PurchaseLinesFieldProps) {
  const field = useFieldContext<PurchaseLineValues[]>();
  const lines = field.state.value;
  const productOptions = packagingProductOptions(products);
  const markPurchasingStale = useMarkPurchasingStale();
  const refreshPurchasing = useRefreshPurchasing();
  const [creatingFor, setCreatingFor] = useState<{ lineId: number; productId: string } | null>(
    null,
  );
  const [creatingProductFor, setCreatingProductFor] = useState<number | null>(null);
  const productCreation = useStackedCreation<CreatedProduct>(
    (product) => {
      onProductCreated(product);
      if (creatingProductFor !== null) {
        change(creatingProductFor, { productId: product.id, packagingId: null });
      }
    },
    { markStale: markPurchasingStale, refresh: refreshPurchasing },
  );
  const [createdPackagings, setCreatedPackagings] = useState<PackagingSummary[]>([]);
  const packagingCreation = useStackedCreation<PackagingSummary>(
    (packaging) => {
      setCreatedPackagings([...createdPackagings, packaging]);
      if (creatingFor !== null) {
        change(creatingFor.lineId, { packagingId: packaging.id });
      }
    },
    { markStale: markPurchasingStale, refresh: refreshPurchasing },
  );
  const offeredPackagings = [
    ...packagings,
    ...createdPackagings.filter(
      (created) => !packagings.some((packaging) => packaging.id === created.id),
    ),
  ];

  if (!productOptions && !canManageProductsAndCategories(access)) {
    return (
      <EmptyState
        icon={<Package />}
        title="No hay productos activos"
        description="Creá uno en Productos para registrar compras."
        variant="blank"
      />
    );
  }

  function change(id: number, patch: Partial<PurchaseLineValues>) {
    onLinesChange();
    field.handleChange(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  return (
    <SharedFieldError>
      {(errorMessageId) => (
        <fieldset
          aria-label="Líneas"
          {...(errorMessageId === undefined ? {} : { "aria-describedby": errorMessageId })}
          className="flex min-w-0 flex-col gap-3"
        >
          {lines.map((line, index) => {
            const productId = line.productId;
            return (
              <PurchaseLineFields
                key={line.id}
                line={line}
                offersPriceReview={canSeePricesArea(access)}
                number={index + 1}
                productOptions={productOptions}
                products={products}
                packagings={offeredPackagings}
                refusal={refusals[index]}
                onCreateProduct={
                  canManageProductsAndCategories(access)
                    ? (typedName) => {
                        setCreatingProductFor(line.id);
                        productCreation.start(typedName);
                      }
                    : null
                }
                onCreatePackaging={
                  canManagePurchasePackagings(access) && productId !== null
                    ? (typedName) => {
                        setCreatingFor({ lineId: line.id, productId });
                        packagingCreation.start(typedName);
                      }
                    : null
                }
                removable={lines.length > 1}
                onChange={(patch) => change(line.id, patch)}
                onRemove={() => {
                  onLinesChange();
                  field.handleChange(lines.filter((other) => other.id !== line.id));
                }}
              />
            );
          })}
          <div>
            <Button
              variant="secondary"
              icon={<Plus />}
              onPress={() => {
                onLinesChange();
                field.handleChange([...lines, emptyPurchaseLine(nextPurchaseLineId(lines))]);
              }}
            >
              Agregar línea
            </Button>
          </div>
          <ProductCreation
            open={productCreation.open}
            initialName={productCreation.initialName}
            onCreated={productCreation.select}
            onClose={productCreation.close}
            onSessionEnded={onSessionEnded}
          />
          <NewPackagingModal
            open={packagingCreation.open}
            products={[...products]}
            {...(creatingFor === null ? {} : { productId: creatingFor.productId })}
            initialName={packagingCreation.initialName}
            services={services}
            onCreated={packagingCreation.select}
            onClose={packagingCreation.close}
            onSessionEnded={onSessionEnded}
          />
        </fieldset>
      )}
    </SharedFieldError>
  );
}

function costLabel(loadedBy: PurchaseLineValues["loadedBy"], saleUnit: SaleUnit): string {
  if (loadedBy === "packaging") {
    return "Costo por presentación ($)";
  }
  return saleUnit === "KG" ? "Costo por kg ($)" : "Costo por unidad ($)";
}

type PurchaseLineFieldsProps = {
  line: PurchaseLineValues;
  offersPriceReview: boolean;
  number: number;
  productOptions: ReturnType<typeof packagingProductOptions>;
  products: PurchaseProducts;
  packagings: readonly PackagingSummary[];
  refusal: string | undefined;
  onCreateProduct: ((typedName: string) => void) | null;
  onCreatePackaging: ((typedName: string) => void) | null;
  removable: boolean;
  onChange: (patch: Partial<PurchaseLineValues>) => void;
  onRemove: () => void;
};

function PurchaseLineFields({
  line,
  offersPriceReview,
  number,
  productOptions,
  products,
  packagings,
  refusal,
  onCreateProduct,
  onCreatePackaging,
  removable,
  onChange,
  onRemove,
}: PurchaseLineFieldsProps) {
  const saleUnit = products.find((product) => product.id === line.productId)?.saleUnit ?? "UNIT";
  const packagingOptions = purchasePackagingOptions(packagings, line.productId);
  const [firstPackaging, ...otherPackagings] = packagingOptions;
  const productChoice = creatableChoice(
    productOptions,
    onCreateProduct === null ? undefined : { recordKind: "producto", onCreate: onCreateProduct },
  );
  const packagingChoice = creatableChoice(
    firstPackaging ? [firstPackaging, ...otherPackagings] : undefined,
    onCreatePackaging === null
      ? undefined
      : { recordKind: "presentación", onCreate: onCreatePackaging },
  );

  return (
    <fieldset aria-label={`Línea ${number}`} className="min-w-0">
      <Card variant="subtle">
        <div className="flex items-end gap-4">
          <div className="min-w-0 flex-1">
            {productChoice ? (
              <ComboBox
                label="Producto"
                placeholder="Elegí un producto"
                value={line.productId}
                onChange={(productId) => onChange({ productId, packagingId: null })}
                required
                {...productChoice}
              />
            ) : null}
          </div>
          <SegmentedControl
            label="Cargar por"
            options={LOADED_BY_OPTIONS}
            value={line.loadedBy}
            onChange={(loadedBy) => onChange({ loadedBy })}
          />
          <Button variant="secondary" icon={<Trash2 />} disabled={!removable} onPress={onRemove}>
            Quitar línea
          </Button>
        </div>
        {line.loadedBy === "packaging" ? (
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              {packagingChoice ? (
                <ComboBox
                  label="Presentación"
                  placeholder="Elegí una presentación"
                  value={line.packagingId}
                  onChange={(packagingId) => onChange({ packagingId })}
                  required
                  {...packagingChoice}
                />
              ) : (
                <InlineNotice
                  tone="info"
                  icon={<Package />}
                  title="Este producto no tiene presentaciones activas"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <TextField
                kind="plain-text"
                label="Cantidad de presentaciones"
                value={line.packages}
                onChange={(packages) => onChange({ packages })}
                required
              />
            </div>
          </div>
        ) : (
          <div className="w-48">
            <TextField
              {...quantityFieldKind(saleUnit)}
              label="Cantidad"
              value={line.quantity}
              onChange={(quantity) => onChange({ quantity })}
              required
            />
          </div>
        )}
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <TextField
              kind="plain-text"
              label={costLabel(line.loadedBy, saleUnit)}
              inputMode="decimal"
              value={line.cost}
              onChange={(cost) => onChange({ cost })}
              required
            />
          </div>
          <div className="min-w-0 flex-1">
            <TextField
              kind="plain-text"
              label="Lote"
              value={line.lotNumber}
              onChange={(lotNumber) => onChange({ lotNumber })}
            />
          </div>
          <div className="min-w-0 flex-1">
            <DateField
              name={`lines.${line.id}.expiresOn`}
              label="Vencimiento"
              value={line.expiresOn}
              onChange={(expiresOn: CalendarDate | null) => onChange({ expiresOn })}
            />
          </div>
        </div>
        {offersPriceReview ? (
          <Checkbox
            name={`lines.${line.id}.reviewPriceNow`}
            checked={line.reviewPriceNow}
            onCheckedChange={(reviewPriceNow) => onChange({ reviewPriceNow })}
          >
            Revisar el precio ahora
          </Checkbox>
        ) : null}
        {refusal === undefined ? null : (
          <InlineNotice tone="error" icon={<TriangleAlert />} title={refusal} />
        )}
      </Card>
    </fieldset>
  );
}
