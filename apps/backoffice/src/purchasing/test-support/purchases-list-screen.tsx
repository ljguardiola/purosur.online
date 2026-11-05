import { FieldSizeProvider } from "@purosur/ui";
import { expect, vi } from "vitest";
import { StubProductCreationModal } from "../../platform/test-support/creation-parts";
import type { BackofficeAccess } from "../../shell/backoffice-access";
import { ADMINISTRATOR_ACCESS } from "../../shell/test-support/backoffice-access";
import { render } from "../../shell/test-support/render-with-router";
import { PurchasesListScreen } from "../purchases-list-screen";
import type { PurchasesListScreenServices } from "../purchases-list-services";
import { compraDeAvena, compraDeMiel, purchaseChoicesFrom } from "./purchases";

export function createServices(
  overrides: Partial<PurchasesListScreenServices> = {},
): PurchasesListScreenServices {
  return {
    fetchPurchases: vi.fn(),
    fetchPurchaseChoices: vi.fn().mockResolvedValue({ kind: "ok", value: purchaseChoicesFrom([]) }),
    fetchPurchaseChanges: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    addPurchaseLines: vi.fn(),
    correctPurchaseHeader: vi.fn(),
    correctPurchaseLineExpiry: vi.fn(),
    splitPurchaseLineExpiry: vi.fn(),
    correctPurchaseLineCost: vi.fn(),
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
  onSessionEnded?: () => void;
  registered?: boolean;
  onNoticeDismissed?: () => void;
  access?: BackofficeAccess;
};

export function screenElement(
  services: PurchasesListScreenServices,
  {
    onSessionEnded = () => {},
    registered = false,
    onNoticeDismissed = () => {},
    access = ADMINISTRATOR_ACCESS,
  }: ScreenOptions = {},
) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <PurchasesListScreen
          access={access}
          productCreationModal={StubProductCreationModal}
          services={services}
          onSessionEnded={onSessionEnded}
          registered={registered}
          onNoticeDismissed={onNoticeDismissed}
        />
      </main>
    </FieldSizeProvider>
  );
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
