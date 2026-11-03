import type { PriceRecommendation } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { vi } from "vitest";
import { render } from "../../shell/test-support/render-with-router";
import type { fetchPriceRecommendation, setPrice } from "../prices-api";
import {
  ProductPriceSection,
  type ProductPriceSectionProps,
  type ProductPriceSectionServices,
} from "../product-price-section";

export const mixProductId = "a0000000-0000-4000-8000-000000000001";
export const almendrasId = "c0000000-0000-4000-8000-000000000001";
export const pasasId = "c0000000-0000-4000-8000-000000000004";

export const almendrasComponent = {
  componentProductId: almendrasId,
  name: "Almendras",
  quantityPerOutputUnit: 600,
};

export const mixComponents = [
  almendrasComponent,
  { componentProductId: pasasId, name: "Pasas", quantityPerOutputUnit: 400 },
];

export const currentPrice = {
  id: "00000000-0000-4000-8000-000000000001",
  unitPrice: 1500000,
  validFrom: "2026-08-16T12:00:00.000Z",
};

export const recommended16000: PriceRecommendation = {
  currentPrice,
  recommendation: { kind: "recommended", unitPrice: 1600000 },
  batchCost: { kind: "known", unitCostCents: 1200000, marginTenthsOfPercent: 250 },
};

export function marginOf(marginTenthsOfPercent: number | null): PriceRecommendation {
  return {
    ...recommended16000,
    batchCost: { kind: "known", unitCostCents: 1200000, marginTenthsOfPercent },
  };
}

export type SectionServices = {
  fetchPriceRecommendation: ReturnType<typeof vi.fn<typeof fetchPriceRecommendation>>;
  setPrice: ReturnType<typeof vi.fn<typeof setPrice>>;
};

export function sectionServices(answer: PriceRecommendation = recommended16000): SectionServices {
  return {
    fetchPriceRecommendation: vi
      .fn<typeof fetchPriceRecommendation>()
      .mockImplementation(async (_productId, { unitPrice }) => ({
        kind: "ok",
        value:
          unitPrice === undefined ? answer : { ...answer, batchCost: marginFor(answer, unitPrice) },
      })),
    setPrice: vi.fn<typeof setPrice>().mockResolvedValue({ kind: "ok" }),
  };
}

function marginFor(
  answer: PriceRecommendation,
  unitPrice: number,
): PriceRecommendation["batchCost"] {
  if (answer.batchCost.kind !== "known") {
    return answer.batchCost;
  }
  const cost = answer.batchCost.unitCostCents;
  return {
    kind: "known",
    unitCostCents: cost,
    marginTenthsOfPercent: Math.round(((unitPrice - cost) * 1000) / unitPrice),
  };
}

export function renderSection({
  services = sectionServices(),
  ...props
}: Partial<ProductPriceSectionProps> & { services?: ProductPriceSectionServices } = {}) {
  const element = (next: Partial<ProductPriceSectionProps>) => (
    <FieldSizeProvider size="backoffice">
      <main>
        <ProductPriceSection
          productId={mixProductId}
          productDescription="Mix de frutos secos"
          saleUnit="KG"
          components={mixComponents}
          maySetPrice
          onSessionEnded={() => {}}
          {...props}
          {...next}
          services={services}
        />
      </main>
    </FieldSizeProvider>
  );
  return render(element({})).then((screen) => ({
    ...screen,
    withComponents: (components: ProductPriceSectionProps["components"]) =>
      screen.rerender(element({ components })),
  }));
}
