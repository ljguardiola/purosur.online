import type { PurchaseOrderSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { type PurchaseOrdersFilters, purchaseOrdersFilters } from "./purchase-orders-filters";
import { PurchaseOrdersScreen } from "./purchase-orders-screen";
import type { PurchaseOrdersScreenServices } from "./purchase-orders-services";
import { CANCELLED_SUMMARY, DRAFT_SUMMARY, PRICED_SUMMARY } from "./test-support/purchase-orders";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function createServices(
  overrides: Partial<PurchaseOrdersScreenServices> = {},
): PurchaseOrdersScreenServices {
  return { fetchPurchaseOrders: vi.fn(), ...overrides };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function renderScreen(
  services: PurchaseOrdersScreenServices,
  {
    filters = purchaseOrdersFilters.parse({}),
    onFiltersChange = () => {},
    onOpenOrder = () => {},
    onSessionEnded = () => {},
  }: {
    filters?: PurchaseOrdersFilters;
    onFiltersChange?: (filters: PurchaseOrdersFilters) => void;
    onOpenOrder?: (orderId: string) => void;
    onSessionEnded?: () => void;
  } = {},
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <PurchaseOrdersScreen
          services={services}
          filters={filters}
          onFiltersChange={onFiltersChange}
          onOpenOrder={onOpenOrder}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>,
  );
}

type Screen = Awaited<ReturnType<typeof renderScreen>>;

function rowOf(screen: Screen, supplier: string) {
  return screen.getByRole("row", { name: new RegExp(supplier) });
}

async function loaded(
  services: PurchaseOrdersScreenServices,
  orders: PurchaseOrderSummary[],
  options: Parameters<typeof renderScreen>[1] = {},
) {
  vi.mocked(services.fetchPurchaseOrders).mockResolvedValue({ kind: "ok", value: orders });
  const screen = await renderScreen(services, options);
  await expect.element(screen.getByRole("table", { name: "Pedidos de compra" })).toBeVisible();
  return screen;
}

test("shows the heading under Pedidos and every order with its supplier, date, lines, expected total and state", async () => {
  const services = createServices();
  const screen = await loaded(services, [PRICED_SUMMARY, CANCELLED_SUMMARY]);

  await expect.element(screen.getByText("Pedidos", { exact: true }).first()).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Pedidos de compra", level: 1 }))
    .toBeVisible();
  const priced = rowOf(screen, "Granos del Sur").first();
  await expect.element(priced.getByText("11/03/2026")).toBeVisible();
  await expect.element(priced.getByText("1", { exact: true })).toBeVisible();
  await expect.element(priced.getByText("$ 1.200,00")).toBeVisible();
  await expect.element(priced.getByText("Borrador")).toBeVisible();
  await expect.element(screen.getByText("Cancelado")).toBeVisible();
  expect(services.fetchPurchaseOrders).toHaveBeenCalledWith("ALL");
});

test("shows the day an order was created in Argentina", async () => {
  const services = createServices();
  const screen = await loaded(services, [
    { ...PRICED_SUMMARY, createdAt: "2026-03-10T01:30:00.000Z" },
  ]);

  await expect.element(rowOf(screen, "Granos del Sur").getByText("09/03/2026")).toBeVisible();
});

test("says a line has no list price next to the total that leaves it out", async () => {
  const services = createServices();
  const screen = await loaded(services, [DRAFT_SUMMARY, PRICED_SUMMARY]);

  const unpriced = rowOf(screen, "Distribuidora Andina");
  await expect.element(unpriced.getByText("$ 5.550,00")).toBeVisible();
  await expect.element(unpriced.getByText("Hay líneas sin precio de lista")).toBeVisible();
  expect(
    rowOf(screen, "Granos del Sur").getByText("Hay líneas sin precio de lista").query(),
  ).toBeNull();
});

test("counts the orders in the footer", async () => {
  const services = createServices();
  const screen = await loaded(services, [DRAFT_SUMMARY, PRICED_SUMMARY, CANCELLED_SUMMARY]);

  await expect.element(screen.getByText("3 pedidos")).toBeVisible();
});

test("says there are no orders yet, and nothing else", async () => {
  const services = createServices();
  const screen = await loaded(services, []);
  const table = screen.getByRole("table", { name: "Pedidos de compra" });

  await expect.element(table.getByText("Todavía no hay pedidos")).toBeVisible();
  expect(table.element().querySelector("tbody")?.textContent).toBe("Todavía no hay pedidos");
});

test("the state filter asks the cloud for that state and reports the filters", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await loaded(services, [DRAFT_SUMMARY, CANCELLED_SUMMARY], { onFiltersChange });
  vi.mocked(services.fetchPurchaseOrders).mockResolvedValue({
    kind: "ok",
    value: [CANCELLED_SUMMARY],
  });

  await userEvent.click(screen.getByRole("button", { name: /Estado:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Cancelados" }));

  await expect.poll(() => services.fetchPurchaseOrders).toHaveBeenCalledWith("CANCELLED");
  await expect.element(screen.getByText("Distribuidora Andina")).not.toBeInTheDocument();
  await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toEqual({ state: "CANCELLED" });
});

test("the state filter offers Todos, Borradores and Cancelados", async () => {
  const services = createServices();
  const screen = await loaded(services, [DRAFT_SUMMARY]);

  await userEvent.click(screen.getByRole("button", { name: /Estado:/ }));

  await expect.element(screen.getByRole("option", { name: "Todos" })).toBeVisible();
  await expect.element(screen.getByRole("option", { name: "Borradores" })).toBeVisible();
  await expect.element(screen.getByRole("option", { name: "Cancelados" })).toBeVisible();
});

test("opens on the filter the URL carries", async () => {
  const services = createServices();
  await loaded(services, [CANCELLED_SUMMARY], {
    filters: purchaseOrdersFilters.parse({ state: "CANCELLED" }),
  });

  expect(services.fetchPurchaseOrders).toHaveBeenCalledWith("CANCELLED");
});

test("says nothing matches when a state has no orders", async () => {
  const services = createServices();
  const screen = await loaded(services, [], {
    filters: purchaseOrdersFilters.parse({ state: "CANCELLED" }),
  });

  const table = screen.getByRole("table", { name: "Pedidos de compra" });
  await expect.element(table.getByText("Sin resultados")).toBeVisible();
  await expect.element(table.getByText("Probá con otro estado.")).toBeVisible();
  expect(table.getByText("Todavía no hay pedidos").query()).toBeNull();
});

test("opens an order from its row", async () => {
  const services = createServices();
  const onOpenOrder = vi.fn();
  const screen = await loaded(services, [DRAFT_SUMMARY, CANCELLED_SUMMARY], { onOpenOrder });

  await userEvent.click(
    rowOf(screen, "Distribuidora Andina").getByRole("button", {
      name: "Abrir el pedido de Distribuidora Andina",
    }),
  );

  expect(onOpenOrder).toHaveBeenCalledWith(DRAFT_SUMMARY.id);
});

test("shows a load error with a retry action that starts again from the loading placeholder", async () => {
  const services = createServices();
  const retry = deferred<Awaited<ReturnType<typeof services.fetchPurchaseOrders>>>();
  vi.mocked(services.fetchPurchaseOrders)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir los pedidos")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("table", { name: "Pedidos de compra" }))
    .toHaveAttribute("aria-busy", "true");
  retry.resolve({ kind: "ok", value: [DRAFT_SUMMARY] });
  await expect.element(screen.getByText("Distribuidora Andina")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const services = createServices();
  vi.mocked(services.fetchPurchaseOrders).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 60,
  });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("ends the session when the orders come back unauthenticated", async () => {
  const services = createServices();
  vi.mocked(services.fetchPurchaseOrders).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the orders come back forbidden", async () => {
  window.history.pushState(null, "", "/purchase-orders");
  const services = createServices();
  vi.mocked(services.fetchPurchaseOrders).mockResolvedValue({ kind: "forbidden" });
  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("has no accessibility violations once loaded", async () => {
  const services = createServices();
  const screen = await loaded(services, [DRAFT_SUMMARY, CANCELLED_SUMMARY]);

  await expectNoAccessibilityViolations(screen.container);
});
