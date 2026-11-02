import type { CalendarDate } from "@internationalized/date";
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
  canSeePricesArea,
} from "../shell/backoffice-access";
import { PackageCountInputs } from "./package-count-inputs";
import {
  emptyPurchaseLine,
  nextPurchaseLineId,
  type PurchaseLineValues,
  type PurchaseProducts,
  purchaseProductOptions,
} from "./purchase-form";
import { useMarkPurchasingStale, useRefreshPurchasing } from "./purchasing-queries";

const LOADED_BY_OPTIONS = [
  { value: "quantity" as const, label: "Cantidad" },
  { value: "packages" as const, label: "Paquetes" },
] as const;

type PurchaseLinesFieldProps = {
  access: BackofficeAccess;
  products: PurchaseProducts;
  productCreationModal: ProductCreationModal;
  onProductCreated: (product: CreatedProduct) => void;
  refusals: Readonly<Record<number, string>>;
  onLinesChange: () => void;
  onSessionEnded: () => void;
};

export function PurchaseLinesField({
  access,
  products,
  productCreationModal: ProductCreation,
  onProductCreated,
  refusals,
  onLinesChange,
  onSessionEnded,
}: PurchaseLinesFieldProps) {
  const field = useFieldContext<PurchaseLineValues[]>();
  const lines = field.state.value;
  function change(id: number, patch: Partial<PurchaseLineValues>) {
    onLinesChange();
    field.handleChange(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  const productOptions = purchaseProductOptions(products);
  const markPurchasingStale = useMarkPurchasingStale();
  const refreshPurchasing = useRefreshPurchasing();
  const [creatingProductFor, setCreatingProductFor] = useState<number | null>(null);
  const productCreation = useStackedCreation<CreatedProduct>(
    (product) => {
      onProductCreated(product);
      if (creatingProductFor !== null) {
        change(creatingProductFor, { productId: product.id });
      }
    },
    { markStale: markPurchasingStale, refresh: refreshPurchasing },
  );
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

  return (
    <SharedFieldError>
      {(errorMessageId) => (
        <fieldset
          aria-label="Líneas"
          {...(errorMessageId === undefined ? {} : { "aria-describedby": errorMessageId })}
          className="flex min-w-0 flex-col gap-3"
        >
          {lines.map((line, index) => {
            return (
              <PurchaseLineFields
                key={line.id}
                line={line}
                offersPriceReview={canSeePricesArea(access)}
                number={index + 1}
                productOptions={productOptions}
                products={products}
                refusal={refusals[index]}
                onCreateProduct={
                  canManageProductsAndCategories(access)
                    ? (typedName) => {
                        setCreatingProductFor(line.id);
                        productCreation.start(typedName);
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
        </fieldset>
      )}
    </SharedFieldError>
  );
}

function costLabel(loadedBy: PurchaseLineValues["loadedBy"], saleUnit: SaleUnit): string {
  if (loadedBy === "packages") {
    return "Costo por paquete ($)";
  }
  return saleUnit === "KG" ? "Costo por kg ($)" : "Costo por unidad ($)";
}

type PurchaseLineFieldsProps = {
  line: PurchaseLineValues;
  offersPriceReview: boolean;
  number: number;
  productOptions: ReturnType<typeof purchaseProductOptions>;
  products: PurchaseProducts;
  refusal: string | undefined;
  onCreateProduct: ((typedName: string) => void) | null;
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
  refusal,
  onCreateProduct,
  removable,
  onChange,
  onRemove,
}: PurchaseLineFieldsProps) {
  const saleUnit = products.find((product) => product.id === line.productId)?.saleUnit ?? "UNIT";
  const productChoice = creatableChoice(
    productOptions,
    onCreateProduct === null ? undefined : { recordKind: "producto", onCreate: onCreateProduct },
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
                onChange={(productId) => onChange({ productId })}
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
        {line.loadedBy === "packages" ? (
          <PackageCountInputs
            saleUnit={saleUnit}
            packages={line.packages}
            quantityPerPackage={line.quantityPerPackage}
            onPackagesChange={(packages) => onChange({ packages })}
            onQuantityPerPackageChange={(quantityPerPackage) => onChange({ quantityPerPackage })}
          />
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
