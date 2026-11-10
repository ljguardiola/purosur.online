import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { accessWith } from "../shell/test-support/backoffice-access";
import { createServices, renderScreen, rice } from "./test-support/prices-list-screen";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

function pricesWindowOf(days: number) {
  return {
    kind: "ok" as const,
    value: {
      products: [rice],
      pendingCount: 1,
      activeProductCount: 3,
      reviewWindowDays: days,
      categories: [],
    },
  };
}

test("shows the days before a price counts as unreviewed, with Cambiar for who can change the branch", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue(pricesWindowOf(30));

  const screen = await renderScreen(services, () => {}, { access: accessWith("branch_area") });

  await expect.element(screen.getByText("Precio sin revisar: 30 días")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Cambiar", exact: true })).toBeVisible();
});

test("shows the days without Cambiar to who cannot change the branch", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue(pricesWindowOf(30));

  const screen = await renderScreen(services, () => {}, { access: accessWith("prices_area") });

  await expect.element(screen.getByText("Precio sin revisar: 30 días")).toBeVisible();
  expect(screen.getByRole("button", { name: "Cambiar", exact: true }).query()).toBeNull();
});

test("keeps Cambiar while the prices load, without the term", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services, () => {}, { access: accessWith("branch_area") });

  await expect.element(screen.getByRole("table")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Cambiar", exact: true })).toBeEnabled();
  expect(screen.getByText(/Precio sin revisar/).query()).toBeNull();
});

test("keeps Cambiar when the prices cannot be read, with the list's own failure", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({ kind: "failed" });

  const screen = await renderScreen(services, () => {}, { access: accessWith("branch_area") });

  await expect.element(screen.getByText("No pudimos abrir los precios")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Cambiar", exact: true })).toBeEnabled();
  expect(screen.getByText(/Precio sin revisar/).query()).toBeNull();
});

test("shows the new days, answered by the cloud, once they are saved", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices)
    .mockResolvedValueOnce(pricesWindowOf(30))
    .mockResolvedValue(pricesWindowOf(60));
  const screen = await renderScreen(services, () => {}, { access: accessWith("branch_area") });
  await userEvent.click(screen.getByRole("button", { name: "Cambiar", exact: true }));
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("textbox", { name: "Precio sin revisar" }))
    .toHaveValue("45");

  await userEvent.fill(dialog.getByRole("textbox", { name: "Precio sin revisar" }), "60");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar" }));

  await expect.element(screen.getByText("Precio sin revisar: 60 días")).toBeVisible();
  expect(services.branchTerm.saveBranchSettings).toHaveBeenCalledWith(
    expect.objectContaining({ unreviewed_price_alert_days: 60 }),
  );
});
