import { type PriceRecommendation, priceSetBodySchema } from "@purosur/contracts";
import type { SaleUnit } from "@purosur/domain";
import {
  Button,
  formatAmountInput,
  formatTenthsOfPercent,
  HighlightedFigure,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  type RequestSubmission,
  SummaryRowGroup,
  useRequestForm,
} from "@purosur/ui";
import { Check, RotateCcw, ShieldX, TriangleAlert } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ActionFailureNotice } from "../platform/action-failure-notice";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import type {
  ProductPriceSectionProps as PlatformProps,
  ProductPriceSection as ProductPriceSectionType,
} from "../platform/product-price-section";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { formatCentsWithUnit } from "./money";
import {
  AMOUNT_ALREADY_CURRENT,
  amountMessage,
  EMPTY_PRICE_FORM,
  type PriceFormValues,
  priceRequestFrom,
  typedUnitPrice,
} from "./price-form";
import {
  type FetchPriceRecommendationInput,
  fetchPriceRecommendation,
  type SetPriceOutcome,
  setPrice,
} from "./prices-api";
import { usePriceRecommendationQuery, useRefreshPrices } from "./pricing-queries";

const SETTLE_MS = 300;

const PRICE_LABEL = {
  UNIT: "Precio de venta por unidad",
  KG: "Precio de venta por kilo",
} satisfies Record<SaleUnit, string>;

const MARGIN_LABEL = "Margen con este precio";

export type ProductPriceSectionServices = {
  fetchPriceRecommendation: typeof fetchPriceRecommendation;
  setPrice: typeof setPrice;
};

const defaultServices: ProductPriceSectionServices = { fetchPriceRecommendation, setPrice };

export type ProductPriceSectionProps = PlatformProps & {
  services?: ProductPriceSectionServices | undefined;
};

type SectionNotice =
  | { kind: "saved"; unitPrice: number }
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number }
  | { kind: "stale" }
  | { kind: "notFound" };

function useSettled<Value>(value: Value, key: string, initial: Value): Value {
  const [settled, setSettled] = useState(initial);
  const settle = useEffectEvent((_settledKey: string) => setSettled(value));
  useEffect(() => {
    const handle = setTimeout(() => settle(key), SETTLE_MS);
    return () => clearTimeout(handle);
  }, [key]);
  return settled;
}

function componentsKey(components: PlatformProps["components"]): string {
  return components
    .map(
      ({ componentProductId, quantityPerOutputUnit }) =>
        `${componentProductId}:${quantityPerOutputUnit}`,
    )
    .join(",");
}

function withoutNames(
  components: PlatformProps["components"],
): FetchPriceRecommendationInput["components"] {
  return components.map(({ componentProductId, quantityPerOutputUnit }) => ({
    componentProductId,
    quantityPerOutputUnit,
  }));
}

function recommendedPriceOf(answer: PriceRecommendation | null): number | undefined {
  return answer?.recommendation.kind === "recommended"
    ? answer.recommendation.unitPrice
    : undefined;
}

function SectionNoticeView({
  notice,
  productDescription,
  saleUnit,
}: {
  notice: SectionNotice;
  productDescription: string;
  saleUnit: SaleUnit;
}) {
  if (notice.kind === "saved") {
    return (
      <InlineNotice
        tone="success"
        icon={<Check />}
        title="Precio guardado"
        description={`${productDescription} pasa a ${formatCentsWithUnit(notice.unitPrice, saleUnit)}.`}
      />
    );
  }
  if (notice.kind === "attemptFailed") {
    return <ActionFailureNotice title="No se pudo guardar el precio" />;
  }
  if (notice.kind === "rateLimited") {
    return (
      <InlineNotice
        tone="error"
        icon={<ShieldX />}
        title="Demasiadas solicitudes"
        description={retryAfterDetail(notice.retryAfterSeconds)}
      />
    );
  }
  if (notice.kind === "stale") {
    return (
      <InlineNotice
        tone="error"
        icon={<TriangleAlert />}
        title="Este precio cambió mientras lo mirabas"
        description="Recargá el precio actual y volvé a intentarlo."
      />
    );
  }
  return <InlineNotice tone="error" icon={<TriangleAlert />} title="Producto desactivado" />;
}

function ProposedMargin({
  maySetPrice,
  answer,
  typed,
  settled,
  recommendedPrice,
  fetchRecommendation,
  onSessionEnded,
  productId,
  components,
}: {
  maySetPrice: boolean;
  answer: PriceRecommendation;
  typed: number | undefined;
  settled: number | undefined;
  recommendedPrice: number | undefined;
  fetchRecommendation: typeof fetchPriceRecommendation;
  onSessionEnded: () => void;
  productId: string;
  components: FetchPriceRecommendationInput["components"];
}) {
  const proposed = maySetPrice ? settled : recommendedPrice;
  const margin = usePriceRecommendationQuery({
    productId,
    input: proposed === undefined ? { components } : { components, unitPrice: proposed },
    enabled: answer.batchCost.kind === "known" && proposed !== undefined,
    keepPreviousData: false,
    fetchPriceRecommendation: fetchRecommendation,
    onSessionEnded,
  });

  if (answer.batchCost.kind === "none") {
    return (
      <p className="text-detail text-text-subtle">
        Todavía no hay tandas de este producto: no se puede calcular el margen.
      </p>
    );
  }
  if (answer.batchCost.kind === "incomplete") {
    return (
      <p className="text-detail text-text-subtle">
        El costo de la última tanda está incompleto: no se puede calcular el margen.
      </p>
    );
  }
  const shownPrice = maySetPrice ? typed : recommendedPrice;
  if (shownPrice === undefined) {
    return <HighlightedFigure label={MARGIN_LABEL} value="—" />;
  }
  if (shownPrice !== proposed || margin.status === "loading") {
    return <HighlightedFigure label={MARGIN_LABEL} loading />;
  }
  if (margin.status === "failed") {
    return <LoadFailure {...cloudLoadFailure(margin, "el margen")} />;
  }
  const read = margin.value.batchCost;
  return (
    <HighlightedFigure
      label={MARGIN_LABEL}
      value={
        read.kind === "known" && read.marginTenthsOfPercent !== null
          ? formatTenthsOfPercent(read.marginTenthsOfPercent)
          : "—"
      }
    />
  );
}

function missingPricesNotice(answer: PriceRecommendation, components: PlatformProps["components"]) {
  if (answer.recommendation.kind !== "missing_prices") {
    return null;
  }
  const missing = answer.recommendation.componentProductIds;
  const names = components
    .filter(({ componentProductId }) => missing.includes(componentProductId))
    .map(({ name }) => name);
  return (
    <InlineNotice
      tone="warning"
      icon={<TriangleAlert />}
      title="No hay un precio recomendado"
      description={`Estos componentes no tienen precio: ${names.join(", ")}.`}
    />
  );
}

export function ProductPriceSection({
  productId,
  productDescription,
  saleUnit,
  components,
  maySetPrice,
  onSessionEnded,
  services = defaultServices,
}: ProductPriceSectionProps) {
  const sendToMyAccount = useSendToMyAccount();
  const refreshPrices = useRefreshPrices();
  const [notice, setNotice] = useState<SectionNotice | null>(null);
  const settledComponents = useSettled(components, componentsKey(components), components);
  const recommendation = usePriceRecommendationQuery({
    productId,
    input: { components: withoutNames(settledComponents) },
    enabled: true,
    keepPreviousData: true,
    fetchPriceRecommendation: services.fetchPriceRecommendation,
    onSessionEnded,
  });
  const answer = recommendation.status === "loaded" ? recommendation.value : null;
  const recommendedPrice = recommendedPriceOf(answer);
  const currentPriceId = answer?.currentPrice?.id ?? null;

  const { form, submit, submitting, values } = useRequestForm({
    defaultValues: EMPTY_PRICE_FORM,
    request: { schema: priceSetBodySchema, from: priceRequestFrom },
    fields: { unitPrice: "amount", expectedCurrentPriceId: null },
    messages: { amount: amountMessage },
    onSubmit: async (request, submission) => {
      setNotice(null);
      try {
        handleOutcome(request.unitPrice, await services.setPrice(productId, request), submission);
      } catch {
        setNotice({ kind: "attemptFailed" });
      }
    },
  });

  function handleOutcome(
    unitPrice: number,
    outcome: SetPriceOutcome,
    { showFieldError, showWireFieldError }: RequestSubmission<PriceFormValues>,
  ) {
    if (outcome.kind === "ok") {
      setNotice({ kind: "saved", unitPrice });
      void refreshPrices();
    } else if (outcome.kind === "unauthenticated") {
      onSessionEnded();
    } else if (outcome.kind === "forbidden") {
      sendToMyAccount();
    } else if (outcome.kind === "not_found") {
      setNotice({ kind: "notFound" });
    } else if (outcome.kind === "stale_price") {
      setNotice({ kind: "stale" });
    } else if (outcome.kind === "price_unchanged") {
      showFieldError("amount", AMOUNT_ALREADY_CURRENT);
    } else if (outcome.kind === "validation_failed") {
      if (!showWireFieldError(outcome.field)) {
        setNotice(
          outcome.field === "expectedCurrentPriceId"
            ? { kind: "stale" }
            : { kind: "attemptFailed" },
        );
      }
    } else if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
    } else {
      setNotice({ kind: "attemptFailed" });
    }
  }

  const prefill = recommendedPrice === undefined ? "" : formatAmountInput(recommendedPrice);
  const lastPrefill = useRef("");
  useEffect(() => {
    if (form.state.values.amount === lastPrefill.current) {
      form.setFieldValue("amount", prefill);
    }
    lastPrefill.current = prefill;
  }, [prefill, form]);

  useEffect(() => {
    form.setFieldValue("expectedCurrentPriceId", currentPriceId);
  }, [currentPriceId, form]);

  const typed = typedUnitPrice(values.amount);
  const settledTyped = useSettled(typed, String(typed), undefined);

  return (
    <section className="flex flex-col gap-4">
      <h3 className="font-bold text-body text-text">Precio de venta de {productDescription}</h3>
      {notice ? (
        <SectionNoticeView
          notice={notice}
          productDescription={productDescription}
          saleUnit={saleUnit}
        />
      ) : null}
      {notice?.kind === "stale" ? (
        <Button
          variant="secondary"
          icon={<RotateCcw />}
          disabled={submitting}
          onPress={() => {
            setNotice(null);
            void refreshPrices();
          }}
        >
          Recargar el precio actual
        </Button>
      ) : null}
      {recommendation.status === "loading" ? <LoadingPlaceholder variant="rows" rows={3} /> : null}
      {recommendation.status === "failed" ? (
        <LoadFailure {...cloudLoadFailure(recommendation, "el precio de venta")} />
      ) : null}
      {answer ? (
        <>
          <SummaryRowGroup
            variant="filled"
            rows={[
              {
                label: "Precio actual",
                value: answer.currentPrice
                  ? formatCentsWithUnit(answer.currentPrice.unitPrice, saleUnit)
                  : "Sin precio",
              },
              {
                label: "Precio recomendado",
                value:
                  recommendedPrice === undefined
                    ? "Sin recomendación"
                    : formatCentsWithUnit(recommendedPrice, saleUnit),
              },
              {
                label: "Costo de la última tanda",
                value:
                  answer.batchCost.kind === "known"
                    ? formatCentsWithUnit(answer.batchCost.unitCostCents, saleUnit)
                    : answer.batchCost.kind === "none"
                      ? "Sin tandas"
                      : "Incompleto",
              },
            ]}
          />
          {missingPricesNotice(answer, components)}
        </>
      ) : null}
      {maySetPrice ? (
        <form.AppField name="amount">
          {(field) => (
            <field.TextField
              kind="price"
              label={PRICE_LABEL[saleUnit]}
              prefix="$"
              decimals={2}
              required
            />
          )}
        </form.AppField>
      ) : null}
      {answer ? (
        <ProposedMargin
          maySetPrice={maySetPrice}
          answer={answer}
          typed={typed}
          settled={settledTyped}
          recommendedPrice={recommendedPrice}
          fetchRecommendation={services.fetchPriceRecommendation}
          onSessionEnded={onSessionEnded}
          productId={productId}
          components={withoutNames(settledComponents)}
        />
      ) : null}
      {maySetPrice ? (
        <Button
          variant="secondary"
          icon={<Check />}
          dataStatus={recommendation.status}
          disabled={submitting}
          onPress={() => void submit()}
        >
          Guardar el precio
        </Button>
      ) : null}
    </section>
  );
}

export const productPriceSection: ProductPriceSectionType = ProductPriceSection;
