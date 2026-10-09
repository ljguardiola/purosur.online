import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  ReactivateProductModal,
  type ReactivateProductModalServices,
} from "./reactivate-product-modal";
import { retiredHoney } from "./test-support/products";

afterEach(() => {
  window.history.pushState(null, "", "/");
});

async function renderModal(
  reactivateProduct: ReactivateProductModalServices["reactivateProduct"] = vi.fn(),
  {
    onClose = () => {},
    onReactivated = () => {},
    onSessionEnded = () => {},
  }: { onClose?: () => void; onReactivated?: () => void; onSessionEnded?: () => void } = {},
) {
  const screen = await render(
    <main>
      <ReactivateProductModal
        target={retiredHoney}
        onClose={onClose}
        onReactivated={onReactivated}
        onSessionEnded={onSessionEnded}
        services={{ reactivateProduct }}
      />
    </main>,
  );
  return screen.getByRole("dialog");
}

async function confirm(dialog: Awaited<ReturnType<typeof renderModal>>) {
  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));
}

test("asks about the product by name, saying where it is sold again", async () => {
  const dialog = await renderModal();

  await expect
    .element(dialog.getByRole("heading", { name: "¿Reactivar Miel de caña 500 g?" }))
    .toBeVisible();
  await expect
    .element(dialog.getByText("Vuelve a venderse en el catálogo y en las cajas."))
    .toBeVisible();
});

test("confirming reactivates the product and reports it", async () => {
  const reactivateProduct = vi
    .fn<ReactivateProductModalServices["reactivateProduct"]>()
    .mockResolvedValue({ kind: "ok" });
  const onReactivated = vi.fn();
  const dialog = await renderModal(reactivateProduct, { onReactivated });

  await confirm(dialog);

  expect(reactivateProduct).toHaveBeenCalledWith("90d00000-0000-4000-8000-000000000003");
  await expect.poll(() => onReactivated.mock.calls.length).toBe(1);
});

test("cancel closes the question without calling the API", async () => {
  const reactivateProduct = vi.fn<ReactivateProductModalServices["reactivateProduct"]>();
  const onClose = vi.fn();
  const dialog = await renderModal(reactivateProduct, { onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(reactivateProduct).not.toHaveBeenCalled();
});

test("tells when the product was already active, and updating the list reports it", async () => {
  const reactivateProduct = vi
    .fn<ReactivateProductModalServices["reactivateProduct"]>()
    .mockResolvedValue({ kind: "already_changed" });
  const onReactivated = vi.fn();
  const dialog = await renderModal(reactivateProduct, { onReactivated });

  await confirm(dialog);

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Ya estaba activo");
  expect(dialog.getByRole("button", { name: "Reactivar" }).query()).toBeNull();
  await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));
  expect(onReactivated).toHaveBeenCalledTimes(1);
});

test("tells when the product no longer exists", async () => {
  const reactivateProduct = vi
    .fn<ReactivateProductModalServices["reactivateProduct"]>()
    .mockResolvedValue({ kind: "not_found" });
  const dialog = await renderModal(reactivateProduct);

  await confirm(dialog);

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Este producto ya no existe");
});

test("names the taken barcodes and keeps the confirmation available to retry", async () => {
  const reactivateProduct = vi
    .fn<ReactivateProductModalServices["reactivateProduct"]>()
    .mockResolvedValue({ kind: "barcode_taken", codes: ["7790987000022"] });
  const dialog = await renderModal(reactivateProduct);

  await confirm(dialog);

  await expect.element(dialog.getByText("No se puede reactivar")).toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "El código 7790987000022 ya es de otro producto. Cambiá ese código en este producto o desactivá el otro, y volvé a intentarlo.",
      ),
    )
    .toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Reactivar" })).toBeEnabled();
});

test("shows the failure notice, and the confirmation stays available", async () => {
  const reactivateProduct = vi
    .fn<ReactivateProductModalServices["reactivateProduct"]>()
    .mockResolvedValue({ kind: "failed" });
  const dialog = await renderModal(reactivateProduct);

  await confirm(dialog);

  await expect.element(dialog.getByText("No se reactivó el producto")).toBeVisible();
  await expect.element(dialog.getByText("Volvé a intentarlo.")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Reactivar" })).toBeEnabled();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const reactivateProduct = vi
    .fn<ReactivateProductModalServices["reactivateProduct"]>()
    .mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 60 });
  const dialog = await renderModal(reactivateProduct);

  await confirm(dialog);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("navigates to Mi cuenta when the change comes back forbidden", async () => {
  window.history.pushState(null, "", "/products");
  const reactivateProduct = vi
    .fn<ReactivateProductModalServices["reactivateProduct"]>()
    .mockResolvedValue({ kind: "forbidden" });
  const dialog = await renderModal(reactivateProduct);

  await confirm(dialog);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("ends the session when the change finds no open session", async () => {
  const reactivateProduct = vi
    .fn<ReactivateProductModalServices["reactivateProduct"]>()
    .mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const dialog = await renderModal(reactivateProduct, { onSessionEnded });

  await confirm(dialog);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
