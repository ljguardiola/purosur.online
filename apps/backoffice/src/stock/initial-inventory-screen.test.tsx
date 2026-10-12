import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { InitialInventoryScreen } from "./initial-inventory-screen";
import type { InitialInventoryScreenServices } from "./initial-inventory-services";
import { type InitialInventoryFilters, initialInventoryFilters } from "./routes";
import {
  initialLotAlmonds,
  initialLotHoney,
  initialLotTeaWithoutCost,
} from "./test-support/stock-fixtures";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

function createServices(
  lots = [initialLotAlmonds, initialLotHoney, initialLotTeaWithoutCost],
): InitialInventoryScreenServices {
  return {
    fetchInitialInventoryLots: vi.fn().mockResolvedValue({ kind: "ok", value: { lots } }),
    setLotReferenceCost: vi.fn(),
  };
}

function renderScreen(
  services: InitialInventoryScreenServices,
  {
    filters = initialInventoryFilters.parse({}),
    onFiltersChange = () => {},
    onSessionEnded = () => {},
  }: {
    filters?: InitialInventoryFilters;
    onFiltersChange?: (filters: InitialInventoryFilters) => void;
    onSessionEnded?: () => void;
  } = {},
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <InitialInventoryScreen
          filters={filters}
          onFiltersChange={onFiltersChange}
          onSessionEnded={onSessionEnded}
          services={services}
        />
      </main>
    </FieldSizeProvider>,
  );
}

const TABLE = "Inventario inicial";

test("shows each lot with its product, expiry, counted quantity, reference cost and value", async () => {
  const screen = await renderScreen(createServices());

  await expect
    .element(screen.getByRole("heading", { name: "Inventario inicial", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  const rows = screen.getByRole("table", { name: TABLE }).getByRole("row").elements();
  expect(rows.map((row) => row.textContent)).toEqual([
    "ProductoVenceContadoCosto de referenciaValorizadoAcciones",
    "Almendras peladasFrutos secos01/12/20264,400 kg$ 10.180,00 / kg$ 44.792,00",
    "Miel pura de abeja 1 kgAlmacén—24 u$ 5.440,00$ 130.560,00",
    "Té verde en hebras 100 gAlmacén15/03/202712 uSin costo—",
  ]);
  await expectNoAccessibilityViolations(screen.container);
});

test("writes a lot with no cost in the tone of an error", async () => {
  const screen = await renderScreen(createServices());
  const table = screen.getByRole("table", { name: TABLE });
  await expect.element(table.getByText("Sin costo", { exact: true })).toBeVisible();

  const cell = table.getByText("Sin costo", { exact: true }).element() as HTMLElement;
  expect(cell.className).toContain("text-error-strong");
});

test("counts the lots and those with no cost under the table", async () => {
  const screen = await renderScreen(createServices());

  await expect
    .element(screen.getByText("3 lotes de la puesta en marcha · 1 sin costo"))
    .toBeVisible();
});

test.each([
  [[initialLotAlmonds], "1 lote de la puesta en marcha"],
  [[initialLotAlmonds, initialLotHoney], "2 lotes de la puesta en marcha"],
])("counts only the lots when all have a cost: %#", async (lots, text) => {
  const screen = await renderScreen(createServices(lots));

  await expect.element(screen.getByText(text, { exact: true })).toBeVisible();
});

test("says the shop was not counted yet when there are no lots", async () => {
  const screen = await renderScreen(createServices([]));

  await expect.element(screen.getByText("Todavía no se contó el local")).toBeVisible();
  await expect
    .element(screen.getByText("Los lotes aparecen cuando la caja carga el inventario inicial."))
    .toBeVisible();
});

test("says nothing matches when no lot matches the search", async () => {
  const screen = await renderScreen(createServices([]), {
    filters: initialInventoryFilters.parse({ search: "yerba" }),
  });

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
});

test("says nothing matches when the cost filter leaves no lots", async () => {
  const screen = await renderScreen(createServices([]), {
    filters: initialInventoryFilters.parse({ cost: "incomplete" }),
  });

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
});

test("asks the cloud for the lots of the product the URL names", async () => {
  const services = createServices([initialLotHoney]);
  const screen = await renderScreen(services, {
    filters: initialInventoryFilters.parse({ search: "miel" }),
  });

  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  expect(services.fetchInitialInventoryLots).toHaveBeenCalledWith({ product: "miel" });
});

test("reports the typed search and asks the cloud for its product", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, { onFiltersChange });

  await userEvent.fill(screen.getByRole("searchbox", { name: "Buscar un producto" }), "té");

  await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toMatchObject({ search: "té" });
  await expect
    .poll(() => vi.mocked(services.fetchInitialInventoryLots).mock.lastCall)
    .toEqual([{ product: "té" }]);
});

test("shows the lots the cloud answers for the search", async () => {
  const screen = await renderScreen(createServices([initialLotAlmonds]), {
    filters: initialInventoryFilters.parse({ search: "frutos" }),
  });

  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
});

test("asks the cloud for the lots of the cost the URL names and reports a new one", async () => {
  const services = createServices([initialLotTeaWithoutCost]);
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, {
    filters: initialInventoryFilters.parse({ cost: "incomplete" }),
    onFiltersChange,
  });
  await expect.element(screen.getByText("Té verde en hebras 100 g")).toBeVisible();
  expect(services.fetchInitialInventoryLots).toHaveBeenCalledWith({ cost: "incomplete" });

  await expect.element(screen.getByRole("button", { name: "Lotes: Sin costo" })).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: /Lotes:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Con costo" }));

  await expect
    .poll(() => vi.mocked(services.fetchInitialInventoryLots).mock.lastCall)
    .toEqual([{ cost: "known" }]);
  await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toMatchObject({ cost: "known" });
});

test("asks the cloud for every lot when no filter is chosen", async () => {
  const services = createServices();
  await renderScreen(services);

  await expect
    .poll(() => vi.mocked(services.fetchInitialInventoryLots).mock.lastCall)
    .toEqual([{}]);
});

test("shows a failed load with a retry that loads the lots again", async () => {
  const services = createServices();
  vi.mocked(services.fetchInitialInventoryLots)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: { lots: [initialLotAlmonds] } });
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
});

test("ends the session when the list finds it over", async () => {
  const services = createServices();
  vi.mocked(services.fetchInitialInventoryLots).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  await renderScreen(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

async function openEdit(screen: Awaited<ReturnType<typeof renderScreen>>, product: string) {
  await userEvent.click(screen.getByRole("button", { name: `Editar el costo de ${product}` }));
  const dialog = screen.getByRole("dialog", { name: product });
  await expect.element(dialog).toBeVisible();
  return dialog;
}

test("opens the cost of the lot whose pencil was pressed", async () => {
  const screen = await renderScreen(createServices());
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();

  const dialog = await openEdit(screen, "Miel pura de abeja 1 kg");

  await expect.element(dialog.getByLabelText("Costo de referencia por unidad")).toBeVisible();
});

test("closes the modal, reads the lots again and says the cost was saved", async () => {
  const services = createServices();
  vi.mocked(services.setLotReferenceCost).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  const dialog = await openEdit(screen, "Té verde en hebras 100 g");

  await userEvent.fill(dialog.getByLabelText("Costo de referencia por unidad"), "1.250");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el costo" }));

  await expect
    .element(screen.getByRole("status").getByText("Costo guardado Té verde en hebras 100 g."))
    .toBeInTheDocument();
  expect(screen.getByRole("dialog").query()).toBeNull();
  expect(services.setLotReferenceCost).toHaveBeenCalledWith(initialLotTeaWithoutCost.lotId, {
    unitCostCents: 125_000,
  });
  await expect.poll(() => vi.mocked(services.fetchInitialInventoryLots).mock.calls.length).toBe(2);
});

test("reads the lots again when the lot being edited no longer exists", async () => {
  const services = createServices();
  vi.mocked(services.setLotReferenceCost).mockResolvedValue({ kind: "lot_withdrawn" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  const dialog = await openEdit(screen, "Almendras peladas");

  await userEvent.fill(dialog.getByLabelText("Costo de referencia por kg"), "100");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar el costo" }));

  await expect.element(dialog.getByText("Este lote ya no existe").first()).toBeVisible();
  await expect.poll(() => vi.mocked(services.fetchInitialInventoryLots).mock.calls.length).toBe(2);
});
