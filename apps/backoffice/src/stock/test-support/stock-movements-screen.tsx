import type { StockCount, StockMovement } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { useState } from "react";
import { vi } from "vitest";
import type { BackofficeAccess } from "../../shell/backoffice-access";
import { accessWith } from "../../shell/test-support/backoffice-access";
import { render } from "../../shell/test-support/render-with-router";
import { type StockMovementsSearchFilters, stockMovementsSearch } from "../routes";
import { StockMovementsScreen } from "../stock-movements-screen";
import type { StockMovementsScreenServices } from "../stock-movements-services";
import { lossesByReasonReport } from "./losses-by-reason-report-fixtures";
import { almondsAdjustment, almondsCount, honeyLoss } from "./stock-fixtures";

export const EVERYTHING: BackofficeAccess = {
  ...accessWith(
    "stock_area",
    "stock_balances",
    "stock_counts",
    "stock_movements",
    "stock_losses",
    "stock_adjustments",
  ),
  stockMovementKinds: ["loss", "adjustment"],
};

export const COUNTS_ONLY: BackofficeAccess = {
  ...accessWith("stock_area", "stock_counts"),
  stockMovementKinds: [],
};

export const LOSSES_ONLY: BackofficeAccess = {
  ...accessWith("stock_area", "stock_movements", "stock_losses"),
  stockMovementKinds: ["loss"],
};

export const ADJUSTMENTS_ONLY: BackofficeAccess = {
  ...accessWith("stock_area", "stock_movements", "stock_adjustments"),
  stockMovementKinds: ["adjustment"],
};

export function createServices(
  counts: StockCount[] = [almondsCount],
  movements: StockMovement[] = [honeyLoss, almondsAdjustment],
): StockMovementsScreenServices {
  return {
    fetchStockCounts: vi.fn().mockResolvedValue({ kind: "ok", value: { counts } }),
    fetchStockMovements: vi.fn().mockResolvedValue({ kind: "ok", value: { movements } }),
    fetchLossesByReasonReport: vi
      .fn()
      .mockResolvedValue({ kind: "ok", value: lossesByReasonReport() }),
  };
}

function Harness({
  access,
  services,
  initial,
  onFiltersChange,
  onSessionEnded,
}: {
  access: BackofficeAccess;
  services: StockMovementsScreenServices;
  initial: StockMovementsSearchFilters;
  onFiltersChange: (filters: StockMovementsSearchFilters) => void;
  onSessionEnded: () => void;
}) {
  const [filters, setFilters] = useState(initial);
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <StockMovementsScreen
          access={access}
          services={services}
          filters={filters}
          onFiltersChange={(next) => {
            onFiltersChange(next);
            setFilters(next);
          }}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>
  );
}

export function renderScreen(
  services: StockMovementsScreenServices,
  {
    access = EVERYTHING,
    filters = stockMovementsSearch.parse({}),
    onFiltersChange = () => {},
    onSessionEnded = () => {},
  }: {
    access?: BackofficeAccess;
    filters?: StockMovementsSearchFilters;
    onFiltersChange?: (filters: StockMovementsSearchFilters) => void;
    onSessionEnded?: () => void;
  } = {},
) {
  return render(
    <Harness
      access={access}
      services={services}
      initial={filters}
      onFiltersChange={onFiltersChange}
      onSessionEnded={onSessionEnded}
    />,
  );
}

export const TABLE = "Movimientos";
