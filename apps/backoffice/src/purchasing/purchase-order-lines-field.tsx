import type { PurchaseOrderDetail } from "@purosur/contracts";
import {
  Button,
  Card,
  ComboBox,
  formatCents,
  type LoadStatus,
  SharedFieldError,
  useFieldContext,
} from "@purosur/ui";
import { formatProductDescription } from "@purosur/ui/formatters";
import { Plus, Trash2 } from "lucide-react";
import { creatableChoice } from "../platform/creatable-options";
import { packageCountOf, quantityPerPackageOf } from "./package-count-form";
import { PackageCountInputs } from "./package-count-inputs";
import { type PurchaseProducts, purchaseProductOptions } from "./purchase-form";
import { emptyOrderLine, nextOrderLineId, type OrderLineValues } from "./purchase-order-form";

type SavedLine = PurchaseOrderDetail["lines"][number];

type PurchaseOrderLinesFieldProps = {
  savedLines: readonly SavedLine[];
  products: PurchaseProducts;
  productsStatus: LoadStatus;
  onLinesChange: () => void;
};

export function PurchaseOrderLinesField({
  savedLines,
  products,
  productsStatus,
  onLinesChange,
}: PurchaseOrderLinesFieldProps) {
  const field = useFieldContext<OrderLineValues[]>();
  const lines = field.state.value;
  function change(id: number, patch: Partial<OrderLineValues>) {
    onLinesChange();
    field.handleChange(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  const knownProducts = new Map<string, SavedLine["product"]>([
    ...products.map((product) => [product.id, product] as const),
    ...savedLines.map((saved) => [saved.product.id, saved.product] as const),
  ]);
  const usedProductIds = new Set(lines.flatMap((line) => (line.productId ? [line.productId] : [])));

  return (
    <SharedFieldError>
      {(errorMessageId) => (
        <fieldset
          aria-label="Líneas"
          {...(errorMessageId === undefined ? {} : { "aria-describedby": errorMessageId })}
          className="flex min-w-0 flex-col gap-3"
        >
          {lines.map((line, index) => {
            const saved = savedLines.find((candidate) => candidate.product.id === line.productId);
            const choice = creatableChoice(
              purchaseProductOptions(
                products.filter(
                  (product) => product.id === line.productId || !usedProductIds.has(product.id),
                ),
              ),
              undefined,
            );
            const product = line.productId ? knownProducts.get(line.productId) : undefined;
            return (
              <fieldset key={line.id} aria-label={`Línea ${index + 1}`} className="min-w-0">
                <Card variant="subtle">
                  <div className="flex items-end gap-4">
                    <div className="min-w-0 flex-1">
                      {line.fromOrder && product ? (
                        <p className="text-body text-text">{formatProductDescription(product)}</p>
                      ) : choice ? (
                        <ComboBox
                          label="Producto"
                          placeholder="Elegí un producto"
                          value={line.productId}
                          onChange={(productId) =>
                            change(line.id, {
                              productId,
                              saleUnit: knownProducts.get(productId)?.saleUnit ?? "UNIT",
                            })
                          }
                          required
                          {...choice}
                        />
                      ) : (
                        <p className="text-detail text-text-subtle">
                          No quedan productos para agregar.
                        </p>
                      )}
                    </div>
                    <Button
                      variant="secondary"
                      icon={<Trash2 />}
                      onPress={() => {
                        onLinesChange();
                        field.handleChange(lines.filter((other) => other.id !== line.id));
                      }}
                    >
                      Quitar línea
                    </Button>
                  </div>
                  <PackageCountInputs
                    saleUnit={line.saleUnit}
                    packages={line.packages}
                    quantityPerPackage={line.quantityPerPackage}
                    onPackagesChange={(packages) => change(line.id, { packages })}
                    onQuantityPerPackageChange={(quantityPerPackage) =>
                      change(line.id, { quantityPerPackage })
                    }
                  />
                  <LinePricing line={line} saved={line.fromOrder ? saved : undefined} />
                </Card>
              </fieldset>
            );
          })}
          <div>
            <Button
              variant="secondary"
              icon={<Plus />}
              dataStatus={productsStatus}
              onPress={() => {
                onLinesChange();
                field.handleChange([...lines, emptyOrderLine(nextOrderLineId(lines))]);
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

const CALCULATED_ON_SAVING = "Se calcula al guardar";

function keepsSavedQuantities(line: OrderLineValues, saved: SavedLine): boolean {
  return (
    packageCountOf(line.packages) === saved.packages &&
    quantityPerPackageOf(line.quantityPerPackage, line.saleUnit) === saved.quantityPerPackage
  );
}

function LinePricing({ line, saved }: { line: OrderLineValues; saved: SavedLine | undefined }) {
  if (saved === undefined) {
    return <p className="text-detail text-text-subtle">{CALCULATED_ON_SAVING}</p>;
  }
  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-1 text-detail">
      <div>
        <dt className="text-text-subtle">Precio esperado por paquete</dt>
        <dd>
          {saved.expectedPackagePriceCents === null
            ? "Sin precio de lista"
            : formatCents(saved.expectedPackagePriceCents)}
        </dd>
      </div>
      <div>
        <dt className="text-text-subtle">Total de la línea</dt>
        <dd>
          {saved.expectedTotalCents === null
            ? "Sin precio de lista"
            : keepsSavedQuantities(line, saved)
              ? formatCents(saved.expectedTotalCents)
              : CALCULATED_ON_SAVING}
        </dd>
      </div>
    </dl>
  );
}
