import { FieldSizeProvider } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { ProductCreationModal } from "../platform/creation-parts";
import { StubProductCreationModal } from "../platform/test-support/creation-parts";
import { render } from "../shell/test-support/render-with-router";
import type { MovementKind } from "./stock-movement-form";
import { StockMovementModal } from "./stock-movement-modal";
import type { StockMovementsScreenServices } from "./stock-movements-services";
import {
  almonds,
  honey,
  movementReasons,
  stockBalanceList,
  withoutBalance,
} from "./test-support/stock-fixtures";

beforeEach(async () => {
  window.history.pushState(null, "", "/");
  await page.viewport(1280, 900);
});

function createServices(products = [almonds, honey]): StockMovementsScreenServices {
  return {
    fetchStockMovements: vi.fn(),
    fetchStockMovementReasons: vi.fn().mockResolvedValue({ kind: "ok", value: movementReasons }),
    fetchStockProducts: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { products: products.map(withoutBalance) },
    }),
    fetchStockBalances: vi.fn().mockResolvedValue({
      kind: "ok",
      value: stockBalanceList(products),
    }),
    recordLoss: vi.fn(),
    recordAdjustment: vi.fn(),
  };
}

const TITLE = "Cargar pérdida o ajuste";

async function opened(
  kind: MovementKind,
  productCreationModal?: ProductCreationModal,
  products = [almonds, honey],
) {
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <StockMovementModal
        title={TITLE}
        kinds={[kind]}
        showsBalance={false}
        {...(productCreationModal ? { productCreationModal } : {})}
        services={createServices(products)}
        onClose={() => {}}
        onSessionEnded={() => {}}
        onRegistered={() => {}}
      />
    </FieldSizeProvider>,
  );
  const dialog = screen.getByRole("dialog", { name: TITLE });
  await expect
    .element(
      products.length > 0 || productCreationModal
        ? dialog.getByRole("combobox", { name: /Producto/ })
        : dialog.getByText("No hay productos activos"),
    )
    .toBeVisible();
  return { screen, dialog };
}

test.each([
  ["loss", "Cantidad perdida"],
  ["adjustment", "Cantidad"],
] as const)(
  "typing a product that does not exist in the %s form offers to create it and selects it once saved",
  async (kind, quantityLabel) => {
    const { screen, dialog } = await opened(kind, StubProductCreationModal);
    await userEvent.fill(
      dialog.getByRole("textbox", { name: new RegExp(`^${quantityLabel}`) }),
      "3",
    );
    await userEvent.fill(dialog.getByRole("combobox", { name: /Producto/ }), "Yerba mate");

    await userEvent.click(page.getByRole("option", { name: "Crear producto «Yerba mate»" }));
    const creation = screen.getByRole("dialog", { name: "Nuevo producto" });
    await expect.element(creation.getByText("Nombre tipeado: Yerba mate")).toBeVisible();
    await userEvent.click(creation.getByRole("button", { name: "Guardar lo creado" }));

    await expect
      .poll(() => screen.getByRole("dialog", { name: "Nuevo producto" }).query())
      .toBeNull();
    await expect
      .element(dialog.getByRole("combobox", { name: /Producto/ }))
      .toHaveValue("Yerba mate");
    await expect
      .element(dialog.getByRole("textbox", { name: new RegExp(`^${quantityLabel}`) }))
      .toHaveValue("3");
  },
);

test.each(["loss", "adjustment"] as const)(
  "offers no product creation in the %s form when the modal is given no way to create one",
  async (kind) => {
    const { dialog } = await opened(kind);

    await userEvent.fill(dialog.getByRole("combobox", { name: /Producto/ }), "Yerba mate");

    await expect.element(page.getByText("Sin resultados")).toBeVisible();
    expect(page.getByRole("option", { name: /^Crear producto/ }).query()).toBeNull();
  },
);

test.each(["loss", "adjustment"] as const)(
  "with no products at all, the %s form still offers creating the first one and selects it once saved",
  async (kind) => {
    const { screen, dialog } = await opened(kind, StubProductCreationModal, []);

    await userEvent.fill(dialog.getByRole("combobox", { name: /Producto/ }), "Yerba mate");
    await userEvent.click(page.getByRole("option", { name: "Crear producto «Yerba mate»" }));
    await userEvent.click(
      screen
        .getByRole("dialog", { name: "Nuevo producto" })
        .getByRole("button", { name: "Guardar lo creado" }),
    );

    await expect
      .element(dialog.getByRole("combobox", { name: /Producto/ }))
      .toHaveValue("Yerba mate");
  },
);

test("with no products at all and no way to create one, shows the empty state", async () => {
  const { dialog } = await opened("loss", undefined, []);

  await expect.element(dialog.getByText("No hay productos activos")).toBeVisible();
});
