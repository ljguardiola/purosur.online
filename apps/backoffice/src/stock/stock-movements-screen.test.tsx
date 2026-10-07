import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { accessWith } from "../shell/test-support/backoffice-access";
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
  movementReasons,
  withoutBalance,
} from "./test-support/stock-fixtures";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

const BOTH: BackofficeAccess = {
  ...accessWith(
    "stock_losses",
    "stock_adjustments",
    "stock_balances",
    "stock_movements",
    "stock_area",
  ),
  stockMovementKinds: ["loss", "adjustment"],
};

const LOSSES_ONLY: BackofficeAccess = {
  ...accessWith("stock_losses", "stock_movements", "stock_area"),
  stockMovementKinds: ["loss"],
};

const ADJUSTMENTS_ONLY: BackofficeAccess = {
  ...accessWith("stock_adjustments", "stock_movements", "stock_area"),
  stockMovementKinds: ["adjustment"],
};

function createServices(movements = [honeyLoss, almondsAdjustment]): StockMovementsScreenServices {
  return {
    fetchStockMovements: vi.fn().mockResolvedValue({ kind: "ok", value: { movements } }),
    fetchStockMovementReasons: vi.fn().mockResolvedValue({ kind: "ok", value: movementReasons }),
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
    access: LOSSES_ONLY,
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
    access: LOSSES_ONLY,
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

test("closes the modal, refreshes the movements and shows the balance a loss left", async () => {
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
  await userEvent.click(dialog.getByRole("button", { name: "Registrar la pérdida" }));

  await expect
    .element(
      screen
        .getByRole("status")
        .getByText("Saldo actualizado Miel pura de abeja 1 kg queda en 23 u."),
    )
    .toBeInTheDocument();
  expect(screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchStockMovements).mock.calls.length).toBe(2);
});

test.each([
  [LOSSES_ONLY, "Cargar pérdida", "Registrar la pérdida"],
  [ADJUSTMENTS_ONLY, "Cargar ajuste", "Registrar el ajuste"],
])("offers a user holding only %j only what it allows", async (access, button, submit) => {
  const screen = await renderScreen(createServices(), {
    access,
  });
  const dialog = await openModal(screen, button);

  await expect.element(dialog.getByRole("button", { name: submit })).toBeVisible();
});

test("closes the modal without registering anything on Cancelar", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  const dialog = await openModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(screen.getByRole("dialog").query()).toBeNull();
  expect(services.recordLoss).not.toHaveBeenCalled();
});

test("ends the session when registering finds it over", async () => {
  const services = createServices();
  vi.mocked(services.recordLoss).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, { onSessionEnded });
  const dialog = await openModal(screen);
  await userEvent.click(cardLabel(screen, "Pérdida"));
  await chooseProduct(screen, "Miel pura de abeja 1 kg");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad perdida/ }), "1");
  await userEvent.click(cardLabel(screen, "Robo"));

  await userEvent.click(dialog.getByRole("button", { name: "Registrar la pérdida" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test.each([
  ["count", BOTH],
  ["theft", ADJUSTMENTS_ONLY],
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

test("offers the kinds the cloud says the user may record, whatever the capabilities say", async () => {
  const screen = await renderScreen(createServices(), {
    access: { ...BOTH, stockMovementKinds: ["adjustment"] },
  });

  await expect.element(screen.getByRole("button", { name: "Cargar ajuste" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Cargar pérdida" }).query()).toBeNull();
});
