import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  almendras,
  createServices,
  miel,
  mockLoaded,
  openDeactivateProductModal,
  renderScreen,
} from "./test-support/productsListScreen";

test("opens the deactivate confirmation modal, and cancel closes it without calling the API", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  const screen = await renderScreen(services);

  const dialog = await openDeactivateProductModal(screen, miel);
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
  mockLoaded(services, [miel, almendras]);
  vi.mocked(services.deactivateProduct).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  const dialog = await openDeactivateProductModal(screen, miel);

  vi.mocked(services.fetchProducts).mockResolvedValueOnce({ kind: "ok", value: [almendras] });
  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  expect(services.deactivateProduct).toHaveBeenCalledWith("product-1");
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchProducts).mock.calls.length).toBe(2);
  await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
  expect(screen.getByText("Miel pura de abeja 1 kg").query()).toBeNull();
});

test("shows an already-deactivated notice on 404, and updating the list closes the modal", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  vi.mocked(services.deactivateProduct).mockResolvedValue({ kind: "not_found" });
  const screen = await renderScreen(services);
  const dialog = await openDeactivateProductModal(screen, miel);

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Ya estaba desactivado");
  expect(dialog.getByRole("button", { name: "Desactivar" }).query()).toBeNull();

  vi.mocked(services.fetchProducts).mockResolvedValueOnce({ kind: "ok", value: [] });
  await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("No hay productos activos")).toBeVisible();
});

test("shows a generic failure notice when deactivating fails", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  vi.mocked(services.deactivateProduct).mockResolvedValue({ kind: "failed" });
  const screen = await renderScreen(services);
  const dialog = await openDeactivateProductModal(screen, miel);

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.element(dialog.getByText("No se pudo desactivar el producto")).toBeVisible();
});

test("shows the rate-limited notice when deactivating is refused for too many requests", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  vi.mocked(services.deactivateProduct).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 90,
  });
  const screen = await renderScreen(services);
  const dialog = await openDeactivateProductModal(screen, miel);

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
});

test("navigates to Mi cuenta when deactivating comes back forbidden", async () => {
  window.history.pushState(null, "", "/catalog/products");
  const services = createServices();
  mockLoaded(services, [miel]);
  vi.mocked(services.deactivateProduct).mockResolvedValue({ kind: "forbidden" });
  const screen = await renderScreen(services);
  const dialog = await openDeactivateProductModal(screen, miel);

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  window.history.pushState(null, "", "/");
});

test("ends the session when deactivating finds no open session", async () => {
  const services = createServices();
  mockLoaded(services, [miel]);
  vi.mocked(services.deactivateProduct).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  const dialog = await openDeactivateProductModal(screen, miel);

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
