import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { almonds, honey } from "./test-support/products";
import {
  createServices,
  mockLoaded,
  openDeactivateProductModal,
  renderScreen,
} from "./test-support/products-list-screen";

test("opens the deactivate confirmation modal, and cancel closes it without calling the API", async () => {
  const services = createServices();
  mockLoaded(services, [honey]);
  const screen = await renderScreen(services);

  const dialog = await openDeactivateProductModal(screen, honey);
  await expect
    .element(dialog.getByRole("heading", { name: "¿Desactivar Miel pura de abeja 1 kg?" }))
    .toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "Deja de ofrecerse en el catálogo y en las cajas. Las ventas que ya lo incluyen no cambian.",
      ),
    )
    .toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.deactivateProduct).not.toHaveBeenCalled();
});

test("deactivates a product, closes the modal, and refreshes the list", async () => {
  const services = createServices();
  mockLoaded(services, [honey, almonds]);
  vi.mocked(services.deactivateProduct).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  const dialog = await openDeactivateProductModal(screen, honey);

  vi.mocked(services.fetchProducts).mockResolvedValueOnce({ kind: "ok", value: [almonds] });
  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  expect(services.deactivateProduct).toHaveBeenCalledWith("product-1");
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchProducts).mock.calls.length).toBe(2);
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  expect(screen.getByText("Miel pura de abeja 1 kg").query()).toBeNull();
});

test("shows an already-deactivated notice on 404, and updating the list closes the modal", async () => {
  const services = createServices();
  mockLoaded(services, [honey]);
  vi.mocked(services.deactivateProduct).mockResolvedValue({ kind: "not_found" });
  const screen = await renderScreen(services);
  const dialog = await openDeactivateProductModal(screen, honey);

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Ya estaba desactivado");
  expect(dialog.getByRole("button", { name: "Desactivar" }).query()).toBeNull();

  vi.mocked(services.fetchProducts).mockResolvedValueOnce({ kind: "ok", value: [] });
  await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();
});
