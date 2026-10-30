import {
  type StockMovementResult,
  type StockProduct,
  stockAdjustmentBodySchema,
  stockLossBodySchema,
} from "@purosur/contracts";
import type { SaleUnit } from "@purosur/domain";
import {
  Button,
  EmptyState,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  Modal,
  OptionCardGroup,
  useRequestForm,
} from "@purosur/ui";
import { ArrowDownUp, Check, Info, Minus, Package, PackageX, Plus } from "lucide-react";
import { useState } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { combineCloudData } from "../platform/combine-cloud-data";
import { creatableChoice } from "../platform/creatable-options";
import { withCreatedProducts } from "../platform/created-products";
import type { CreatedProduct, ProductCreationModal } from "../platform/creation-parts";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { useStackedCreation } from "../platform/stacked-creation";
import {
  directedQuantity,
  parseStockQuantity,
  quantityFieldKind,
  quantityMessage,
} from "../platform/stock-quantity";
import type { RecordMovementOutcome } from "./stock-api";
import { StockBalanceChange } from "./stock-balance-change";
import {
  ADJUSTMENT_REASON_OPTIONS,
  type AdjustmentValues,
  LOSS_REASON_OPTIONS,
  type LossValues,
  type MovementKind,
  PRODUCT_REQUIRED,
  productOptions,
  REASON_REQUIRED,
  soleDirection,
} from "./stock-movement-form";
import { StockMovementNotice } from "./stock-movement-notice";
import type { StockMovementsScreenServices } from "./stock-movements-services";
import {
  useMarkStockStale,
  useRefreshStock,
  useStockMovementReasonsQuery,
  useStockProductsQuery,
} from "./stock-queries";

const KIND_OPTIONS = {
  loss: {
    value: "loss",
    label: "Pérdida",
    description: "Mercadería que ya no se puede vender",
    icon: <PackageX />,
  },
  adjustment: {
    value: "adjustment",
    label: "Ajuste",
    description: "Corrige el stock de una compra o una tanda",
    icon: <ArrowDownUp />,
  },
} as const satisfies Record<MovementKind, unknown>;

const DIRECTION_OPTIONS = [
  { value: "add", label: "Suma", icon: <Plus /> },
  { value: "subtract", label: "Resta", icon: <Minus /> },
] as const;

export type StockMovementModalProps = {
  title: string;
  kinds: readonly [MovementKind, ...MovementKind[]];
  productCreationModal?: ProductCreationModal | undefined;
  services: StockMovementsScreenServices;
  onClose: () => void;
  onSessionEnded: () => void;
  showsBalance: boolean;
  onRegistered: (product: StockProduct, result: StockMovementResult, delta: number) => void;
};

export function StockMovementModal({
  title,
  kinds,
  showsBalance,
  productCreationModal: ProductCreation,
  services,
  onClose,
  onSessionEnded,
  onRegistered,
}: StockMovementModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const refreshStock = useRefreshStock();
  const [kind, setKind] = useState<MovementKind>(kinds[0]);
  const [notice, setNotice] = useState<StockMovementNotice | null>(null);
  const products = useStockProductsQuery({
    fetchStockProducts: services.fetchStockProducts,
    onSessionEnded,
  });
  const reasons = useStockMovementReasonsQuery({
    fetchStockMovementReasons: services.fetchStockMovementReasons,
    onSessionEnded,
  });
  const data = combineCloudData(products, reasons);
  const [createdProducts, setCreatedProducts] = useState<CreatedProduct[]>([]);
  const [storedProducts, listedReasons] =
    data.status === "loaded" ? [data.value[0].products, data.value[1].reasons] : [[], []];
  const listed = withCreatedProducts(storedProducts, createdProducts);
  const productOf = (productId: string | null) =>
    listed.find((product) => product.id === productId);
  const unitOf = (productId: string | null): SaleUnit => productOf(productId)?.saleUnit ?? "UNIT";
  const quantityOf = ({ productId, quantity }: { productId: string | null; quantity: string }) =>
    parseStockQuantity(quantity, unitOf(productId));
  const quantityFieldMessage = (values: { productId: string | null; quantity: string }) =>
    values.quantity.trim() === ""
      ? "Ingresá la cantidad."
      : quantityMessage(unitOf(values.productId));

  function handleOutcome(
    product: StockProduct,
    delta: number,
    outcome: RecordMovementOutcome,
    showWireFieldError: (field: string) => boolean,
  ) {
    if (outcome.kind === "ok") {
      onRegistered(product, outcome.value, delta);
    } else if (outcome.kind === "unauthenticated") {
      onSessionEnded();
    } else if (outcome.kind === "forbidden") {
      sendToMyAccount();
    } else if (outcome.kind === "not_found") {
      setNotice({ kind: "notFound" });
      void refreshStock();
    } else if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else if (outcome.kind !== "validation_failed" || !showWireFieldError(outcome.field)) {
      setNotice({ kind: "attemptFailed" });
    }
  }

  async function send(
    productId: string,
    delta: number,
    record: () => Promise<RecordMovementOutcome>,
    showWireFieldError: (field: string) => boolean,
  ) {
    const product = productOf(productId);
    if (!product) {
      return;
    }
    setNotice(null);
    try {
      handleOutcome(product, delta, await record(), showWireFieldError);
    } catch {
      setNotice({ kind: "attemptFailed" });
    }
  }

  const loss = useRequestForm({
    defaultValues: { productId: null, quantity: "", reason: null } as LossValues,
    request: {
      schema: stockLossBodySchema,
      from: (values) => ({
        productId: values.productId ?? "",
        reason: values.reason ?? "",
        quantity: quantityOf(values) ?? Number.NaN,
      }),
    },
    fields: { productId: "productId", reason: "reason", quantity: "quantity" },
    messages: {
      productId: PRODUCT_REQUIRED,
      reason: REASON_REQUIRED,
      quantity: quantityFieldMessage,
    },
    onSubmit: async (_request, { parsed, showWireFieldError }) => {
      const chosenDirection = parsed && soleDirection(listedReasons, "loss", parsed.reason);
      if (parsed && chosenDirection) {
        await send(
          parsed.productId,
          directedQuantity(chosenDirection, parsed.quantity),
          () => services.recordLoss(parsed),
          showWireFieldError,
        );
      }
    },
  });

  const adjustment = useRequestForm({
    defaultValues: {
      productId: null,
      quantity: "",
      reason: null,
      direction: "add",
    } as AdjustmentValues,
    request: {
      schema: stockAdjustmentBodySchema,
      from: (values) => ({
        productId: values.productId ?? "",
        reason: values.reason ?? "",
        direction: soleDirection(listedReasons, "adjustment", values.reason) ?? values.direction,
        quantity: quantityOf(values) ?? Number.NaN,
      }),
    },
    fields: {
      productId: "productId",
      reason: "reason",
      direction: "direction",
      quantity: "quantity",
    },
    messages: {
      productId: PRODUCT_REQUIRED,
      reason: REASON_REQUIRED,
      direction: "Elegí si suma o resta.",
      quantity: quantityFieldMessage,
    },
    onSubmit: async (_request, { parsed, showWireFieldError }) => {
      if (parsed) {
        await send(
          parsed.productId,
          directedQuantity(parsed.direction, parsed.quantity),
          () => services.recordAdjustment(parsed),
          showWireFieldError,
        );
      }
    },
  });

  const markStockStale = useMarkStockStale();
  const stock = { markStale: markStockStale, refresh: refreshStock };
  const lossProductCreation = useStackedCreation<CreatedProduct>((product) => {
    setCreatedProducts([...createdProducts, product]);
    loss.form.setFieldValue("productId", product.id);
  }, stock);
  const adjustmentProductCreation = useStackedCreation<CreatedProduct>((product) => {
    setCreatedProducts([...createdProducts, product]);
    adjustment.form.setFieldValue("productId", product.id);
  }, stock);
  const closeForm = () => {
    lossProductCreation.finish();
    adjustmentProductCreation.finish();
    onClose();
  };
  const submitting = loss.submitting || adjustment.submitting;
  const options = productOptions(listed);
  const lossChoice = creatableChoice(
    options,
    ProductCreation ? { recordKind: "producto", onCreate: lossProductCreation.start } : undefined,
  );
  const adjustmentChoice = creatableChoice(
    options,
    ProductCreation
      ? { recordKind: "producto", onCreate: adjustmentProductCreation.start }
      : undefined,
  );
  const lossProduct = productOf(loss.values.productId);
  const lossQuantity = quantityOf(loss.values);
  const lossDirection = soleDirection(listedReasons, "loss", loss.values.reason);
  const adjustmentProduct = productOf(adjustment.values.productId);
  const adjustmentQuantity = quantityOf(adjustment.values);
  const fixedDirection = soleDirection(listedReasons, "adjustment", adjustment.values.reason);
  const direction = fixedDirection ?? adjustment.values.direction;

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) {
          closeForm();
        }
      }}
      width="wide"
      tone="info"
      icon={<ArrowDownUp />}
      context="Stock · Ajustes y pérdidas"
      title={title}
      closable={!submitting}
      footer={
        <>
          <Button variant="secondary" size="large" disabled={submitting} onPress={closeForm}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="large"
            icon={<Check />}
            fullWidth
            dataStatus={data.status}
            disabled={submitting}
            onPress={() => void (kind === "loss" ? loss.submit() : adjustment.submit())}
          >
            {kind === "loss" ? "Registrar la pérdida" : "Registrar el ajuste"}
          </Button>
        </>
      }
    >
      {data.status === "loading" ? <LoadingPlaceholder variant="form" fields={3} /> : null}
      {data.status === "failed" ? (
        <LoadFailure {...cloudLoadFailure(data, "los productos")} />
      ) : null}
      {data.status === "loaded" && !(lossChoice && adjustmentChoice) ? (
        <EmptyState
          icon={<Package />}
          title="No hay productos activos"
          description="Creá uno en Productos para llevar su stock."
          variant="blank"
        />
      ) : null}
      {data.status === "loaded" && lossChoice && adjustmentChoice ? (
        <div className="flex flex-col gap-4">
          {notice ? <StockMovementNotice notice={notice} /> : null}
          {kinds.length > 1 ? (
            <OptionCardGroup
              label="Qué se carga"
              options={[
                KIND_OPTIONS[kinds[0]],
                ...kinds.slice(1).map((other) => KIND_OPTIONS[other]),
              ]}
              value={kind}
              onChange={(next) => {
                setNotice(null);
                setKind(next);
              }}
            />
          ) : null}
          {kind === "loss" ? (
            <>
              <div className="flex flex-row gap-3">
                <div className="flex-1">
                  <loss.form.AppField name="productId">
                    {(field) => (
                      <field.ComboBox
                        label="Producto"
                        placeholder="Elegí un producto"
                        required
                        {...lossChoice}
                      />
                    )}
                  </loss.form.AppField>
                </div>
                <div className="w-48">
                  <loss.form.AppField name="quantity">
                    {(field) => (
                      <field.TextField
                        {...quantityFieldKind(unitOf(loss.values.productId))}
                        label="Cantidad perdida"
                        required
                      />
                    )}
                  </loss.form.AppField>
                </div>
              </div>
              <loss.form.AppField name="reason">
                {(field) => (
                  <field.OptionCardGroup
                    layout="grid"
                    label="Motivo"
                    options={LOSS_REASON_OPTIONS}
                    required
                  />
                )}
              </loss.form.AppField>
              {showsBalance && lossProduct ? (
                <StockBalanceChange
                  services={services}
                  onSessionEnded={onSessionEnded}
                  product={lossProduct}
                  delta={
                    lossQuantity === undefined || lossDirection === undefined
                      ? undefined
                      : directedQuantity(lossDirection, lossQuantity)
                  }
                />
              ) : null}
            </>
          ) : (
            <>
              <div className="flex flex-row items-end gap-3">
                <div className="flex-1">
                  <adjustment.form.AppField name="productId">
                    {(field) => (
                      <field.ComboBox
                        label="Producto"
                        placeholder="Elegí un producto"
                        required
                        {...adjustmentChoice}
                      />
                    )}
                  </adjustment.form.AppField>
                </div>
                {fixedDirection === undefined ? (
                  <adjustment.form.AppField name="direction">
                    {(field) => (
                      <field.SegmentedControl label="Sentido" options={DIRECTION_OPTIONS} />
                    )}
                  </adjustment.form.AppField>
                ) : null}
                <div className="w-48">
                  <adjustment.form.AppField name="quantity">
                    {(field) => (
                      <field.TextField
                        {...quantityFieldKind(unitOf(adjustment.values.productId))}
                        label="Cantidad"
                        required
                      />
                    )}
                  </adjustment.form.AppField>
                </div>
              </div>
              <adjustment.form.AppField name="reason">
                {(field) => (
                  <field.OptionCardGroup
                    layout="grid"
                    label="Motivo"
                    options={ADJUSTMENT_REASON_OPTIONS}
                    required
                  />
                )}
              </adjustment.form.AppField>
              <InlineNotice
                tone="info"
                icon={<Info />}
                title="Si lo que hay en el local no coincide con el sistema, se corrige con un recuento."
              />
              {showsBalance && adjustmentProduct ? (
                <StockBalanceChange
                  services={services}
                  onSessionEnded={onSessionEnded}
                  product={adjustmentProduct}
                  delta={
                    adjustmentQuantity === undefined
                      ? undefined
                      : directedQuantity(direction, adjustmentQuantity)
                  }
                />
              ) : null}
            </>
          )}
          {ProductCreation ? (
            <>
              <ProductCreation
                open={lossProductCreation.open}
                initialName={lossProductCreation.initialName}
                onCreated={lossProductCreation.select}
                onClose={lossProductCreation.close}
                onSessionEnded={onSessionEnded}
              />
              <ProductCreation
                open={adjustmentProductCreation.open}
                initialName={adjustmentProductCreation.initialName}
                onCreated={adjustmentProductCreation.select}
                onClose={adjustmentProductCreation.close}
                onSessionEnded={onSessionEnded}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
