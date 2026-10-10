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
  Select,
  SharedFieldError,
  TextField,
  useFieldContext,
} from "@purosur/ui";
import { Package, Plus, Trash2, TriangleAlert } from "lucide-react";
import { quantityFieldKind } from "../platform/stock-quantity";
import { type BackofficeAccess, canSeePricesArea } from "../shell/backoffice-access";
import { packagingProductOptions } from "./packaging-form";
import {
  emptyPurchaseLine,
  nextPurchaseLineId,
  type PurchaseLineValues,
  type PurchaseProducts,
  purchasePackagingOptions,
} from "./purchase-form";

const LOADED_BY_OPTIONS = [
  { value: "quantity" as const, label: "Cantidad" },
  { value: "packaging" as const, label: "Presentación" },
] as const;

type PurchaseLinesFieldProps = {
  access: BackofficeAccess;
  products: PurchaseProducts;
  packagings: readonly PackagingSummary[];
  refusals: Readonly<Record<number, string>>;
  onLinesChange: () => void;
};

export function PurchaseLinesField({
  access,
  products,
  packagings,
  refusals,
  onLinesChange,
}: PurchaseLinesFieldProps) {
  const field = useFieldContext<PurchaseLineValues[]>();
  const lines = field.state.value;
  const productOptions = packagingProductOptions(products);

  if (!productOptions) {
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
          {lines.map((line, index) => (
            <PurchaseLineFields
              key={line.id}
              line={line}
              offersPriceReview={canSeePricesArea(access)}
              number={index + 1}
              productOptions={productOptions}
              products={products}
              packagings={packagings}
              refusal={refusals[index]}
              removable={lines.length > 1}
              onChange={(patch) => change(line.id, patch)}
              onRemove={() => {
                onLinesChange();
                field.handleChange(lines.filter((other) => other.id !== line.id));
              }}
            />
          ))}
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
  productOptions: NonNullable<ReturnType<typeof packagingProductOptions>>;
  products: PurchaseProducts;
  packagings: readonly PackagingSummary[];
  refusal: string | undefined;
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
  removable,
  onChange,
  onRemove,
}: PurchaseLineFieldsProps) {
  const saleUnit = products.find((product) => product.id === line.productId)?.saleUnit ?? "UNIT";
  const packagingOptions = purchasePackagingOptions(packagings, line.productId);
  const [firstPackaging, ...otherPackagings] = packagingOptions;

  return (
    <fieldset aria-label={`Línea ${number}`} className="min-w-0">
      <Card variant="subtle">
        <div className="flex items-end gap-4">
          <div className="min-w-0 flex-1">
            <ComboBox
              label="Producto"
              placeholder="Elegí un producto"
              options={productOptions}
              value={line.productId}
              onChange={(productId) => onChange({ productId, packagingId: null })}
              required
            />
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
              {firstPackaging ? (
                <Select
                  name={`lines.${line.id}.packagingId`}
                  label="Presentación"
                  placeholder="Elegí una presentación"
                  options={[firstPackaging, ...otherPackagings]}
                  value={line.packagingId}
                  onChange={(packagingId) => onChange({ packagingId })}
                  required
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
