import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  DeactivateProductModal,
  type DeactivateProductModalServices,
} from "./deactivate-product-modal";
import { honey } from "./test-support/products";

function createServices(
  overrides: Partial<DeactivateProductModalServices> = {},
): DeactivateProductModalServices {
  return { deactivateProduct: vi.fn(), ...overrides };
}

afterEach(() => {
  window.history.pushState(null, "", "/");
});

async function renderModal(
  services: DeactivateProductModalServices,
  {
    onSessionEnded = () => {},
    onVanished = () => {},
  }: { onSessionEnded?: () => void; onVanished?: () => void } = {},
) {
  const screen = await render(
    <main>
      <DeactivateProductModal
        target={honey}
        onClose={() => {}}
        onDeactivated={() => {}}
        onVanished={onVanished}
        onSessionEnded={onSessionEnded}
        services={services}
      />
    </main>,
  );
  return screen.getByRole("dialog", { name: "¿Desactivar Miel pura de abeja 1 kg?" });
}

test("shows a generic failure notice when deactivating fails", async () => {
  const services = createServices();
  vi.mocked(services.deactivateProduct).mockResolvedValue({ kind: "failed" });
  const dialog = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.element(dialog.getByText("No se pudo desactivar el producto")).toBeVisible();
});

test("shows the rate-limited notice when deactivating is refused for too many requests", async () => {
  const services = createServices();
  vi.mocked(services.deactivateProduct).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 90,
  });
  const dialog = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
});

test("navigates to Mi cuenta when deactivating comes back forbidden", async () => {
  window.history.pushState(null, "", "/products");
  const services = createServices();
  vi.mocked(services.deactivateProduct).mockResolvedValue({ kind: "forbidden" });
  const dialog = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("ends the session when deactivating finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.deactivateProduct).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const dialog = await renderModal(services, { onSessionEnded });

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("tells when the product was already deactivated, and updating the list reports it", async () => {
  const services = createServices();
  vi.mocked(services.deactivateProduct).mockResolvedValue({ kind: "already_changed" });
  const onVanished = vi.fn();
  const dialog = await renderModal(services, { onVanished });

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Ya estaba desactivado");
  expect(dialog.getByRole("button", { name: "Desactivar" }).query()).toBeNull();
  await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));

  expect(onVanished).toHaveBeenCalledTimes(1);
});

test("tells when the product no longer exists, and updating the list reports it", async () => {
  const services = createServices();
  vi.mocked(services.deactivateProduct).mockResolvedValue({ kind: "not_found" });
  const onVanished = vi.fn();
  const dialog = await renderModal(services, { onVanished });

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Este producto ya no existe");
  expect(dialog.getByRole("button", { name: "Desactivar" }).query()).toBeNull();
  await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));

  expect(onVanished).toHaveBeenCalledTimes(1);
});
