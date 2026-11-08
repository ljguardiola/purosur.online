import { FieldSizeProvider } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { StubProductCreationModal } from "../platform/test-support/creation-parts";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { accessWith } from "../shell/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import type { ReviewInitialInventoryModalServices } from "./review-initial-inventory-modal-services";
import { StockRegisterMenu } from "./stock-register-menu";
import { createServices } from "./test-support/stock-balances-screen";
import { almondOil, initialLotAlmonds, tea, withoutBalance } from "./test-support/stock-fixtures";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

const EVERYTHING: BackofficeAccess = {
  ...accessWith(
    "stock_area",
    "stock_balances",
    "stock_counts",
    "stock_movements",
    "stock_losses",
    "stock_adjustments",
    "initial_inventory",
  ),
  stockMovementKinds: ["loss", "adjustment"],
};

const NOW = () => new Date("2026-09-15T21:40:30.000Z");

function createInitialInventoryServices(): ReviewInitialInventoryModalServices {
  return {
    fetchInitialInventoryLots: vi
      .fn()
      .mockResolvedValue({ kind: "ok", value: { lots: [initialLotAlmonds] } }),
    setLotReferenceCost: vi.fn(),
  };
}

function renderMenu({
  access = EVERYTHING,
  services = createServices(),
  initialInventoryOpen = false,
  onInitialInventoryOpenChange = () => {},
  onSessionEnded = () => {},
}: {
  access?: BackofficeAccess;
  services?: ReturnType<typeof createServices>;
  initialInventoryOpen?: boolean;
  onInitialInventoryOpenChange?: (open: boolean) => void;
  onSessionEnded?: () => void;
} = {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <StockRegisterMenu
          access={access}
          productCreationModal={StubProductCreationModal}
          services={services}
          initialInventoryServices={createInitialInventoryServices()}
          initialInventoryOpen={initialInventoryOpen}
          onInitialInventoryOpenChange={onInitialInventoryOpenChange}
          onSessionEnded={onSessionEnded}
          now={NOW}
        />
      </main>
    </FieldSizeProvider>,
  );
}

type Screen = Awaited<ReturnType<typeof renderMenu>>;

async function openRegisterMenu(screen: Screen) {
  await userEvent.click(screen.getByRole("button", { name: "Registrar" }));
}

async function menuItems(screen: Screen) {
  await openRegisterMenu(screen);
  return screen
    .getByRole("menuitem")
    .elements()
    .map((item) => item.textContent);
}

test("offers every way of registering to a person who may use them all", async () => {
  const screen = await renderMenu();

  expect(await menuItems(screen)).toEqual(["Recuento", "Ajuste", "Pérdida", "Inventario inicial"]);
});

test.each([
  [accessWith("stock_area", "stock_counts"), [], ["Recuento"]],
  [accessWith("stock_area", "stock_movements", "stock_losses"), ["loss"], ["Pérdida"]],
  [accessWith("stock_area", "stock_movements", "stock_adjustments"), ["adjustment"], ["Ajuste"]],
  [accessWith("stock_area", "initial_inventory"), [], ["Inventario inicial"]],
] as const)("offers only what %j allows", async (base, kinds, expected) => {
  const screen = await renderMenu({ access: { ...base, stockMovementKinds: [...kinds] } });

  expect(await menuItems(screen)).toEqual(expected);
});

test("shows no button to a person who may register nothing", async () => {
  const screen = await renderMenu({
    access: { ...accessWith("stock_area", "stock_balances"), stockMovementKinds: [] },
  });

  expect(screen.getByRole("button", { name: "Registrar" }).query()).toBeNull();
});

test("starts a new count now, at the moment the menu reads", async () => {
  const services = createServices();
  vi.mocked(services.registerCount).mockResolvedValue({
    kind: "ok",
    value: { expected: 17_000, delta: -1000, balance: 16_000, superseded: false },
  });
  const screen = await renderMenu({ services });
  await openRegisterMenu(screen);
  await userEvent.click(screen.getByRole("menuitem", { name: "Recuento" }));
  const dialog = screen.getByRole("dialog", { name: "Nuevo recuento" });
  expect(dialog.getByRole("textbox", { name: "Hora" }).element()).toHaveProperty("value", "18:40");
  await userEvent.click(dialog.getByRole("button", { name: /Producto/ }));
  await userEvent.click(screen.getByRole("option", { name: "Té verde en hebras 100 g" }));
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
  expect(services.registerCount).toHaveBeenCalledWith({
    productId: tea.id,
    counted: 16_000,
    occurredAt: "2026-09-15T21:40:30.000Z",
  });
});

test.each([
  ["Ajuste", "Cargar ajuste", "Registrar el ajuste"],
  ["Pérdida", "Cargar pérdida", "Registrar la pérdida"],
])("opens the %s modal with only its own kind", async (item, title, submit) => {
  const screen = await renderMenu();
  await openRegisterMenu(screen);

  await userEvent.click(screen.getByRole("menuitem", { name: item }));

  const dialog = screen.getByRole("dialog", { name: title });
  await expect.element(dialog.getByRole("button", { name: submit })).toBeVisible();
});

test("records a loss, closes the modal and shows the balance it left", async () => {
  const services = createServices();
  vi.mocked(services.recordLoss).mockResolvedValue({
    kind: "ok",
    value: { balance: 23_000, superseded: false },
  });
  const screen = await renderMenu({ services });
  await openRegisterMenu(screen);
  await userEvent.click(screen.getByRole("menuitem", { name: "Pérdida" }));
  const dialog = screen.getByRole("dialog", { name: "Cargar pérdida" });
  await userEvent.click(dialog.getByRole("button", { name: /Producto/ }));
  await userEvent.click(screen.getByRole("option", { name: "Miel pura de abeja 1 kg" }));
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad perdida/ }), "1");
  await userEvent.click(screen.getByRole("radio", { name: "Rotura o derrame" }), { force: true });

  await userEvent.click(dialog.getByRole("button", { name: "Registrar la pérdida" }));

  await expect
    .element(
      screen
        .getByRole("status")
        .getByText("Saldo actualizado Miel pura de abeja 1 kg queda en 23 u."),
    )
    .toBeInTheDocument();
  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("ends the session when registering finds it over", async () => {
  const services = createServices();
  vi.mocked(services.registerCount).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderMenu({ services, onSessionEnded });
  await openRegisterMenu(screen);
  await userEvent.click(screen.getByRole("menuitem", { name: "Recuento" }));
  const dialog = screen.getByRole("dialog", { name: "Nuevo recuento" });
  await userEvent.click(dialog.getByRole("button", { name: /Producto/ }));
  await userEvent.click(screen.getByRole("option", { name: "Té verde en hebras 100 g" }));
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad contada/ }), "16");

  await userEvent.click(dialog.getByRole("button", { name: "Registrar el recuento" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("closes the modal without registering anything on Cancelar", async () => {
  const services = createServices();
  const screen = await renderMenu({ services });
  await openRegisterMenu(screen);
  await userEvent.click(screen.getByRole("menuitem", { name: "Recuento" }));

  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Nuevo recuento" })
      .getByRole("button", { name: "Cancelar" }),
  );

  expect(screen.getByRole("dialog").query()).toBeNull();
  expect(services.registerCount).not.toHaveBeenCalled();
});

test("asks to open the initial inventory when its item is chosen", async () => {
  const onInitialInventoryOpenChange = vi.fn();
  const screen = await renderMenu({ onInitialInventoryOpenChange });
  await openRegisterMenu(screen);

  await userEvent.click(screen.getByRole("menuitem", { name: "Inventario inicial" }));

  expect(onInitialInventoryOpenChange).toHaveBeenCalledWith(true);
});

test("shows the initial inventory lots while it is open and asks to close it on Listo", async () => {
  const onInitialInventoryOpenChange = vi.fn();
  const screen = await renderMenu({ initialInventoryOpen: true, onInitialInventoryOpenChange });

  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Listo" }));

  expect(onInitialInventoryOpenChange).toHaveBeenCalledWith(false);
});

test("opens the initial inventory for a person who may only record it", async () => {
  const screen = await renderMenu({
    access: { ...accessWith("stock_area", "initial_inventory"), stockMovementKinds: [] },
    initialInventoryOpen: true,
  });

  await expect.element(screen.getByRole("dialog", { name: "Inventario inicial" })).toBeVisible();
});

test.each([
  [
    "a session that manages products and categories",
    {
      ...accessWith("stock_area", "stock_movements", "stock_losses", "products_and_categories"),
      stockMovementKinds: ["loss"] as const,
    },
    true,
  ],
  [
    "a session that only loads losses",
    {
      ...accessWith("stock_area", "stock_movements", "stock_losses"),
      stockMovementKinds: ["loss"] as const,
    },
    false,
  ],
])(
  "offers creating a product from the loss's product selector to %s only if allowed",
  async (_name, access, offered) => {
    const screen = await renderMenu({ access: { ...access, stockMovementKinds: ["loss"] } });
    await openRegisterMenu(screen);
    await userEvent.click(screen.getByRole("menuitem", { name: "Pérdida" }));
    const dialog = screen.getByRole("dialog", { name: "Cargar pérdida" });

    await userEvent.fill(dialog.getByRole("combobox", { name: /Producto/ }), "Yerba mate");

    const entry = screen.getByRole("option", { name: "Crear producto «Yerba mate»" });
    await expect.element(offered ? entry : screen.getByText("Sin resultados")).toBeVisible();
    expect(entry.query() !== null).toBe(offered);
  },
);

test("names the product of a loss by its brand and net content in the notice", async () => {
  const services = createServices();
  vi.mocked(services.fetchStockProducts).mockResolvedValue({
    kind: "ok",
    value: { products: [almondOil].map(withoutBalance) },
  });
  vi.mocked(services.recordLoss).mockResolvedValue({
    kind: "ok",
    value: { balance: 5_000, superseded: false },
  });
  const screen = await renderMenu({ services });
  await openRegisterMenu(screen);
  await userEvent.click(screen.getByRole("menuitem", { name: "Pérdida" }));
  const dialog = screen.getByRole("dialog", { name: "Cargar pérdida" });
  await userEvent.click(dialog.getByRole("button", { name: /Producto/ }));
  await userEvent.click(screen.getByRole("option", { name: "Aceite de Almendras Vitora 30 ml" }));
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad perdida/ }), "1");
  await userEvent.click(screen.getByRole("radio", { name: "Rotura o derrame" }), { force: true });

  await userEvent.click(dialog.getByRole("button", { name: "Registrar la pérdida" }));

  await expect
    .element(
      screen
        .getByRole("status")
        .getByText("Saldo actualizado Aceite de Almendras Vitora 30 ml queda en 5 u."),
    )
    .toBeInTheDocument();
});
