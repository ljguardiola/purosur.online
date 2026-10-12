import type { CalendarDate } from "@internationalized/date";
import {
  type StockCountResult,
  type StockProduct,
  type StockProductBalance,
  stockCountBodySchema,
} from "@purosur/contracts";
import {
  Button,
  DateField,
  EmptyState,
  FieldGroup,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  Modal,
  OptionCardGroup,
  type RequestSubmission,
  SharedFieldError,
  TextField,
  useFieldContext,
  useRequestForm,
} from "@purosur/ui";
import { Check, ClipboardCheck, Layers, Package, ShieldX, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { parseStockQuantity, quantityFieldKind, quantityMessage } from "../platform/stock-quantity";
import type { CloudData } from "../platform/use-cloud-query";
import { type CountMoment, type CountStart, countOccurredAt } from "./count-moment";
import type { RegisterCountOutcome } from "./stock-api";
import { CountBalance } from "./stock-count-balance";
import {
  type CountFormValues,
  countBody,
  countedMode,
  lotsMessage,
  lotsTotal,
} from "./stock-count-form";
import { CountLotsField } from "./stock-count-lots";
import type { StockCountsScreenServices } from "./stock-counts-services";
import { productOptions } from "./stock-movement-form";
import { useExpectedBalanceQuery, useRefreshStock, useStockProductsQuery } from "./stock-queries";

type Notice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "notFound" };

const NO_LOTS: StockProductBalance["lots"] = [];
const COUNTED_REQUIRED = "Ingresá la cantidad contada.";
const IN_THE_FUTURE = "El recuento no puede ser posterior a ahora.";
const SAME_MOMENT = "Ya hay un recuento de este producto a esa hora. Elegí otra hora.";

function momentMessage({ moment }: CountFormValues): string {
  return moment.day === null ? "Elegí el día del recuento." : "Escribí la hora como 18:32.";
}

function CountMomentField() {
  const field = useFieldContext<CountMoment>();
  const moment = field.state.value;
  return (
    <SharedFieldError>
      {(errorMessageId) => {
        const shared = errorMessageId === undefined ? {} : { errorMessageId };
        return (
          <div className="flex flex-row gap-3">
            <div className="flex-1">
              <DateField
                name={`${field.name}.day`}
                label="Día del recuento"
                value={moment.day}
                onChange={(day: CalendarDate | null) => field.handleChange({ ...moment, day })}
                {...shared}
              />
            </div>
            <div className="w-32">
              <TextField
                kind="plain-text"
                label="Hora"
                value={moment.time}
                onChange={(time) => field.handleChange({ ...moment, time })}
                {...shared}
              />
            </div>
          </div>
        );
      }}
    </SharedFieldError>
  );
}

export type NewCountModalProps = {
  startMoment: CountStart;
  showsBalance: boolean;
  services: StockCountsScreenServices;
  onClose: () => void;
  onSessionEnded: () => void;
  onRegistered: (product: StockProduct, result: StockCountResult) => void;
};

export function NewCountModal({
  startMoment,
  showsBalance,
  services,
  onClose,
  onSessionEnded,
  onRegistered,
}: NewCountModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const refreshStock = useRefreshStock();
  const [notice, setNotice] = useState<Notice | null>(null);
  const products = useStockProductsQuery({
    fetchStockProducts: services.fetchStockProducts,
    onSessionEnded,
  });
  const listed = products.status === "loaded" ? products.value.products : [];
  const productOf = (productId: string | null) =>
    listed.find((product) => product.id === productId);

  const { form, submit, submitting, values } = useRequestForm({
    defaultValues: {
      productId: null,
      moment: { day: startMoment.day, time: startMoment.time },
      mode: "product",
      counted: "",
      lots: {},
    } as CountFormValues,
    request: {
      schema: stockCountBodySchema,
      from: (formValues) =>
        countBody(formValues, {
          saleUnit: productOf(formValues.productId)?.saleUnit ?? "UNIT",
          lots: countableLots,
          at: countOccurredAt(formValues.moment, startMoment),
        }),
    },
    fields: { productId: "productId", counted: "counted", lots: "lots", occurredAt: "moment" },
    messages: {
      productId: "Elegí el producto.",
      moment: momentMessage,
      counted: ({ productId, counted }) =>
        counted.trim() === ""
          ? COUNTED_REQUIRED
          : quantityMessage(productOf(productId)?.saleUnit ?? "UNIT"),
      lots: ({ productId, lots }) =>
        lotsMessage(lots, countableLots, productOf(productId)?.saleUnit ?? "UNIT"),
    },
    onSubmit: async (request, submission) => {
      const product = productOf(request.productId);
      if (!product) {
        return;
      }
      setNotice(null);
      try {
        handleOutcome(product, await services.registerCount(request), submission);
      } catch {
        setNotice({ kind: "attemptFailed" });
      }
    },
  });

  function handleOutcome(
    product: StockProduct,
    outcome: RegisterCountOutcome,
    { showFieldError, showWireFieldError }: RequestSubmission<CountFormValues>,
  ) {
    if (outcome.kind === "ok") {
      onRegistered(product, outcome.value);
    } else if (outcome.kind === "unauthenticated") {
      onSessionEnded();
    } else if (outcome.kind === "forbidden") {
      sendToMyAccount();
    } else if (outcome.kind === "occurred_in_the_future") {
      showFieldError("moment", IN_THE_FUTURE);
    } else if (outcome.kind === "count_at_same_moment") {
      showFieldError("moment", SAME_MOMENT);
    } else if (outcome.kind === "not_found") {
      setNotice({ kind: "notFound" });
      void refreshStock();
    } else if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else if (outcome.kind !== "validation_failed" || !showWireFieldError(outcome.field)) {
      setNotice({ kind: "attemptFailed" });
    }
  }

  const product = productOf(values.productId);
  const at = countOccurredAt(values.moment, startMoment);
  const options = productOptions(listed);
  const balance = useExpectedBalanceQuery({
    productId: product?.id ?? "",
    at: at ?? "",
    enabled: showsBalance && product !== undefined && at !== undefined,
    fetchExpectedBalance: services.fetchExpectedBalance,
    onSessionEnded,
  });
  const productBalance: CloudData<StockProductBalance> =
    balance.status === "loaded" && balance.value.id !== product?.id
      ? { status: "loading" }
      : balance;
  const countableLots = productBalance.status === "loaded" ? productBalance.value.lots : NO_LOTS;
  const mode = countedMode(values.mode, countableLots);
  const counted =
    product === undefined
      ? undefined
      : mode === "lots"
        ? lotsTotal(values.lots, countableLots, product.saleUnit)
        : parseStockQuantity(values.counted, product.saleUnit);

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      width="standard"
      tone="info"
      icon={<ClipboardCheck />}
      context="Stock · Recuentos"
      title="Nuevo recuento"
      closable={!submitting}
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
          <Button
            variant="primary"
            size="large"
            icon={<Check />}
            fullWidth
            dataStatus={products.status}
            disabled={submitting}
            onPress={() => void submit()}
          >
            Registrar el recuento
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
          description="Creá uno en Productos para contarlo."
          variant="blank"
        />
      ) : null}
      {products.status === "loaded" && options ? (
        <div className="flex flex-col gap-4">
          {notice?.kind === "attemptFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo guardar el recuento"
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
              title="Este producto ya no existe"
            />
          )}
          <form.AppField name="productId">
            {(field) => (
              <field.ComboBox
                label="Producto"
                placeholder="Buscá un producto"
                options={options}
                variant="search"
                required
              />
            )}
          </form.AppField>
          <FieldGroup label="Cómo se cuenta">
            <form.AppField name="mode">
              {(field) => (
                <OptionCardGroup
                  label="Cómo se cuenta"
                  value={mode}
                  onChange={field.handleChange}
                  options={[
                    {
                      value: "product",
                      icon: <Package />,
                      label: "Por producto",
                      description: "La cantidad total del producto",
                    },
                    {
                      value: "lots",
                      icon: <Layers />,
                      label: "Por lote",
                      description: "La cantidad de cada lote",
                      disabled: countableLots.length === 0,
                    },
                  ]}
                />
              )}
            </form.AppField>
          </FieldGroup>
          <form.AppField name="moment">{() => <CountMomentField />}</form.AppField>
          {mode === "lots" && product ? (
            <>
              <form.AppField name="lots">
                {() => <CountLotsField lots={countableLots} saleUnit={product.saleUnit} />}
              </form.AppField>
              {showsBalance && at !== undefined ? (
                <CountBalance
                  product={product}
                  balance={productBalance}
                  counted={counted}
                  mode="lots"
                />
              ) : null}
            </>
          ) : (
            <div className="flex flex-row items-end gap-4">
              <div className="w-50 shrink-0">
                <form.AppField name="counted">
                  {(field) => (
                    <field.TextField
                      {...quantityFieldKind(product?.saleUnit ?? "UNIT")}
                      label="Cantidad contada"
                      required
                    />
                  )}
                </form.AppField>
              </div>
              {showsBalance && product && at !== undefined ? (
                <div className="min-w-0 flex-1">
                  <CountBalance
                    product={product}
                    balance={productBalance}
                    counted={counted}
                    mode="product"
                  />
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
