import { FieldSizeProvider } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { countMomentNow } from "./count-moment";
import { NewCountModal } from "./new-count-modal";
import type { StockCountsScreenServices } from "./stock-counts-services";
import { almonds, honey, oats, withoutBalance } from "./test-support/stock-fixtures";

beforeEach(async () => {
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
  };
}

async function renderModal(services: StockCountsScreenServices) {
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <NewCountModal
        startMoment={countMomentNow(new Date("2026-09-15T21:40:30.000Z"))}
        showsBalance
        services={services}
        onClose={() => {}}
        onSessionEnded={() => {}}
        onRegistered={() => {}}
      />
    </FieldSizeProvider>,
  );
  const dialog = screen.getByRole("dialog", { name: "Nuevo recuento" });
  await expect.element(dialog.getByRole("button", { name: /Producto/ })).toBeVisible();
  return { screen, dialog };
}

test("offers a deactivated product in the selector marked as deactivated", async () => {
  const services = createServices();
  vi.mocked(services.fetchStockProducts).mockResolvedValue({
    kind: "ok",
    value: { products: [almonds, oats, honey].map(withoutBalance) },
  });
  const { screen, dialog } = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: /Producto/ }));

  await expect
    .element(screen.getByRole("option", { name: /Avena arrollada/ }).getByText("Desactivado"))
    .toBeVisible();
});
