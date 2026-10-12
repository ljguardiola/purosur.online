import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
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
  await expect.element(table.getByText("Por lote · 2 lotes")).toBeVisible();
  await expect.element(table.getByText("Por producto").first()).toBeVisible();
  await expect.element(table.getByText("12,400 kg")).toBeVisible();
  await expect.element(table.getByText("12,150 kg")).toBeVisible();
  await expect.element(table.getByText("− 0,250 kg")).toBeVisible();
  await expect.element(table.getByText("Sin diferencia")).toBeVisible();
  await expect.element(table.getByText("Superado por un recuento posterior")).toBeVisible();
  await expect.element(screen.getByText("3 recuentos en los últimos 30 días")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

function cellOf(text: string): HTMLElement {
  return page.getByText(text, { exact: true }).element() as HTMLElement;
}

test("writes the day of a count in bold with its time under it, and a difference in the tone of its sign", async () => {
  const screen = await renderScreen(createServices([almondsCount, honeyCount, teaCount]));
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();

  expect(cellOf("15/09/2026").className).toContain("font-bold");
  expect(cellOf("18:32").className).toContain("text-text-subtle");
  expect(cellOf("Almendras peladas").className).toContain("font-bold");
  expect(cellOf("12,400 kg").className).toContain("text-text-subtle");
  expect(cellOf("12,400 kg").className).not.toContain("font-bold");
  expect(cellOf("12,150 kg").className).toContain("font-bold");
  expect(cellOf("− 0,250 kg").className).toContain("text-error-strong");
  expect(cellOf("− 0,250 kg").className).toContain("font-bold");
  expect(cellOf("+ 1 u").className).toContain("text-success-strong");
  expect(cellOf("+ 1 u").className).toContain("font-bold");
  expect(cellOf("Sin diferencia").className).toContain("text-text-subtle");
  expect(cellOf("Sin diferencia").className).not.toContain("font-bold");
});

test("writes a superseded count's difference in its tone, with the tag under it", async () => {
  const screen = await renderScreen(createServices([supersededCount]));

  await expect.element(screen.getByText("Superado por un recuento posterior")).toBeVisible();
  expect(cellOf("− 2 u").className).toContain("text-error-strong");
});

test("says a count by a single lot counted one lot", async () => {
  const screen = await renderScreen(createServices([{ ...almondsCount, lotCount: 1 }]));

  await expect
    .element(screen.getByRole("table", { name: "Recuentos" }).getByText("Por lote · 1 lote"))
    .toBeVisible();
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

const teaCount = {
  ...honeyCount,
  id: "count-4",
  productId: tea.id,
  productName: tea.name,
  occurredAt: "2026-09-14T12:00:00.000Z",
  expected: 17_000,
  counted: 18_000,
  delta: 1_000,
};

const COUNT_NAMES = [almonds.name, honey.name, tea.name];

function shownProductNames(screen: Screen) {
  return screen
    .getByRole("table", { name: "Recuentos" })
    .getByRole("row")
    .elements()
    .map((row) => COUNT_NAMES.find((name) => row.textContent?.includes(name)))
    .filter((name) => name !== undefined);
}

test("opens on the counts by date, the latest first", async () => {
  const screen = await renderScreen(createServices([honeyCount, almondsCount, teaCount]));
  await expect.element(screen.getByText(honey.name)).toBeVisible();

  expect(shownProductNames(screen)).toEqual([almonds.name, tea.name, honey.name]);
});

test.each([
  [{ sortBy: "date", sort: "ascending" }, [honey, tea, almonds]],
  [{ sortBy: "product", sort: "descending" }, [tea, honey, almonds]],
  [{ sortBy: "expected", sort: "descending" }, [honey, tea, almonds]],
  [{ sortBy: "counted", sort: "ascending" }, [almonds, tea, honey]],
  [{ sortBy: "difference", sort: "descending" }, [tea, honey, almonds]],
] as const)("opens on the order the URL asks for, %j", async (order, products) => {
  const screen = await renderScreen(createServices([almondsCount, honeyCount, teaCount]), {
    filters: stockCountsFilters.parse(order),
  });
  await expect.element(screen.getByText(honey.name)).toBeVisible();

  expect(shownProductNames(screen)).toEqual(products.map((product) => product.name));
});

test.each([
  ["Fecha", { sortBy: "date", sort: "ascending" }],
  ["Producto", { sortBy: "product", sort: "ascending" }],
  ["Saldo esperado", { sortBy: "expected", sort: "descending" }],
  ["Contado", { sortBy: "counted", sort: "descending" }],
  ["Diferencia", { sortBy: "difference", sort: "descending" }],
] as const)(
  "reports the %s column as the order when its header is pressed",
  async (header, order) => {
    const onFiltersChange = vi.fn();
    const screen = await renderScreen(createServices([almondsCount, honeyCount, teaCount]), {
      onFiltersChange,
    });
    await expect.element(screen.getByText(almonds.name)).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: header, exact: true }));

    await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toMatchObject(order);
  },
);

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

test("starts a new count now, at the moment the screen reads", async () => {
  const services = createServices();
  vi.mocked(services.registerCount).mockResolvedValue({
    kind: "ok",
    value: { expected: 17_000, delta: -1000, balance: 16_000, superseded: false },
  });
  const screen = await renderScreen(services);
  const dialog = await openNewCount(screen);
  expect(dialog.getByRole("textbox", { name: "Hora" }).element()).toHaveProperty("value", "18:40");
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

test("closes the modal, refreshes the counts and shows the balance a count left", async () => {
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
    .element(
      screen
        .getByRole("status")
        .getByText("Saldo corregido Té verde en hebras 100 g queda en 16 u."),
    )
    .toBeInTheDocument();
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

test("closes the modal without registering anything on Cancelar", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  const dialog = await openNewCount(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(screen.getByRole("dialog").query()).toBeNull();
  expect(services.registerCount).not.toHaveBeenCalled();
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
