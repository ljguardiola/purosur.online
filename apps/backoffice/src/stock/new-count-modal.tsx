import type { CalendarDate } from "@internationalized/date";
import { type StockCountResult, type StockProduct, stockCountBodySchema } from "@purosur/contracts";
import type { SaleUnit } from "@purosur/domain";
import {
  Button,
  DateField,
  EmptyState,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  Modal,
  type RequestSubmission,
  SharedFieldError,
  SummaryRowGroup,
  TextField,
  useFieldContext,
  useRequestForm,
} from "@purosur/ui";
import { Check, ClipboardCheck, Package, ShieldX, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { type CountMoment, type CountStart, countOccurredAt } from "./count-moment";
import type { RegisterCountOutcome } from "./stock-api";
import type { StockCountsScreenServices } from "./stock-counts-services";
import { productOptions, quantityFieldKind, quantityMessage } from "./stock-movement-form";
import { formatStockChange, formatStockQuantity, parseStockQuantity } from "./stock-quantity";
import { useExpectedBalanceQuery, useRefreshStock, useStockProductsQuery } from "./stock-queries";

type CountFormValues = { productId: string | null; moment: CountMoment; counted: string };

type Notice =
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "notFound" };

const COUNTED_REQUIRED = "Ingresá la cantidad contada.";
const IN_THE_FUTURE = "El recuento no puede ser posterior a ahora.";
const SAME_MOMENT = "Ya hay un recuento de este producto a esa hora. Elegí otra hora.";

function momentMessage({ moment }: CountFormValues): string {
  return moment.day === null ? "Elegí el día del recuento." : "Escribí la hora como 18:32.";
}

function differenceText(difference: number, saleUnit: SaleUnit): string {
  return difference === 0 ? "Sin diferencia" : formatStockChange(difference, saleUnit);
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

function ExpectedBalance({
  product,
  at,
  counted,
  services,
  onSessionEnded,
}: {
  product: StockProduct;
  at: string;
  counted: number | undefined;
  services: StockCountsScreenServices;
  onSessionEnded: () => void;
}) {
  const data = useExpectedBalanceQuery({
    productId: product.id,
    at,
    fetchExpectedBalance: services.fetchExpectedBalance,
    onSessionEnded,
  });
  if (data.status === "loading") {
    return <LoadingPlaceholder variant="card" lines={2} />;
  }
  if (data.status === "failed") {
    return <LoadFailure {...cloudLoadFailure(data, "el saldo esperado")} />;
  }
  const { balance: expected } = data.value;
  return (
    <SummaryRowGroup
      rows={[
        { label: "Saldo esperado", value: formatStockQuantity(expected, product.saleUnit) },
        ...(counted === undefined
          ? []
          : [{ label: "Diferencia", value: differenceText(counted - expected, product.saleUnit) }]),
      ]}
    />
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
      counted: "",
    } as CountFormValues,
    request: {
      schema: stockCountBodySchema,
      from: ({ productId, moment, counted }) => ({
        productId: productId ?? "",
        counted:
          parseStockQuantity(counted, productOf(productId)?.saleUnit ?? "UNIT") ?? Number.NaN,
        occurredAt: countOccurredAt(moment, startMoment) ?? "",
      }),
    },
    fields: { productId: "productId", counted: "counted", occurredAt: "moment" },
    messages: {
      productId: "Elegí el producto.",
      moment: momentMessage,
      counted: ({ productId, counted }) =>
        counted.trim() === ""
          ? COUNTED_REQUIRED
          : quantityMessage(productOf(productId)?.saleUnit ?? "UNIT"),
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
              title="Producto desactivado"
              description="Ya no está en el catálogo."
            />
          )}
          <form.AppField name="productId">
            {(field) => (
              <field.Select
                label="Producto"
                placeholder="Elegí un producto"
                options={options}
                required
              />
            )}
          </form.AppField>
          <form.AppField name="moment">{() => <CountMomentField />}</form.AppField>
          <form.AppField name="counted">
            {(field) => (
              <field.TextField
                {...quantityFieldKind(product?.saleUnit ?? "UNIT")}
                label="Cantidad contada"
                required
              />
            )}
          </form.AppField>
          {showsBalance && product && at !== undefined ? (
            <ExpectedBalance
              product={product}
              at={at}
              counted={parseStockQuantity(values.counted, product.saleUnit)}
              services={services}
              onSessionEnded={onSessionEnded}
            />
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
