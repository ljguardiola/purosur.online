import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { accessWith } from "../shell/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import { type StockCountsFilters, stockCountsFilters } from "./routes";
import { StockCountsScreen } from "./stock-counts-screen";
import type { StockCountsScreenServices } from "./stock-counts-services";
import {
  almonds,
  almondsCount,
  crackers,
  honey,
  honeyCount,
  supersededCount,
  tea,
  withoutBalance,
} from "./test-support/stock-fixtures";

const COUNTER_WHO_VIEWS = accessWith("stock_counts", "stock_balances", "stock_area");

const NOW = () => new Date("2026-09-15T21:40:30.000Z");

function createServices(counts = [almondsCount, honeyCount]): StockCountsScreenServices {
  return {
    fetchStockCounts: vi.fn().mockResolvedValue({ kind: "ok", value: { counts } }),
    fetchStockProducts: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { products: [almonds, crackers, honey, tea].map(withoutBalance) },
    }),
    fetchExpectedBalance: vi
      .fn()
      .mockResolvedValue({ kind: "ok", value: { ...tea, balance: 17_000 } }),
    registerCount: vi.fn(),
  };
}

function renderScreen(
  services: StockCountsScreenServices,
  {
    access = COUNTER_WHO_VIEWS,
    filters = stockCountsFilters.parse({}),
    onFiltersChange = () => {},
    onSessionEnded = () => {},
  }: {
    access?: BackofficeAccess;
    filters?: StockCountsFilters;
    onFiltersChange?: (filters: StockCountsFilters) => void;
    onSessionEnded?: () => void;
  } = {},
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <StockCountsScreen
          access={access}
          services={services}
          filters={filters}
          onFiltersChange={onFiltersChange}
          onSessionEnded={onSessionEnded}
          now={NOW}
        />
      </main>
    </FieldSizeProvider>,
  );
}

type Screen = Awaited<ReturnType<typeof renderScreen>>;

test("shows each count with its moment, product, expected and counted quantities and difference", async () => {
  const screen = await renderScreen(createServices([almondsCount, honeyCount, supersededCount]));

  await expect.element(screen.getByRole("heading", { name: "Recuentos", level: 1 })).toBeVisible();
  const table = screen.getByRole("table", { name: "Recuentos" });
  await expect.element(table.getByText("15/09/2026")).toBeVisible();
  await expect.element(table.getByText("18:32")).toBeVisible();
  await expect.element(table.getByText("Frutos secos")).toBeVisible();
  await expect.element(table.getByText("12,400 kg")).toBeVisible();
  await expect.element(table.getByText("12,150 kg")).toBeVisible();
  await expect.element(table.getByText("− 0,250 kg")).toBeVisible();
  await expect.element(table.getByText("Sin diferencia")).toBeVisible();
  await expect.element(table.getByText("Superado por un recuento posterior")).toBeVisible();
  await expect.element(screen.getByText("3 recuentos en los últimos 30 días")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("reads the period the URL names and reports a new one", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, {
    filters: stockCountsFilters.parse({ period: "90" }),
    onFiltersChange,
  });
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  expect(services.fetchStockCounts).toHaveBeenCalledWith(90);

  await userEvent.click(screen.getByRole("button", { name: /Período:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Últimos 7 días" }));

  await expect.poll(() => vi.mocked(services.fetchStockCounts).mock.lastCall).toEqual([7]);
  await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toMatchObject({ period: "7" });
});

test("says there are no counts in the period when there are none", async () => {
  const screen = await renderScreen(createServices([]), {
    filters: stockCountsFilters.parse({ period: "7" }),
  });

  await expect.element(screen.getByText("Sin recuentos en los últimos 7 días")).toBeVisible();
  await expect
    .element(screen.getByText("Un recuento corrige el saldo con lo que hay en el local."))
    .toBeVisible();
});

test("says nothing matches when the search hides every count", async () => {
  const screen = await renderScreen(createServices(), {
    filters: stockCountsFilters.parse({ search: "yerba" }),
  });

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
});

test("shows a failed load with a retry that loads the counts again", async () => {
  const services = createServices();
  vi.mocked(services.fetchStockCounts)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: { counts: [almondsCount] } });
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
});

async function openNewCount(screen: Screen) {
  await userEvent.click(screen.getByRole("button", { name: "Nuevo recuento" }));
  const dialog = screen.getByRole("dialog", { name: "Nuevo recuento" });
  await expect.element(dialog.getByRole("button", { name: /Producto/ })).toBeVisible();
  return dialog;
}

async function chooseProduct(screen: Screen, name: string) {
  const dialog = screen.getByRole("dialog", { name: "Nuevo recuento" });
  await userEvent.click(dialog.getByRole("button", { name: /Producto/ }));
  await userEvent.click(screen.getByRole("option", { name }));
}

test("starts a new count now, and shows the balance the chosen product expects and the difference", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  const dialog = await openNewCount(screen);

  expect(dialog.getByRole("textbox", { name: "Hora" }).element()).toHaveProperty("value", "18:40");
  await chooseProduct(screen, "Té verde en hebras 100 g");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad contada/ }), "16");

  await expect.element(dialog.getByText("Saldo esperado")).toBeVisible();
  await expect.element(dialog.getByText("17 u")).toBeVisible();
  await expect.element(dialog.getByText("− 1 u")).toBeVisible();
  expect(services.fetchExpectedBalance).toHaveBeenCalledWith(tea.id, "2026-09-15T21:40:30.000Z");
  await expectNoAccessibilityViolations(screen.container);
});

test("registers the count at the moment chosen and shows the balance it left", async () => {
  const services = createServices();
  vi.mocked(services.registerCount).mockResolvedValue({
    kind: "ok",
    value: { expected: 17_000, delta: -1000, balance: 16_000, superseded: false },
  });
  const screen = await renderScreen(services);
  const dialog = await openNewCount(screen);
  await chooseProduct(screen, "Té verde en hebras 100 g");
  await userEvent.fill(dialog.getByRole("textbox", { name: "Hora" }), "18:32");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad contada/ }), "16");

  await userEvent.click(dialog.getByRole("button", { name: "Registrar el recuento" }));

  await expect
    .element(
      screen
        .getByRole("status")
        .getByText("Saldo corregido Té verde en hebras 100 g queda en 16 u."),
    )
    .toBeInTheDocument();
  expect(services.registerCount).toHaveBeenCalledWith({
    productId: tea.id,
    counted: 16_000,
    occurredAt: "2026-09-15T18:32:00-03:00",
  });
  expect(screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchStockCounts).mock.calls.length).toBe(2);
});

test.each([
  [
    { expected: 24_000, delta: 0, balance: 24_000, superseded: false },
    "Sin diferencia",
    "Miel pura de abeja 1 kg sigue en 24 u.",
  ],
  [
    { expected: 20_000, delta: -2000, balance: 24_000, superseded: true },
    "El recuento no cambió el saldo",
    "Hay un recuento posterior de Miel pura de abeja 1 kg: el saldo sigue en 24 u.",
  ],
])("tells how a count left the balance: %j", async (result, title, description) => {
  const services = createServices();
  vi.mocked(services.registerCount).mockResolvedValue({ kind: "ok", value: result });
  const screen = await renderScreen(services);
  const dialog = await openNewCount(screen);
  await chooseProduct(screen, "Miel pura de abeja 1 kg");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad contada/ }), "24");

  await userEvent.click(dialog.getByRole("button", { name: "Registrar el recuento" }));

  await expect
    .element(screen.getByRole("status").getByText(`${title} ${description}`))
    .toBeInTheDocument();
});

test("asks for the product and the quantity before registering anything", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  const dialog = await openNewCount(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Registrar el recuento" }));

  await expect.element(dialog.getByText("Elegí el producto.")).toBeVisible();
  await expect.element(dialog.getByText("Ingresá la cantidad contada.")).toBeVisible();
  expect(services.registerCount).not.toHaveBeenCalled();
});

test("asks for whole units of a product sold by the unit", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  const dialog = await openNewCount(screen);
  await chooseProduct(screen, "Miel pura de abeja 1 kg");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad contada/ }), "1,5");

  await userEvent.click(dialog.getByRole("button", { name: "Registrar el recuento" }));

  await expect
    .element(dialog.getByText("Escribí una cantidad entera de unidades, por ejemplo 16."))
    .toBeVisible();
  expect(services.registerCount).not.toHaveBeenCalled();
});

test("asks for a time written the way it expects", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  const dialog = await openNewCount(screen);
  await chooseProduct(screen, "Almendras peladas");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad contada/ }), "12,150");
  await userEvent.fill(dialog.getByRole("textbox", { name: "Hora" }), "6 y media");

  await userEvent.click(dialog.getByRole("button", { name: "Registrar el recuento" }));

  await expect.element(dialog.getByText("Escribí la hora como 18:32.")).toBeVisible();
  expect(services.registerCount).not.toHaveBeenCalled();
});

test.each([
  [{ kind: "occurred_in_the_future" }, "El recuento no puede ser posterior a ahora."],
  [
    { kind: "count_at_same_moment" },
    "Ya hay un recuento de este producto a esa hora. Elegí otra hora.",
  ],
  [
    { kind: "validation_failed", field: "counted" },
    "Escribí los kilos con coma para los decimales, hasta 3, por ejemplo 12,150.",
  ],
  [{ kind: "failed" }, "No se pudo guardar el recuento"],
  [{ kind: "rate_limited", retryAfterSeconds: 30 }, "Demasiadas solicitudes"],
  [{ kind: "not_found" }, "Producto desactivado"],
] as const)("keeps the modal open and explains the refusal %j", async (outcome, message) => {
  const services = createServices();
  vi.mocked(services.registerCount).mockResolvedValue(outcome);
  const screen = await renderScreen(services);
  const dialog = await openNewCount(screen);
  await chooseProduct(screen, "Almendras peladas");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad contada/ }), "12,150");

  await userEvent.click(dialog.getByRole("button", { name: "Registrar el recuento" }));

  await expect.element(dialog.getByText(message)).toBeVisible();
});

test("ends the session when registering finds it over", async () => {
  const services = createServices();
  vi.mocked(services.registerCount).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, { onSessionEnded });
  const dialog = await openNewCount(screen);
  await chooseProduct(screen, "Almendras peladas");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad contada/ }), "1");

  await userEvent.click(dialog.getByRole("button", { name: "Registrar el recuento" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("shows a failed load of the products with a retry inside the modal", async () => {
  const services = createServices();
  vi.mocked(services.fetchStockProducts)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: { products: [withoutBalance(almonds)] } });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Nuevo recuento" }));
  const dialog = screen.getByRole("dialog", { name: "Nuevo recuento" });

  await userEvent.click(dialog.getByRole("button", { name: "Reintentar" }));

  await expect.element(dialog.getByRole("button", { name: /Producto/ })).toBeVisible();
});

test("closes the modal without registering anything on Cancelar", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  const dialog = await openNewCount(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(screen.getByRole("dialog").query()).toBeNull();
  expect(services.registerCount).not.toHaveBeenCalled();
});

test("registers a count left at its default moment at the exact instant the modal opened", async () => {
  const services = createServices();
  vi.mocked(services.registerCount).mockResolvedValue({
    kind: "ok",
    value: { expected: 17_000, delta: -1000, balance: 16_000, superseded: false },
  });
  const screen = await renderScreen(services);
  const dialog = await openNewCount(screen);
  await chooseProduct(screen, "Té verde en hebras 100 g");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad contada/ }), "16");

  await userEvent.click(dialog.getByRole("button", { name: "Registrar el recuento" }));

  await expect
    .poll(() => vi.mocked(services.registerCount).mock.calls[0]?.[0])
    .toEqual({
      productId: tea.id,
      counted: 16_000,
      occurredAt: "2026-09-15T21:40:30.000Z",
    });
});

test("registers a count for a user who may not view balances, showing no expected balance", async () => {
  const services = createServices();
  vi.mocked(services.registerCount).mockResolvedValue({
    kind: "ok",
    value: { expected: 17_000, delta: -1000, balance: 16_000, superseded: false },
  });
  const screen = await renderScreen(services, {
    access: accessWith("stock_counts", "stock_area"),
  });
  const dialog = await openNewCount(screen);
  await chooseProduct(screen, "Té verde en hebras 100 g");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad contada/ }), "16");

  expect(dialog.getByText("Saldo esperado").query()).toBeNull();
  await userEvent.click(dialog.getByRole("button", { name: "Registrar el recuento" }));

  await expect
    .element(
      screen.getByRole("status").getByText("Saldo corregido Té verde en hebras 100 g: − 1 u."),
    )
    .toBeInTheDocument();
  expect(services.fetchExpectedBalance).not.toHaveBeenCalled();
});
