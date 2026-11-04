import type { OrderSuggestion } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { withReadsCounted } from "../platform/test-support/reads-counted";
import { OUTDATED_TAB_ADVICE, openAsOutdatedTab } from "../platform/test-support/release-monitor";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { ADMINISTRATOR_ACCESS, accessWith } from "../shell/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import { type OrderSuggestionFilters, orderSuggestionFilters } from "./order-suggestion-filters";
import { OrderSuggestionScreen } from "./order-suggestion-screen";
import type { OrderSuggestionScreenServices } from "./order-suggestion-services";
import { ORDER_SUGGESTION } from "./test-support/order-suggestion";

const [almonds, cookies] = ORDER_SUGGESTION.lines as [
  OrderSuggestion["lines"][number],
  OrderSuggestion["lines"][number],
];

beforeEach(async () => {
  window.history.pushState(null, "", "/");
  await page.viewport(1440, 900);
});

afterEach(() => page.viewport(414, 896));

function createServices(
  overrides: Partial<OrderSuggestionScreenServices> = {},
): OrderSuggestionScreenServices {
  return {
    fetchOrderSuggestion: vi.fn(),
    buildPurchaseOrders: vi.fn(),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function screenElement(
  services: OrderSuggestionScreenServices,
  {
    filters = orderSuggestionFilters.parse({}),
    onFiltersChange = () => {},
    onOrdersBuilt = () => {},
    onSessionEnded = () => {},
    access = ADMINISTRATOR_ACCESS,
  }: {
    filters?: OrderSuggestionFilters;
    onFiltersChange?: (filters: OrderSuggestionFilters) => void;
    onOrdersBuilt?: () => void;
    onSessionEnded?: () => void;
    access?: BackofficeAccess;
  } = {},
) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <OrderSuggestionScreen
          access={access}
          onOrdersBuilt={onOrdersBuilt}
          services={services}
          filters={filters}
          onFiltersChange={onFiltersChange}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>
  );
}

function renderScreen(...args: Parameters<typeof screenElement>) {
  return render(screenElement(...args));
}

type Screen = Awaited<ReturnType<typeof renderScreen>>;

function lineRows(screen: Screen) {
  return screen.getByRole("row").all().slice(1);
}

async function loaded(
  services: OrderSuggestionScreenServices,
  suggestion: OrderSuggestion = ORDER_SUGGESTION,
  options: Parameters<typeof screenElement>[1] = {},
) {
  vi.mocked(services.fetchOrderSuggestion).mockResolvedValue({ kind: "ok", value: suggestion });
  const screen = await renderScreen(services, options);
  await expect.element(screen.getByRole("table", { name: "Sugerencia de pedido" })).toBeVisible();
  return screen;
}

function supplierSelect(screen: Screen, productName: string) {
  return screen.getByRole("button", { name: new RegExp(`Proveedor de ${productName}`) });
}

test("shows the breadcrumb and the heading", async () => {
  const screen = await loaded(createServices());

  await expect.element(screen.getByText("Pedidos").first()).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Sugerencia de pedido", level: 1 }))
    .toBeVisible();
});

test("shows a row for each product, with its description and category, sold, stock and coverage", async () => {
  const screen = await loaded(createServices());

  await expect.poll(() => lineRows(screen)).toHaveLength(3);
  const row = screen.getByRole("row", { name: /Almendras peladas/ });
  await expect.element(row.getByText("Frutos secos")).toBeVisible();
  await expect.element(row.getByText("120 kg", { exact: true })).toBeVisible();
  await expect.element(row.getByText("10 kg", { exact: true })).toBeVisible();
  await expect.element(row.getByText("15 días")).toBeVisible();
});

test("shows beside the stock what was ordered and not yet received", async () => {
  const screen = await loaded(createServices());

  await expect.poll(() => lineRows(screen)).toHaveLength(3);
  await expect
    .element(screen.getByRole("columnheader", { name: "Pedido sin recibir" }))
    .toBeVisible();
  const row = screen.getByRole("row", { name: /Almendras peladas/ });
  await expect.element(row.getByText("7 kg", { exact: true })).toBeVisible();
});

test("shows the effective days as the coverage and says when the expiry capped them", async () => {
  const screen = await loaded(createServices(), {
    ...ORDER_SUGGESTION,
    lines: [{ ...almonds, effectiveDays: 10, cappedByExpiry: true }, cookies],
  });

  await expect.poll(() => lineRows(screen)).toHaveLength(2);
  const capped = screen.getByRole("row", { name: /Almendras peladas/ });
  await expect.element(capped.getByText("10 días")).toBeVisible();
  await expect.element(capped.getByText("Tope por vencimiento")).toBeVisible();
  const uncapped = screen.getByRole("row", { name: /Galletas/ });
  await expect.element(uncapped.getByText("20 días")).toBeVisible();
  await expect.element(uncapped.getByText("Tope por vencimiento")).not.toBeInTheDocument();
});

test("describes the product with its brand name and net content", async () => {
  const screen = await loaded(createServices(), {
    ...ORDER_SUGGESTION,
    lines: [
      {
        ...almonds,
        name: "Aceite de Almendras",
        brandName: "Vitora",
        netContent: { quantity: 30, unit: "ML" },
      },
    ],
  });

  await expect
    .element(screen.getByText("Aceite de Almendras Vitora 30 ml", { exact: true }))
    .toBeVisible();
});

test("proposes the cheapest supplier with its packages, quantity, price per unit and list date", async () => {
  const screen = await loaded(createServices());

  await expect
    .poll(() => supplierSelect(screen, "Almendras peladas").element().textContent)
    .toContain("Frutos Secos Mendoza");
  const row = screen.getByRole("row", { name: /Almendras peladas/ });
  await expect.element(row.getByText("2 × 25 kg")).toBeVisible();
  await expect.element(row.getByText("50 kg", { exact: true })).toBeVisible();
  await expect.element(row.getByText("$ 10.180,00 / kg", { exact: true })).toBeVisible();
  await expect.element(row.getByText("20/10/2026", { exact: true })).toBeVisible();
  await expect
    .element(screen.getByRole("columnheader", { name: "Por unidad de venta" }))
    .toBeVisible();
});

test("writes a product sold by the unit with no unit in its price", async () => {
  const screen = await loaded(createServices());

  const honey = screen.getByRole("row", { name: /Miel pura de abeja 1 kg/ });
  await expect.element(honey.getByText("1 × 12 u")).toBeVisible();
  await expect.element(honey.getByText("$ 5.583,33", { exact: true })).toBeVisible();
});

test("offers every priced supplier with its price per unit and list date, the cheapest marked", async () => {
  const screen = await loaded(createServices());

  await userEvent.click(supplierSelect(screen, "Almendras peladas"));

  const options = screen
    .getByRole("option")
    .elements()
    .map((option) => option.textContent);
  expect(options).toEqual([
    "Frutos Secos Mendoza · $ 10.180,00 / kg · 20/10/2026El más barato",
    "Distribuidora del Sur · $ 10.640,00 / kg · 02/09/2026",
    "Ninguno, fuera del pedido",
  ]);
});

test("shows the packages, quantity, price per unit and date of the supplier chosen instead", async () => {
  const screen = await loaded(createServices());

  await userEvent.click(supplierSelect(screen, "Almendras peladas"));
  await userEvent.click(screen.getByRole("option", { name: /Distribuidora del Sur/ }));

  const row = screen.getByRole("row", { name: /Almendras peladas/ });
  await expect
    .poll(() => supplierSelect(screen, "Almendras peladas").element().textContent)
    .toContain("Distribuidora del Sur");
  await expect.element(row.getByText("10 × 5 kg")).toBeVisible();
  await expect.element(row.getByText("$ 10.640,00 / kg", { exact: true })).toBeVisible();
  await expect.element(row.getByText("02/09/2026", { exact: true })).toBeVisible();
  expect(row.getByText("20/10/2026", { exact: true }).query()).toBeNull();
});

test("changing the supplier of a line leaves the other lines as they were", async () => {
  const screen = await loaded(createServices());

  await userEvent.click(supplierSelect(screen, "Almendras peladas"));
  await userEvent.click(screen.getByRole("option", { name: /Distribuidora del Sur/ }));

  await expect
    .poll(() => supplierSelect(screen, "Miel pura de abeja 1 kg").element().textContent)
    .toContain("Apícola Los Tilos");
});

test("leaves a line out of the order, showing it as left out", async () => {
  const screen = await loaded(createServices());

  await userEvent.click(supplierSelect(screen, "Almendras peladas"));
  await userEvent.click(screen.getByRole("option", { name: "Ninguno, fuera del pedido" }));

  const row = screen.getByRole("row", { name: /Almendras peladas/ });
  await expect.element(row.getByText("Fuera del pedido", { exact: true })).toBeVisible();
  expect(row.getByText("2 × 25 kg").query()).toBeNull();
  expect(row.getByText("20/10/2026", { exact: true }).query()).toBeNull();
});

test("puts a line back in the order by choosing a supplier again", async () => {
  const screen = await loaded(createServices());
  await userEvent.click(supplierSelect(screen, "Almendras peladas"));
  await userEvent.click(screen.getByRole("option", { name: "Ninguno, fuera del pedido" }));

  await userEvent.click(supplierSelect(screen, "Almendras peladas"));
  await userEvent.click(screen.getByRole("option", { name: /Frutos Secos Mendoza/ }));

  await expect
    .element(screen.getByRole("row", { name: /Almendras peladas/ }).getByText("2 × 25 kg"))
    .toBeVisible();
});

test("shows a product without a price as having no proposed supplier, with the quantity it needs", async () => {
  const screen = await loaded(createServices());

  const row = screen.getByRole("row", { name: /Galletas de avena integrales/ });
  await expect.element(row.getByText("Almacén")).toBeVisible();
  await expect.element(row.getByText("Sin precio en ninguna lista cargada")).toBeVisible();
  await expect.element(row.getByText("30 u", { exact: true })).toBeVisible();
  await expect
    .poll(() => supplierSelect(screen, "Galletas de avena integrales").element().textContent)
    .toContain("Elegir proveedor");
});

test("offers the suppliers the cloud answers, by name, and leaving out to a product without a price", async () => {
  const screen = await loaded(createServices());

  await userEvent.click(supplierSelect(screen, "Galletas de avena integrales"));

  const options = screen
    .getByRole("option")
    .elements()
    .map((option) => option.textContent);
  expect(options).toEqual([
    "Distribuidora Andina",
    "Granos del Valle",
    "Ninguno, fuera del pedido",
  ]);
});

test("keeps showing the quantity needed when a supplier is picked for a product without a price", async () => {
  const screen = await loaded(createServices());

  await userEvent.click(supplierSelect(screen, "Galletas de avena integrales"));
  await userEvent.click(screen.getByRole("option", { name: "Granos del Valle" }));

  const row = screen.getByRole("row", { name: /Galletas de avena integrales/ });
  await expect
    .poll(() => supplierSelect(screen, "Galletas de avena integrales").element().textContent)
    .toContain("Granos del Valle");
  await expect.element(row.getByText("30 u", { exact: true })).toBeVisible();
});

test("leaves a product without a price out of the order", async () => {
  const screen = await loaded(createServices());

  await userEvent.click(supplierSelect(screen, "Galletas de avena integrales"));
  await userEvent.click(screen.getByRole("option", { name: "Ninguno, fuera del pedido" }));

  await expect
    .element(
      screen
        .getByRole("row", { name: /Galletas de avena integrales/ })
        .getByText("Fuera del pedido", { exact: true }),
    )
    .toBeVisible();
});

const cookiesWithUnpricedOffer: OrderSuggestion = {
  ...ORDER_SUGGESTION,
  lines: [
    {
      ...cookies,
      unpricedOffers: [
        {
          supplier: { id: "5a900000-0000-4000-8000-000000000005", name: "Granos del Valle" },
          packageQuantity: 12_000,
          saleUnit: "UNIT",
          priceCents: 1_200_000,
          listDate: "2026-09-15",
          reason: "vat_rate_missing",
          order: { packages: 3, quantity: 36_000 },
        },
      ],
    },
  ],
};

test("shows the packages the cloud states when a supplier whose offer has no price is picked", async () => {
  const screen = await loaded(createServices(), cookiesWithUnpricedOffer);

  await userEvent.click(supplierSelect(screen, "Galletas de avena integrales"));
  await userEvent.click(screen.getByRole("option", { name: "Granos del Valle" }));

  const row = screen.getByRole("row", { name: /Galletas de avena integrales/ });
  await expect.element(row.getByText("3 × 12 u")).toBeVisible();
  await expect.element(row.getByText("36 u", { exact: true })).toBeVisible();
});

test("lists the offer without a price of a product with no priced offer, not saying it has none", async () => {
  const screen = await loaded(createServices(), cookiesWithUnpricedOffer);

  const row = screen.getByRole("row", { name: /Galletas de avena integrales/ });
  await expect.element(row.getByText("Falta el IVA del ítem")).toBeVisible();
  expect(row.getByText("Sin precio en ninguna lista cargada").query()).toBeNull();
});

test.each([
  ["missing its VAT rate", "vat_rate_missing", "Falta el IVA del ítem"],
  ["through a link that has to be made again", "link_outdated", "Hay que volver a vincularlo"],
] as const)("lists an offer %s as not selectable, with its reason", async (_name, reason, text) => {
  const screen = await loaded(createServices(), {
    ...ORDER_SUGGESTION,
    lines: [
      {
        ...almonds,
        unpricedOffers: [
          {
            supplier: { id: "5a900000-0000-4000-8000-000000000009", name: "Mayorista Norte" },
            packageQuantity: 10_000,
            saleUnit: "KG",
            priceCents: 9_900_000,
            listDate: "2026-08-15",
            reason,
            order: null,
          },
        ],
      },
    ],
  });

  const row = screen.getByRole("row", { name: /Almendras peladas/ });
  await expect.element(row.getByText("Mayorista Norte", { exact: true })).toBeVisible();
  await expect.element(row.getByText(text)).toBeVisible();
  await userEvent.click(supplierSelect(screen, "Almendras peladas"));
  expect(
    screen
      .getByRole("option")
      .elements()
      .some((option) => option.textContent?.includes("Mayorista Norte")),
  ).toBe(false);
});

test("counts the products shown", async () => {
  const screen = await loaded(createServices());

  await expect.element(screen.getByText("3 productos")).toBeVisible();
});

test("counts a single product in the singular", async () => {
  const screen = await loaded(createServices(), { ...ORDER_SUGGESTION, lines: [cookies] });

  await expect.element(screen.getByText("1 producto", { exact: true })).toBeVisible();
});

test("searches the products by name and reports the search", async () => {
  const onFiltersChange = vi.fn();
  const screen = await loaded(createServices(), ORDER_SUGGESTION, { onFiltersChange });

  await userEvent.fill(screen.getByPlaceholder("Buscar un producto"), "miel");

  await expect.poll(() => lineRows(screen)).toHaveLength(1);
  await expect.element(screen.getByText("Miel pura de abeja 1 kg", { exact: true })).toBeVisible();
  await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toEqual({ search: "miel" });
});

test("opens on the search the URL carries", async () => {
  const screen = await loaded(createServices(), ORDER_SUGGESTION, {
    filters: orderSuggestionFilters.parse({ search: "galle" }),
  });

  await expect.poll(() => lineRows(screen)).toHaveLength(1);
  await expect.element(screen.getByPlaceholder("Buscar un producto")).toHaveValue("galle");
});

test("says nothing matches when the search hides every product", async () => {
  const screen = await loaded(createServices());

  await userEvent.fill(screen.getByPlaceholder("Buscar un producto"), "zzz");

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
});

test("says no product needs ordering when the suggestion is empty", async () => {
  const screen = await loaded(createServices(), { ...ORDER_SUGGESTION, lines: [] });

  await expect.element(screen.getByText("Ningún producto necesita pedirse")).toBeVisible();
});

test("shows the table loading until the suggestion arrives", async () => {
  const services = createServices();
  const pending = deferred<Awaited<ReturnType<typeof services.fetchOrderSuggestion>>>();
  vi.mocked(services.fetchOrderSuggestion).mockReturnValue(pending.promise);
  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: "Sugerencia de pedido" }))
    .toHaveAttribute("aria-busy", "true");
  pending.resolve({ kind: "ok", value: ORDER_SUGGESTION });
  await expect.element(screen.getByText("Almendras peladas", { exact: true })).toBeVisible();
});

test("shows a load error with a retry action that starts again from the loading placeholder", async () => {
  const services = createServices();
  const retry = deferred<Awaited<ReturnType<typeof services.fetchOrderSuggestion>>>();
  vi.mocked(services.fetchOrderSuggestion)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir la sugerencia de pedido")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("table", { name: "Sugerencia de pedido" }))
    .toHaveAttribute("aria-busy", "true");
  retry.resolve({ kind: "ok", value: ORDER_SUGGESTION });
  await expect.element(screen.getByText("Almendras peladas", { exact: true })).toBeVisible();
});

test("ends the session when the suggestion comes back unauthenticated", async () => {
  const services = createServices();
  vi.mocked(services.fetchOrderSuggestion).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the suggestion comes back forbidden", async () => {
  window.history.pushState(null, "", "/order-suggestion");
  const services = createServices();
  vi.mocked(services.fetchOrderSuggestion).mockResolvedValue({ kind: "forbidden" });
  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("has no accessibility violations once loaded", async () => {
  const screen = await loaded(createServices());

  await expectNoAccessibilityViolations(screen.container);
});

const MENDOZA_ID = "5a900000-0000-4000-8000-000000000001";
const SUR_ID = "5a900000-0000-4000-8000-000000000002";
const LOS_TILOS_ID = "5a900000-0000-4000-8000-000000000003";

function buildButton(screen: Screen) {
  return screen.getByRole("button", { name: "Armar pedidos" });
}

test("offers Armar pedidos only to a person who manages purchase orders", async () => {
  const withoutCapability = await loaded(createServices(), ORDER_SUGGESTION, {
    access: accessWith("price_comparison"),
  });
  expect(buildButton(withoutCapability).query()).toBeNull();
  await withoutCapability.unmount();

  const withCapability = await loaded(createServices(), ORDER_SUGGESTION, {
    access: accessWith("price_comparison", "purchase_orders"),
  });
  await expect.element(buildButton(withCapability)).toBeEnabled();
});

test("Armar pedidos sends the packages of the offer proposed for each line and goes to the orders", async () => {
  const services = createServices();
  vi.mocked(services.buildPurchaseOrders).mockResolvedValue({ kind: "ok", orderIds: ["o-1"] });
  const onOrdersBuilt = vi.fn();
  const screen = await loaded(services, ORDER_SUGGESTION, { onOrdersBuilt });

  await userEvent.click(buildButton(screen));

  expect(services.buildPurchaseOrders).toHaveBeenCalledWith({
    choices: [
      { productId: almonds.id, supplierId: MENDOZA_ID, packages: 2 },
      { productId: ORDER_SUGGESTION.lines[2]?.id, supplierId: LOS_TILOS_ID, packages: 1 },
    ],
  });
  await expect.poll(() => onOrdersBuilt.mock.calls.length).toBe(1);
});

test("Armar pedidos follows the supplier chosen and leaves out the lines left out of the order", async () => {
  const services = createServices();
  vi.mocked(services.buildPurchaseOrders).mockResolvedValue({ kind: "ok", orderIds: ["o-1"] });
  const screen = await loaded(services);

  await userEvent.click(supplierSelect(screen, "Almendras peladas"));
  await userEvent.click(screen.getByRole("option", { name: /Distribuidora del Sur/ }));
  await userEvent.click(supplierSelect(screen, "Miel pura de abeja 1 kg"));
  await userEvent.click(screen.getByRole("option", { name: "Ninguno, fuera del pedido" }));
  await userEvent.click(buildButton(screen));

  expect(services.buildPurchaseOrders).toHaveBeenCalledWith({
    choices: [{ productId: almonds.id, supplierId: SUR_ID, packages: 10 }],
  });
});

test("Armar pedidos stays disabled when no line has a supplier with packages to order", async () => {
  const screen = await loaded(createServices(), { ...ORDER_SUGGESTION, lines: [cookies] });

  await expect.element(buildButton(screen)).toBeDisabled();
});

test("Armar pedidos stays disabled while the suggestion loads and after it fails", async () => {
  const services = createServices();
  vi.mocked(services.fetchOrderSuggestion).mockResolvedValue({ kind: "failed" });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir la sugerencia de pedido")).toBeVisible();
  await expect.element(buildButton(screen)).toBeDisabled();
});

test.each([
  [
    { kind: "refused", reason: "offer_unavailable" },
    "Un proveedor ya no ofrece uno de los productos",
    "Actualizamos la sugerencia. Revisá los proveedores elegidos y volvé a armar los pedidos.",
  ],
  [
    { kind: "refused", reason: "supplier_not_purchasable" },
    "Un proveedor ya no está disponible",
    "Actualizamos la sugerencia. Elegí otro proveedor para sus productos.",
  ],
  [
    { kind: "refused", reason: "product_not_purchasable" },
    "Un producto ya no está disponible",
    "Actualizamos la sugerencia. Ya no se puede pedir.",
  ],
  [{ kind: "failed" }, "No se armaron los pedidos", "Volvé a intentarlo."],
  [
    { kind: "validation_failed", field: "packages" },
    "No se armaron los pedidos",
    "Volvé a intentarlo.",
  ],
  [
    { kind: "rate_limited", retryAfterSeconds: 60 },
    "Demasiadas solicitudes",
    "Se puede volver a intentar en 1 minuto.",
  ],
] as const)("shows %j when building the orders", async (outcome, title, description) => {
  const services = createServices();
  vi.mocked(services.buildPurchaseOrders).mockResolvedValue(outcome);
  const onOrdersBuilt = vi.fn();
  const screen = await loaded(services, ORDER_SUGGESTION, { onOrdersBuilt });

  await userEvent.click(buildButton(screen));

  await expect.element(screen.getByText(title)).toBeVisible();
  await expect.element(screen.getByText(description)).toBeVisible();
  expect(onOrdersBuilt).not.toHaveBeenCalled();
});

test("reads the suggestion again when the cloud refuses an offer", async () => {
  const services = createServices();
  vi.mocked(services.buildPurchaseOrders).mockResolvedValue({
    kind: "refused",
    reason: "offer_unavailable",
  });
  const screen = await loaded(services);

  await userEvent.click(buildButton(screen));

  await expect.poll(() => vi.mocked(services.fetchOrderSuggestion).mock.calls.length).toBe(2);
});

test("ends the session when building the orders finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.buildPurchaseOrders).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await loaded(services, ORDER_SUGGESTION, { onSessionEnded });

  await userEvent.click(buildButton(screen));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when building the orders comes back forbidden", async () => {
  window.history.pushState(null, "", "/order-suggestion");
  const services = createServices();
  vi.mocked(services.buildPurchaseOrders).mockResolvedValue({ kind: "forbidden" });
  const screen = await loaded(services);

  await userEvent.click(buildButton(screen));

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("tells an outdated tab to reload because the backoffice was updated when building the orders is refused", async () => {
  openAsOutdatedTab();
  const services = createServices();
  vi.mocked(services.buildPurchaseOrders).mockResolvedValue({ kind: "failed" });
  const screen = await loaded(services, ORDER_SUGGESTION);

  await userEvent.click(buildButton(screen));

  await expect.element(screen.getByText("No se armaron los pedidos")).toBeVisible();
  await expect.element(screen.getByText(OUTDATED_TAB_ADVICE)).toBeVisible();
});

test("typing in the search renders none of the listed products again", async () => {
  const listed = withReadsCounted(ORDER_SUGGESTION.lines, "soldQuantity");
  const screen = await loaded(createServices(), { ...ORDER_SUGGESTION, lines: listed.items });
  await expect.poll(() => lineRows(screen)).toHaveLength(3);
  listed.resetReads();

  await userEvent.type(screen.getByPlaceholder("Buscar un producto"), "a");

  await expect.element(screen.getByPlaceholder("Buscar un producto")).toHaveValue("a");
  expect(listed.reads()).toBe(0);
});
