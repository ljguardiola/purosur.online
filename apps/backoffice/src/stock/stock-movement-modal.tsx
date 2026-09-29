import {
  type StockMovementResult,
  type StockProduct,
  stockAdjustmentBodySchema,
  stockLossBodySchema,
} from "@purosur/contracts";
import {
  ADJUSTMENT_REASONS,
  type AdjustmentReason,
  adjustmentDirections,
  LOSS_REASONS,
  type LossReason,
  type SaleUnit,
  type StockDirection,
  signedDelta,
} from "@purosur/domain";
import {
  Button,
  EmptyState,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  Modal,
  OptionCardGroup,
  SummaryRowGroup,
} from "@purosur/ui";
import {
  ArrowDownUp,
  Check,
  Info,
  Minus,
  Package,
  PackageX,
  Plus,
  ShieldX,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { useSendToMyAccount } from "../access/send-to-my-account";
import { useCloudForm } from "../platform/cloud-form";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { retryAfterDetail } from "../platform/retry-after-detail";
import type { RecordMovementOutcome } from "./stock-api";
import { productOptions, quantityFieldKind, quantityMessage } from "./stock-movement-form";
import type { StockMovementsScreenServices } from "./stock-movements-services";
import { formatStockChange, formatStockQuantity, parseStockQuantity } from "./stock-quantity";
import { useRefreshStock, useStockBalancesQuery, useStockProductsQuery } from "./stock-queries";
import { ADJUSTMENT_REASON_LABELS, LOSS_REASON_LABELS } from "./stock-reason-labels";

export type MovementKind = "loss" | "adjustment";

type LossValues = { productId: string | null; quantity: string; reason: LossReason | null };

type AdjustmentValues = {
  productId: string | null;
  quantity: string;
  reason: AdjustmentReason | null;
  direction: StockDirection;
};

type Notice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "notFound" };

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
} as const;

const LOSS_REASON_OPTIONS = LOSS_REASONS.map((reason) => ({
  value: reason,
  label: LOSS_REASON_LABELS[reason],
})) as [{ value: LossReason; label: string }, ...{ value: LossReason; label: string }[]];

const ADJUSTMENT_REASON_OPTIONS = ADJUSTMENT_REASONS.map((reason) => ({
  value: reason,
  label: ADJUSTMENT_REASON_LABELS[reason],
})) as [
  { value: AdjustmentReason; label: string },
  ...{ value: AdjustmentReason; label: string }[],
];

const DIRECTION_OPTIONS = [
  { value: "add", label: "Suma", icon: <Plus /> },
  { value: "subtract", label: "Resta", icon: <Minus /> },
] as const;

const PRODUCT_REQUIRED = "Elegí el producto.";
const REASON_REQUIRED = "Elegí el motivo.";

function soleDirection(reason: AdjustmentReason | null): StockDirection | undefined {
  const [only, ...others] = reason === null ? [] : adjustmentDirections(reason);
  return others.length === 0 ? only : undefined;
}

function BalanceChange({
  product,
  delta,
  services,
  onSessionEnded,
}: {
  product: StockProduct;
  delta: number | undefined;
  services: StockMovementsScreenServices;
  onSessionEnded: () => void;
}) {
  const balances = useStockBalancesQuery({
    fetchStockBalances: services.fetchStockBalances,
    onSessionEnded,
  });
  if (balances.status === "loading") {
    return <LoadingPlaceholder variant="card" lines={3} />;
  }
  if (balances.status === "failed") {
    return <LoadFailure {...cloudLoadFailure(balances, "el saldo")} />;
  }
  const balance = balances.value.products.find((listed) => listed.id === product.id)?.balance ?? 0;
  const current = {
    label: "Saldo actual",
    value: formatStockQuantity(balance, product.saleUnit),
  };
  return (
    <SummaryRowGroup
      rows={
        delta === undefined
          ? [current]
          : [
              current,
              { label: "Cambio", value: formatStockChange(delta, product.saleUnit) },
              {
                label: "Saldo después",
                value: formatStockQuantity(balance + delta, product.saleUnit),
                strong: true,
              },
            ]
      }
    />
  );
}

export type StockMovementModalProps = {
  title: string;
  kinds: readonly [MovementKind, ...MovementKind[]];
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
  services,
  onClose,
  onSessionEnded,
  onRegistered,
}: StockMovementModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const refreshStock = useRefreshStock();
  const [kind, setKind] = useState<MovementKind>(kinds[0]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const products = useStockProductsQuery({
    fetchStockProducts: services.fetchStockProducts,
    onSessionEnded,
  });
  const listed = products.status === "loaded" ? products.value.products : [];
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

  const loss = useCloudForm({
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
      if (parsed) {
        await send(
          parsed.productId,
          signedDelta("subtract", parsed.quantity),
          () => services.recordLoss(parsed),
          showWireFieldError,
        );
      }
    },
  });

  const adjustment = useCloudForm({
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
        direction: soleDirection(values.reason) ?? values.direction,
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
          signedDelta(parsed.direction, parsed.quantity),
          () => services.recordAdjustment(parsed),
          showWireFieldError,
        );
      }
    },
  });

  const submitting = loss.submitting || adjustment.submitting;
  const options = productOptions(listed);
  const lossProduct = productOf(loss.values.productId);
  const lossQuantity = quantityOf(loss.values);
  const adjustmentProduct = productOf(adjustment.values.productId);
  const adjustmentQuantity = quantityOf(adjustment.values);
  const fixedDirection = soleDirection(adjustment.values.reason);
  const direction = fixedDirection ?? adjustment.values.direction;

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
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
          <Button variant="secondary" size="large" disabled={submitting} onPress={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="large"
            icon={<Check />}
            fullWidth
            dataStatus={products.status}
            disabled={submitting}
            onPress={() => void (kind === "loss" ? loss.submit() : adjustment.submit())}
          >
            {kind === "loss" ? "Registrar la pérdida" : "Registrar el ajuste"}
          </Button>
        </>
      }
    >
      {products.status === "loading" ? <LoadingPlaceholder variant="form" fields={3} /> : null}
      {products.status === "failed" ? (
        <LoadFailure {...cloudLoadFailure(products, "los productos")} />
      ) : null}
      {products.status === "loaded" && !options ? (
        <EmptyState
          icon={<Package />}
          title="No hay productos activos"
          description="Creá uno en Productos para llevar su stock."
          variant="blank"
        />
      ) : null}
      {products.status === "loaded" && options ? (
        <div className="flex flex-col gap-4">
          {notice?.kind === "attemptFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo guardar el movimiento"
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
          {notice?.kind === "notFound" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="Producto desactivado"
              description="Ya no está en el catálogo."
            />
          )}
          {kinds.length > 1 ? (
            <OptionCardGroup
              label="Qué se carga"
              options={[KIND_OPTIONS.loss, KIND_OPTIONS.adjustment]}
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
                      <field.Select
                        label="Producto"
                        placeholder="Elegí un producto"
                        options={options}
                        required
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
                <BalanceChange
                  services={services}
                  onSessionEnded={onSessionEnded}
                  product={lossProduct}
                  delta={
                    lossQuantity === undefined ? undefined : signedDelta("subtract", lossQuantity)
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
                      <field.Select
                        label="Producto"
                        placeholder="Elegí un producto"
                        options={options}
                        required
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
                <BalanceChange
                  services={services}
                  onSessionEnded={onSessionEnded}
                  product={adjustmentProduct}
                  delta={
                    adjustmentQuantity === undefined
                      ? undefined
                      : signedDelta(direction, adjustmentQuantity)
                  }
                />
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
