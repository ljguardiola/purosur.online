import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { BackofficeAccess } from "../access/backoffice-access";
import { accessWith } from "../access/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import { type StockMovementsFilters, stockMovementsFilters } from "./routes";
import { StockMovementsScreen } from "./stock-movements-screen";
import type { StockMovementsScreenServices } from "./stock-movements-services";
import {
  almonds,
  almondsAdjustment,
  crackers,
  honey,
  honeyLoss,
  withoutBalance,
} from "./test-support/stock-fixtures";

const BOTH = accessWith(
  "stock_losses",
  "stock_adjustments",
  "stock_balances",
  "stock_movements",
  "stock_area",
);

function createServices(movements = [honeyLoss, almondsAdjustment]): StockMovementsScreenServices {
  return {
    fetchStockMovements: vi.fn().mockResolvedValue({ kind: "ok", value: { movements } }),
    fetchStockProducts: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { products: [almonds, crackers, honey].map(withoutBalance) },
    }),
    fetchStockBalances: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { products: [almonds, crackers, honey] },
    }),
    recordLoss: vi.fn(),
    recordAdjustment: vi.fn(),
  };
}

function renderScreen(
  services: StockMovementsScreenServices,
  {
    access = BOTH,
    filters = stockMovementsFilters.parse({}),
    onFiltersChange = () => {},
    onSessionEnded = () => {},
  }: {
    access?: BackofficeAccess;
    filters?: StockMovementsFilters;
    onFiltersChange?: (filters: StockMovementsFilters) => void;
    onSessionEnded?: () => void;
  } = {},
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <StockMovementsScreen
          access={access}
          services={services}
          filters={filters}
          onFiltersChange={onFiltersChange}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>,
  );
}

type Screen = Awaited<ReturnType<typeof renderScreen>>;

test("shows each loss and adjustment with its moment, product, kind, reason and quantity", async () => {
  const screen = await renderScreen(createServices());

  await expect
    .element(screen.getByRole("heading", { name: "Ajustes y pérdidas", level: 1 }))
    .toBeVisible();
  const table = screen.getByRole("table", { name: "Ajustes y pérdidas" });
  await expect.element(table.getByText("16/09/2026")).toBeVisible();
  await expect.element(table.getByText("12:50")).toBeVisible();
  await expect.element(table.getByText("Miel pura de abeja 1 kg")).toBeVisible();
  await expect.element(table.getByText("Pérdida", { exact: true })).toBeVisible();
  await expect.element(table.getByText("Rotura o derrame")).toBeVisible();
  await expect.element(table.getByText("− 1 u")).toBeVisible();
  await expect.element(table.getByText("Ajuste", { exact: true })).toBeVisible();
  await expect.element(table.getByText("Corrección de una tanda")).toBeVisible();
  await expect.element(table.getByText("+ 1,200 kg")).toBeVisible();
  await expect.element(screen.getByText("2 movimientos")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("filters by the reason the URL names and reads the period it names", async () => {
  const services = createServices();
  const screen = await renderScreen(services, {
    filters: stockMovementsFilters.parse({ reason: "batch_correction", period: "7" }),
  });

  const table = screen.getByRole("table", { name: "Ajustes y pérdidas" });
  await expect.element(table.getByText("Almendras peladas")).toBeVisible();
  expect(table.getByText("Miel pura de abeja 1 kg").query()).toBeNull();
  expect(services.fetchStockMovements).toHaveBeenCalledWith(7);
});

test("offers only the reasons of the kinds the user may register", async () => {
  const screen = await renderScreen(createServices([honeyLoss]), {
    access: accessWith("stock_losses", "stock_movements", "stock_area"),
  });
  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Motivo:/ }));

  const options = screen
    .getByRole("option")
    .elements()
    .map((option) => option.textContent);
  expect(options).toEqual([
    "Todos",
    "Rotura o derrame",
    "Mal estado",
    "Merma de fraccionamiento",
    "Degustación o muestra",
    "Consumo del local",
    "Robo",
  ]);
});

test("says there are no losses nor adjustments in the period when there are none", async () => {
  const screen = await renderScreen(createServices([]));

  await expect
    .element(screen.getByText("Sin pérdidas ni ajustes en los últimos 30 días"))
    .toBeVisible();
  expect(screen.getByText("Las bajas por vencimiento también aparecen acá.").query()).toBeNull();
});

test("marks a movement a later count superseded", async () => {
  const screen = await renderScreen(
    createServices([honeyLoss, { ...almondsAdjustment, superseded: true }]),
  );

  const table = screen.getByRole("table", { name: "Ajustes y pérdidas" });
  await expect.element(table.getByText("Superado por un recuento posterior")).toBeVisible();
  expect(table.getByText("Superado por un recuento posterior").elements()).toHaveLength(1);
});

test("says when a later count leaves the balance as it was", async () => {
  const services = createServices();
  vi.mocked(services.recordLoss).mockResolvedValue({
    kind: "ok",
    value: { balance: 24_000, superseded: true },
  });
  const screen = await renderScreen(services);
  const dialog = await openModal(screen);
  await chooseProduct(screen, "Miel pura de abeja 1 kg");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad perdida/ }), "1");
  await userEvent.click(cardLabel(screen, "Robo"));

  await userEvent.click(dialog.getByRole("button", { name: "Registrar la pérdida" }));

  await expect
    .element(
      screen
        .getByRole("status")
        .getByText(
          "El movimiento no cambió el saldo Hay un recuento posterior de Miel pura de abeja 1 kg: el saldo sigue en 24 u.",
        ),
    )
    .toBeInTheDocument();
});

test("registers a loss for a user who may not view balances, showing no balance", async () => {
  const services = createServices();
  vi.mocked(services.recordLoss).mockResolvedValue({
    kind: "ok",
    value: { balance: 23_000, superseded: false },
  });
  const screen = await renderScreen(services, {
    access: accessWith("stock_losses", "stock_movements", "stock_area"),
  });
  const dialog = await openModal(screen, "Cargar pérdida");
  await chooseProduct(screen, "Miel pura de abeja 1 kg");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad perdida/ }), "1");
  await userEvent.click(cardLabel(screen, "Robo"));

  expect(dialog.getByText("Saldo actual").query()).toBeNull();
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la pérdida" }));

  await expect
    .element(
      screen.getByRole("status").getByText("Saldo actualizado Miel pura de abeja 1 kg: − 1 u."),
    )
    .toBeInTheDocument();
  expect(services.recordLoss).toHaveBeenCalledWith({
    productId: honey.id,
    reason: "theft",
    quantity: 1000,
  });
  expect(services.fetchStockBalances).not.toHaveBeenCalled();
});

test("shows a failed load with a retry that loads the movements again", async () => {
  const services = createServices();
  vi.mocked(services.fetchStockMovements)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: { movements: [honeyLoss] } });
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Miel pura de abeja 1 kg")).toBeVisible();
});

function cardLabel(screen: Screen, name: string): HTMLElement {
  const label = screen.getByRole("radio", { name }).element().closest("label");
  if (!label) {
    throw new Error(`no label for the card ${name}`);
  }
  return label;
}

async function openModal(screen: Screen, button = "Cargar pérdida o ajuste") {
  await userEvent.click(screen.getByRole("button", { name: button }));
  const dialog = screen.getByRole("dialog", { name: button });
  await expect.element(dialog.getByRole("button", { name: /Producto/ })).toBeVisible();
  return dialog;
}

async function chooseProduct(screen: Screen, name: string) {
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: /Producto/ }));
  await userEvent.click(screen.getByRole("option", { name }));
}

test("registers a loss with its reason and shows the balance it left", async () => {
  const services = createServices();
  vi.mocked(services.recordLoss).mockResolvedValue({
    kind: "ok",
    value: { balance: 23_000, superseded: false },
  });
  const screen = await renderScreen(services);
  const dialog = await openModal(screen);

  await userEvent.click(cardLabel(screen, "Pérdida"));
  await chooseProduct(screen, "Miel pura de abeja 1 kg");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad perdida/ }), "1");
  await userEvent.click(cardLabel(screen, "Rotura o derrame"));

  await expect.element(dialog.getByText("Saldo actual")).toBeVisible();
  await expect.element(dialog.getByText("24 u")).toBeVisible();
  await expect.element(dialog.getByText("− 1 u")).toBeVisible();
  await expect.element(dialog.getByText("23 u")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);

  await userEvent.click(dialog.getByRole("button", { name: "Registrar la pérdida" }));

  await expect
    .element(
      screen
        .getByRole("status")
        .getByText("Saldo actualizado Miel pura de abeja 1 kg queda en 23 u."),
    )
    .toBeInTheDocument();
  expect(services.recordLoss).toHaveBeenCalledWith({
    productId: honey.id,
    reason: "broken_or_spilled",
    quantity: 1000,
  });
  expect(screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchStockMovements).mock.calls.length).toBe(2);
});

test("registers an adjustment in the direction chosen", async () => {
  const services = createServices();
  vi.mocked(services.recordAdjustment).mockResolvedValue({
    kind: "ok",
    value: { balance: 12_150, superseded: false },
  });
  const screen = await renderScreen(services);
  const dialog = await openModal(screen);

  await userEvent.click(cardLabel(screen, "Ajuste"));
  await chooseProduct(screen, "Almendras peladas");
  await userEvent.click(cardLabel(screen, "Error en una compra"));
  await userEvent.click(cardLabel(screen, "Resta"));
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad/ }), "0,250");

  await expect.element(dialog.getByText("− 0,250 kg")).toBeVisible();
  await expect
    .element(
      dialog
        .getByText(
          "Si lo que hay en el local no coincide con el sistema, se corrige con un recuento.",
        )
        .first(),
    )
    .toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Registrar el ajuste" }));

  await expect.poll(() => vi.mocked(services.recordAdjustment).mock.calls.length).toBe(1);
  expect(services.recordAdjustment).toHaveBeenCalledWith({
    productId: almonds.id,
    reason: "purchase_correction",
    direction: "subtract",
    quantity: 250,
  });
});

test("offers no direction for stock returned to a supplier, which always subtracts", async () => {
  const services = createServices();
  vi.mocked(services.recordAdjustment).mockResolvedValue({
    kind: "ok",
    value: { balance: 20_000, superseded: false },
  });
  const screen = await renderScreen(services);
  const dialog = await openModal(screen);
  await userEvent.click(cardLabel(screen, "Ajuste"));
  await expect.element(dialog.getByRole("radiogroup", { name: "Sentido" })).toBeVisible();

  await userEvent.click(cardLabel(screen, "Devolución al proveedor"));

  expect(dialog.getByRole("radiogroup", { name: "Sentido" }).query()).toBeNull();
  await chooseProduct(screen, "Miel pura de abeja 1 kg");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad/ }), "4");
  await userEvent.click(dialog.getByRole("button", { name: "Registrar el ajuste" }));

  await expect
    .poll(() => vi.mocked(services.recordAdjustment).mock.calls[0]?.[0])
    .toEqual({
      productId: honey.id,
      reason: "supplier_return",
      direction: "subtract",
      quantity: 4000,
    });
});

test.each([
  [
    accessWith("stock_losses", "stock_movements", "stock_area"),
    "Cargar pérdida",
    "Registrar la pérdida",
  ],
  [
    accessWith("stock_adjustments", "stock_movements", "stock_area"),
    "Cargar ajuste",
    "Registrar el ajuste",
  ],
])("offers a user holding only %j only what it allows", async (access, button, submit) => {
  const screen = await renderScreen(createServices(), {
    access,
  });
  const dialog = await openModal(screen, button);

  expect(dialog.getByRole("radiogroup", { name: "Qué se carga" }).query()).toBeNull();
  await expect.element(dialog.getByRole("button", { name: submit })).toBeVisible();
});

test("asks for the product, the quantity and the reason before registering anything", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  const dialog = await openModal(screen);
  await userEvent.click(cardLabel(screen, "Pérdida"));

  await userEvent.click(dialog.getByRole("button", { name: "Registrar la pérdida" }));

  await expect.element(dialog.getByText("Elegí el producto.")).toBeVisible();
  await expect.element(dialog.getByText("Ingresá la cantidad.")).toBeVisible();
  await expect.element(dialog.getByText("Elegí el motivo.")).toBeVisible();
  expect(services.recordLoss).not.toHaveBeenCalled();
});

test.each([
  [
    { kind: "validation_failed", field: "quantity" },
    "Escribí una cantidad entera de unidades, por ejemplo 16.",
  ],
  [{ kind: "failed" }, "No se pudo guardar el movimiento"],
  [{ kind: "rate_limited", retryAfterSeconds: 30 }, "Demasiadas solicitudes"],
  [{ kind: "not_found" }, "Producto desactivado"],
] as const)("keeps the modal open and explains the refusal %j", async (outcome, message) => {
  const services = createServices();
  vi.mocked(services.recordLoss).mockResolvedValue(outcome);
  const screen = await renderScreen(services);
  const dialog = await openModal(screen);
  await userEvent.click(cardLabel(screen, "Pérdida"));
  await chooseProduct(screen, "Miel pura de abeja 1 kg");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad perdida/ }), "1");
  await userEvent.click(cardLabel(screen, "Robo"));

  await userEvent.click(dialog.getByRole("button", { name: "Registrar la pérdida" }));

  await expect.element(dialog.getByText(message)).toBeVisible();
});

test.each([
  ["count", accessWith("stock_losses", "stock_movements", "stock_area", "stock_adjustments")],
  ["theft", accessWith("stock_adjustments", "stock_movements", "stock_area")],
])("falls back to every reason for the reason %s it does not offer", async (reason, access) => {
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(createServices(), {
    access,
    filters: stockMovementsFilters.parse({ reason }),
    onFiltersChange,
  });

  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toMatchObject({ reason: "ALL" });
});
