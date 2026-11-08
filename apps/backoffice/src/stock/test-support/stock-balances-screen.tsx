import type { StockBalanceList } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { vi } from "vitest";
import { StubProductCreationModal } from "../../platform/test-support/creation-parts";
import { ARGENTINA_ZONE_RULES } from "../../platform/test-support/zone-rules";
import type { BackofficeAccess } from "../../shell/backoffice-access";
import { accessWith } from "../../shell/test-support/backoffice-access";
import { render } from "../../shell/test-support/render-with-router";
import { type StockBalancesFilters, stockBalancesFilters } from "../routes";
import { StockBalancesScreen } from "../stock-balances-screen";
import type { StockBalancesScreenServices } from "../stock-balances-services";
import {
  almonds,
  crackers,
  honey,
  movementReasons,
  oats,
  stockBalanceList,
  tea,
  withoutBalance,
} from "./stock-fixtures";

export function createServices(): StockBalancesScreenServices {
  return {
    fetchStockBalances: vi.fn(),
    fetchStockCounts: vi.fn().mockResolvedValue({ kind: "ok", value: { counts: [] } }),
    fetchStockMovements: vi.fn().mockResolvedValue({ kind: "ok", value: { movements: [] } }),
    fetchStockMovementReasons: vi.fn().mockResolvedValue({ kind: "ok", value: movementReasons }),
    fetchStockProducts: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { products: [almonds, honey, oats, tea].map(withoutBalance) },
    }),
    fetchExpectedBalance: vi.fn().mockReturnValue(new Promise(() => {})),
    registerCount: vi.fn(),
    fetchCurrentZoneRules: vi.fn().mockResolvedValue({ kind: "ok", value: ARGENTINA_ZONE_RULES }),
    recordLoss: vi.fn(),
    recordAdjustment: vi.fn(),
  };
}

export type RenderOptions = {
  access?: BackofficeAccess;
  filters?: StockBalancesFilters;
  openProduct?: string;
  onFiltersChange?: (filters: StockBalancesFilters) => void;
  onOpenProductChange?: (product: string | undefined) => void;
  onSessionEnded?: () => void;
  now?: () => Date;
};

const BALANCES_ACCESS = accessWith("stock_area", "stock_balances");

export function renderScreen(
  services: StockBalancesScreenServices,
  {
    access = BALANCES_ACCESS,
    filters = stockBalancesFilters.parse({}),
    openProduct,
    onFiltersChange = () => {},
    onOpenProductChange = () => {},
    onSessionEnded = () => {},
    now,
  }: RenderOptions = {},
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <StockBalancesScreen
          access={access}
          productCreationModal={StubProductCreationModal}
          services={services}
          filters={filters}
          onFiltersChange={onFiltersChange}
          openProduct={openProduct}
          onOpenProductChange={onOpenProductChange}
          onSessionEnded={onSessionEnded}
          {...(now === undefined ? {} : { now })}
        />
      </main>
    </FieldSizeProvider>,
  );
}

export function listed(
  products = [almonds, honey, crackers, tea],
  summary?: StockBalanceList["summary"],
  services = createServices(),
) {
  vi.mocked(services.fetchStockBalances).mockResolvedValue({
    kind: "ok",
    value: stockBalanceList(products, summary),
  });
  return services;
}
