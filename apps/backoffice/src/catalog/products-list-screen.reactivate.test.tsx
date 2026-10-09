import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { honey, retiredHoney } from "./test-support/products";
import {
  createServices,
  mockLoaded,
  openReactivateProductModal,
  renderScreen,
} from "./test-support/products-list-screen";

test("offers Reactivar on an inactive product only", async () => {
  const services = createServices();
  mockLoaded(services, [honey, retiredHoney]);
  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("button", { name: "Reactivar el producto Miel de caña 500 g" }))
    .toBeVisible();
  expect(
    screen.getByRole("button", { name: "Reactivar el producto Miel pura de abeja 1 kg" }).query(),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "Desactivar el producto Miel de caña 500 g" }).query(),
  ).toBeNull();
});

test("opens the reactivate confirmation modal, and cancel closes it without calling the API", async () => {
  const services = createServices();
  mockLoaded(services, [retiredHoney]);
  const screen = await renderScreen(services);

  const dialog = await openReactivateProductModal(screen, retiredHoney);
  await expect
    .element(dialog.getByRole("heading", { name: "¿Reactivar Miel de caña 500 g?" }))
    .toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.reactivateProduct).not.toHaveBeenCalled();
});

test("reactivates a product, closes the modal, and refreshes the list", async () => {
  const services = createServices();
  mockLoaded(services, [retiredHoney, honey]);
  vi.mocked(services.reactivateProduct).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  const dialog = await openReactivateProductModal(screen, retiredHoney);

  vi.mocked(services.fetchProducts).mockResolvedValueOnce({ kind: "ok", value: [honey] });
  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));

  expect(services.reactivateProduct).toHaveBeenCalledWith("90d00000-0000-4000-8000-000000000003");
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchProducts).mock.calls.length).toBe(2);
  expect(screen.getByText("Miel de caña 500 g").query()).toBeNull();
});

test("keeps the modal open and names the taken barcode when another product holds it", async () => {
  const services = createServices();
  mockLoaded(services, [retiredHoney]);
  vi.mocked(services.reactivateProduct).mockResolvedValue({
    kind: "barcode_taken",
    codes: ["7790987000022"],
  });
  const screen = await renderScreen(services);
  const dialog = await openReactivateProductModal(screen, retiredHoney);

  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));

  await expect.element(dialog.getByText("No se puede reactivar")).toBeVisible();
  await expect
    .element(dialog.getByText(/^El código 7790987000022 ya es de otro producto\./))
    .toBeVisible();
  expect(services.fetchProducts).toHaveBeenCalledTimes(1);
});
