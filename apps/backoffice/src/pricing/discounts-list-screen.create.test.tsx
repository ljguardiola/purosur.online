import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { fillValidNewDiscount } from "./test-support/discount-modal";
import { almacenTuesdays, discountList, yerbaOff } from "./test-support/discounts";
import {
  createServices,
  deferred,
  loaded,
  renderScreen,
  rowCells,
} from "./test-support/discounts-list-screen";

test("the create action opens the new promotion modal, and the created promotion is listed with a notice", async () => {
  await page.viewport(1280, 1100);
  const services = createServices();
  vi.mocked(services.fetchDiscounts)
    .mockResolvedValueOnce({ kind: "ok", value: discountList([almacenTuesdays]) })
    .mockResolvedValueOnce({ kind: "ok", value: discountList([almacenTuesdays, yerbaOff]) });
  vi.mocked(services.createDiscount).mockResolvedValue({ kind: "ok", discount: yerbaOff });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Martes de almacén")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Nueva promoción" }));
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByText("Catálogo", { exact: true })).toBeVisible();
  await fillValidNewDiscount(dialog);
  await userEvent.click(dialog.getByRole("button", { name: "Crear la promoción" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => rowCells(screen)).toHaveLength(2);
  await expect.element(screen.getByText("Promoción creada")).toBeVisible();
  await expect
    .element(screen.getByText("«Yerba de septiembre» ya está en la lista."))
    .toBeVisible();
});

test("cancel closes the new promotion modal without creating anything", async () => {
  const services = createServices();
  const screen = await loaded(services, [yerbaOff]);
  await userEvent.click(screen.getByRole("button", { name: "Nueva promoción" }));

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.createDiscount).not.toHaveBeenCalled();
  expect(screen.getByText("Promoción creada").query()).toBeNull();
});

test("the create action stays disabled while what the modal offers loads, and after it fails to load", async () => {
  const services = createServices();
  const targets = deferred<Awaited<ReturnType<typeof services.fetchDiscountTargets>>>();
  vi.mocked(services.fetchDiscountTargets).mockReturnValueOnce(targets.promise);
  vi.mocked(services.fetchDiscounts).mockResolvedValue({ kind: "ok", value: discountList([]) });
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: "Nueva promoción" })).toBeDisabled();

  targets.resolve({ kind: "failed" });
  await expect.element(screen.getByText("No pudimos abrir las promociones")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Nueva promoción" })).toBeDisabled();
});

test("the create action is enabled once everything is loaded", async () => {
  const services = createServices();
  const screen = await loaded(services, [yerbaOff]);

  await expect.element(screen.getByRole("button", { name: "Nueva promoción" })).toBeEnabled();
});
