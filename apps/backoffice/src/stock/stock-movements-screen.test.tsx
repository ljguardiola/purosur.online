import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { stockMovementsSearch } from "./routes";
import {
  almondOilCount,
  almondOilLoss,
  almondsCount,
  honeyCount,
  honeyLoss,
} from "./test-support/stock-fixtures";
import {
  ADJUSTMENTS_ONLY,
  COUNTS_ONLY,
  createServices,
  EVERYTHING,
  LOSSES_ONLY,
  renderScreen,
  TABLE,
} from "./test-support/stock-movements-screen";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

test("shows no title of its own and no button that registers", async () => {
  const screen = await renderScreen(createServices());

  await expect.element(screen.getByRole("table", { name: TABLE })).toBeVisible();
  expect(screen.getByRole("heading").query()).toBeNull();
  expect(screen.getByRole("button", { name: /^Cargar|^Registrar|^Nuevo/ }).query()).toBeNull();
});

test("lists counts, adjustments and losses together, the latest first", async () => {
  const screen = await renderScreen(createServices());

  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  const rows = screen.getByRole("table", { name: TABLE }).getByRole("row").elements();
  expect(rows.map((row) => row.textContent)).toEqual([
    "FechaProductoTipoDetalleCantidad",
    "16/09/202612:50Miel pura de abeja 1 kgAlmacénPérdidaRotura o derrame− 1 u",
    "15/09/202618:32Almendras peladasFrutos secosRecuentoPor lote · 2 lotesEsperado 12,400 kg · contado 12,150 kg− 0,250 kg",
    "14/09/202610:00Almendras peladasFrutos secosAjusteCorrección de una tanda+ 1,200 kg",
  ]);
  await expect.element(screen.getByText("3 movimientos")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

function shownDates(screen: Awaited<ReturnType<typeof renderScreen>>) {
  return screen
    .getByRole("table", { name: TABLE })
    .getByRole("row")
    .elements()
    .map((row) => /\d\d\/\d\d\/\d{4}/.exec(row.textContent)?.[0])
    .filter((date) => date !== undefined);
}

test("opens on the order the URL names and reports the order the date header asks for", async () => {
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(createServices(), {
    filters: stockMovementsSearch.parse({ sort: "ascending" }),
    onFiltersChange,
  });
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();

  expect(shownDates(screen)).toEqual(["14/09/2026", "15/09/2026", "16/09/2026"]);

  await userEvent.click(screen.getByRole("button", { name: "Fecha" }));

  await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toMatchObject({ sort: "descending" });
  expect(shownDates(screen)).toEqual(["16/09/2026", "15/09/2026", "14/09/2026"]);
});

test("says how each count was counted, by product or by how many lots", async () => {
  const screen = await renderScreen(
    createServices([honeyCount, { ...almondsCount, lotCount: 1 }], []),
  );

  const table = screen.getByRole("table", { name: TABLE });
  await expect.element(table.getByText("Por producto")).toBeVisible();
  await expect.element(table.getByText("Por lote · 1 lote")).toBeVisible();
});

function cellOf(screen: Awaited<ReturnType<typeof renderScreen>>, text: string): HTMLElement {
  return screen.getByText(text, { exact: true }).element() as HTMLElement;
}

test("writes a count's difference in the tone of its sign, and no difference subtle", async () => {
  const screen = await renderScreen(
    createServices(
      [almondsCount, { ...almondOilCount, counted: 7_000, delta: 1_000 }, honeyCount],
      [],
    ),
  );
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();

  expect(cellOf(screen, "− 0,250 kg").className).toContain("text-error-strong");
  expect(cellOf(screen, "− 0,250 kg").className).toContain("font-bold");
  expect(cellOf(screen, "+ 1 u").className).toContain("text-success-strong");
  expect(cellOf(screen, "Sin diferencia").className).toContain("text-text-subtle");
});

test("says a count that found nothing to correct found no difference", async () => {
  const screen = await renderScreen(createServices([{ ...almondOilCount }], []));

  await expect.element(screen.getByText("Sin diferencia")).toBeVisible();
});

test("shows a loss the system recorded for an expired lot as a loss for expiry", async () => {
  const screen = await renderScreen(createServices([], [{ ...honeyLoss, reason: "expired" }]));

  const table = screen.getByRole("table", { name: TABLE });
  await expect.element(table.getByText("Vencimiento")).toBeVisible();
  await expect.element(table.getByText("Pérdida", { exact: true })).toBeVisible();
});

test("marks a count or a movement a later count superseded", async () => {
  const screen = await renderScreen(
    createServices(
      [{ ...almondOilCount, superseded: true, delta: -1000 }],
      [{ ...honeyLoss, superseded: true }],
    ),
  );

  const table = screen.getByRole("table", { name: TABLE });
  await expect.element(table.getByText("Superado por un recuento posterior").first()).toBeVisible();
  expect(table.getByText("Superado por un recuento posterior").elements()).toHaveLength(2);
});

test("shows a product with its brand and net content and finds it by its brand", async () => {
  const screen = await renderScreen(createServices([], [honeyLoss, almondOilLoss]));
  const table = screen.getByRole("table", { name: TABLE });
  await expect.element(table.getByText("Aceite de Almendras Vitora 30 ml")).toBeVisible();

  await userEvent.fill(screen.getByRole("searchbox"), "vitora");

  await expect.element(table.getByText("Miel pura de abeja 1 kg")).not.toBeInTheDocument();
  await expect.element(table.getByText("Aceite de Almendras Vitora 30 ml")).toBeVisible();
});

test("says there is nothing recorded in the period when there is nothing", async () => {
  const screen = await renderScreen(createServices([], []));

  await expect.element(screen.getByText("Sin movimientos en los últimos 30 días")).toBeVisible();
});

test.each([
  ["every kind", EVERYTHING, "Probá con otro nombre, tipo o motivo."],
  ["only counts", COUNTS_ONLY, "Probá con otro nombre."],
  ["only losses", LOSSES_ONLY, "Probá con otro nombre o motivo."],
] as const)(
  "suggests only the filters offered when the search hides everything to a person who may see %s",
  async (_kinds, access, suggestion) => {
    const screen = await renderScreen(createServices(), { access });
    await expect
      .element(screen.getByRole("table", { name: TABLE }).getByRole("row").nth(1))
      .toBeVisible();

    await userEvent.fill(screen.getByRole("searchbox"), "yerba");

    await expect.element(screen.getByText(suggestion)).toBeVisible();
  },
);

test("says nothing matches when the search hides everything", async () => {
  const screen = await renderScreen(createServices());
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();

  await userEvent.fill(screen.getByRole("searchbox"), "yerba");

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
});

test("shows a failed load with a retry that loads both lists again", async () => {
  const services = createServices();
  vi.mocked(services.fetchStockMovements)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: { movements: [honeyLoss] } });
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();
});

test("ends the session when a list finds it over", async () => {
  const services = createServices();
  vi.mocked(services.fetchStockCounts).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("reads the counts and the movements of the period the URL names", async () => {
  const services = createServices();

  await renderScreen(services, {
    filters: stockMovementsSearch.parse({ period: "7" }),
  });

  await expect.poll(() => services.fetchStockCounts).toHaveBeenCalledWith(7);
  expect(services.fetchStockMovements).toHaveBeenCalledWith(7);
});

test("reads no movements from a person who may only count", async () => {
  const services = createServices();

  const screen = await renderScreen(services, { access: COUNTS_ONLY });

  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  expect(services.fetchStockMovements).not.toHaveBeenCalled();
});

test.each([
  ["losses", LOSSES_ONLY],
  ["adjustments", ADJUSTMENTS_ONLY],
])("reads no counts from a person who may only see %s", async (_kind, access) => {
  const services = createServices();

  const screen = await renderScreen(services, { access });

  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  expect(services.fetchStockCounts).not.toHaveBeenCalled();
});

test("shows the movement count with the thousands separator", async () => {
  const movements = Array.from({ length: 1000 }, (_, index) => ({
    ...honeyLoss,
    id: `movement-${index}`,
  }));

  const screen = await renderScreen(createServices([], movements));

  await expect.element(screen.getByText("1.000 movimientos")).toBeVisible();
});
