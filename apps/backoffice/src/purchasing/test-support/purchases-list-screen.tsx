import { FieldSizeProvider } from "@purosur/ui";
import { useState } from "react";
import { expect, vi } from "vitest";
import type { z } from "zod";
import { StubProductCreationModal } from "../../platform/test-support/creation-parts";
import type { BackofficeAccess } from "../../shell/backoffice-access";
import { ADMINISTRATOR_ACCESS } from "../../shell/test-support/backoffice-access";
import { render } from "../../shell/test-support/render-with-router";
import { PurchasesListScreen } from "../purchases-list-screen";
import type { PurchasesListScreenServices } from "../purchases-list-services";
import { type PurchasesListFilters, purchasesListFilters } from "../routes";
import { compraDeAvena, compraDeMiel, purchaseChoicesFrom } from "./purchases";
import { quarterPurchasesReport } from "./purchases-report-fixtures";

export function createServices(
  overrides: Partial<PurchasesListScreenServices> = {},
): PurchasesListScreenServices {
  return {
    fetchPurchases: vi.fn(),
    fetchPurchasesReport: vi.fn().mockResolvedValue({ kind: "ok", value: quarterPurchasesReport }),
    fetchSupplierName: vi.fn(),
    fetchPurchaseChoices: vi.fn().mockResolvedValue({ kind: "ok", value: purchaseChoicesFrom([]) }),
    fetchPurchaseChanges: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    addPurchaseLines: vi.fn(),
    correctPurchaseHeader: vi.fn(),
    correctPurchaseLineExpiry: vi.fn(),
    splitPurchaseLineExpiry: vi.fn(),
    correctPurchaseLineCost: vi.fn(),
    correctPurchaseLineQuantity: vi.fn(),
    changePurchaseLineProduct: vi.fn(),
    removePurchaseLine: vi.fn(),
    ...overrides,
  };
}

export function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

export type ScreenOptions = {
  filters?: Partial<z.input<typeof purchasesListFilters>>;
  onFiltersChange?: (filters: PurchasesListFilters) => void;
  onSessionEnded?: () => void;
  registered?: boolean;
  onNoticeDismissed?: () => void;
  access?: BackofficeAccess;
  supplierFilter?: { supplierId: string; onClear: () => void };
};

function ControlledScreen({
  services,
  filters: initial = {},
  onFiltersChange = () => {},
  onSessionEnded = () => {},
  registered = false,
  onNoticeDismissed = () => {},
  access = ADMINISTRATOR_ACCESS,
  supplierFilter,
}: ScreenOptions & { services: PurchasesListScreenServices }) {
  const [filters, setFilters] = useState(purchasesListFilters.parse(initial));
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <PurchasesListScreen
          access={access}
          productCreationModal={StubProductCreationModal}
          services={services}
          filters={filters}
          onFiltersChange={(next) => {
            onFiltersChange(next);
            setFilters(next);
          }}
          onSessionEnded={onSessionEnded}
          registered={registered}
          onNoticeDismissed={onNoticeDismissed}
          {...(supplierFilter === undefined ? {} : { supplierFilter })}
        />
      </main>
    </FieldSizeProvider>
  );
}

export function screenElement(services: PurchasesListScreenServices, options: ScreenOptions = {}) {
  return <ControlledScreen services={services} {...options} />;
}

export function renderScreen(...args: Parameters<typeof screenElement>) {
  return render(screenElement(...args));
}

export type Screen = Awaited<ReturnType<typeof renderScreen>>;

export function rowTexts(screen: Screen): string[] {
  return screen
    .getByRole("row")
    .all()
    .slice(1)
    .map((row) => row.element().textContent ?? "");
}

export async function loaded(services: PurchasesListScreenServices, options: ScreenOptions = {}) {
  vi.mocked(services.fetchPurchases).mockResolvedValue({
    kind: "ok",
    value: [compraDeMiel, compraDeAvena],
  });
  const screen = await renderScreen(services, options);
  await expect.element(screen.getByRole("table", { name: "Compras" })).toBeVisible();
  return screen;
}
