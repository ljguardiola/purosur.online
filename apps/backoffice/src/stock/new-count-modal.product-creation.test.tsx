import { FIXED_ARGENTINA_ZONE_RULES } from "@purosur/domain";
import { FieldSizeProvider } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { ProductCreationModal } from "../platform/creation-parts";
import { StubProductCreationModal } from "../platform/test-support/creation-parts";
import { render } from "../shell/test-support/render-with-router";
import { countMomentNow } from "./count-moment";
import { NewCountModal } from "./new-count-modal";
import type { StockCountsScreenServices } from "./stock-counts-services";
import { almonds, honey, withoutBalance } from "./test-support/stock-fixtures";

beforeEach(async () => {
  window.history.pushState(null, "", "/");
  await page.viewport(1280, 900);
});

function createServices(): StockCountsScreenServices {
  return {
    fetchStockCounts: vi.fn(),
    fetchStockProducts: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { products: [almonds, honey].map(withoutBalance) },
    }),
    fetchExpectedBalance: vi.fn(),
    registerCount: vi.fn(),
    fetchCurrentZoneRules: vi.fn().mockResolvedValue({
      kind: "ok",
      value: FIXED_ARGENTINA_ZONE_RULES,
    }),
  };
}

async function opened(productCreationModal?: ProductCreationModal) {
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <NewCountModal
        startMoment={countMomentNow(new Date("2026-09-15T21:40:30.000Z"))}
        showsBalance={false}
        {...(productCreationModal ? { productCreationModal } : {})}
        services={createServices()}
        onClose={() => {}}
        onSessionEnded={() => {}}
        onRegistered={() => {}}
      />
    </FieldSizeProvider>,
  );
  const dialog = screen.getByRole("dialog", { name: "Nuevo recuento" });
  await expect.element(dialog.getByRole("combobox", { name: /Producto/ })).toBeVisible();
  return { screen, dialog };
}

test("typing a product that does not exist offers to create it, opening the product form with the typed text", async () => {
  const { screen, dialog } = await opened(StubProductCreationModal);

  await userEvent.fill(dialog.getByRole("combobox", { name: /Producto/ }), "Yerba mate");
  await userEvent.click(page.getByRole("option", { name: "Crear producto «Yerba mate»" }));

  await expect
    .element(
      screen
        .getByRole("dialog", { name: "Nuevo producto" })
        .getByText("Nombre tipeado: Yerba mate"),
    )
    .toBeVisible();
});

test("saving the created product selects it and keeps the count as typed", async () => {
  const { screen, dialog } = await opened(StubProductCreationModal);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad contada/ }), "4");
  await userEvent.fill(dialog.getByRole("combobox", { name: /Producto/ }), "Yerba mate");
  await userEvent.click(page.getByRole("option", { name: "Crear producto «Yerba mate»" }));

  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Nuevo producto" })
      .getByRole("button", { name: "Guardar lo creado" }),
  );

  await expect
    .poll(() => screen.getByRole("dialog", { name: "Nuevo producto" }).query())
    .toBeNull();
  await expect
    .element(dialog.getByRole("combobox", { name: /Producto/ }))
    .toHaveValue("Yerba mate");
  await expect.element(dialog.getByRole("textbox", { name: /^Cantidad contada/ })).toHaveValue("4");
});

test("offers no product creation when the modal is given no way to create one", async () => {
  const { dialog } = await opened();

  await userEvent.fill(dialog.getByRole("combobox", { name: /Producto/ }), "Yerba mate");

  await expect.element(page.getByText("Sin resultados")).toBeVisible();
  expect(page.getByRole("option", { name: /^Crear producto/ }).query()).toBeNull();
});
