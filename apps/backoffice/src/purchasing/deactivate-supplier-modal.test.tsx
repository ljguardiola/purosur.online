import type { SupplierSummary } from "@purosur/contracts";
import { ANOTHER_FICTIONAL_CUIT, FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  DeactivateSupplierModal,
  type DeactivateSupplierModalServices,
} from "./deactivate-supplier-modal";
import { suppliersWithCuits } from "./test-support/suppliers";

const { andina } = suppliersWithCuits(FICTIONAL_CUIT, ANOTHER_FICTIONAL_CUIT);

afterEach(() => {
  window.history.pushState(null, "", "/");
});

function renderModal({
  deactivateSupplier = vi.fn<DeactivateSupplierModalServices["deactivateSupplier"]>(),
  target = andina,
  onDeactivated = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: {
  deactivateSupplier?: DeactivateSupplierModalServices["deactivateSupplier"];
  target?: SupplierSummary;
  onDeactivated?: () => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
} = {}) {
  return render(
    <main>
      <DeactivateSupplierModal
        target={target}
        onClose={onClose}
        onDeactivated={onDeactivated}
        onSessionEnded={onSessionEnded}
        services={{ deactivateSupplier }}
      />
    </main>,
  );
}

async function confirm(screen: Awaited<ReturnType<typeof renderModal>>) {
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));
  return dialog;
}

test("asks about the supplier by name, saying what happens to new purchases and to what was already registered", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await expect
    .element(
      dialog.getByRole("heading", { name: '¿Desactivar el proveedor "Distribuidora Andina"?' }),
    )
    .toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "Deja de ofrecerse para compras nuevas. Lo que ya se registró con este proveedor queda como está.",
      ),
    )
    .toBeVisible();
});

test("confirming changes the supplier and reports it", async () => {
  const deactivateSupplier = vi
    .fn<DeactivateSupplierModalServices["deactivateSupplier"]>()
    .mockResolvedValue({ kind: "ok" });
  const onDeactivated = vi.fn();
  const screen = await renderModal({ deactivateSupplier, onDeactivated });

  await confirm(screen);

  expect(deactivateSupplier).toHaveBeenCalledWith(andina.id);
  await expect.poll(() => onDeactivated.mock.calls.length).toBe(1);
});

test("cancel closes the question without calling the API", async () => {
  const deactivateSupplier = vi.fn<DeactivateSupplierModalServices["deactivateSupplier"]>();
  const onClose = vi.fn();
  const screen = await renderModal({ deactivateSupplier, onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(deactivateSupplier).not.toHaveBeenCalled();
});

test("tells when the supplier was already changed, and updating the list reports it", async () => {
  const deactivateSupplier = vi
    .fn<DeactivateSupplierModalServices["deactivateSupplier"]>()
    .mockResolvedValue({
      kind: "already_changed",
    });
  const onDeactivated = vi.fn();
  const screen = await renderModal({ deactivateSupplier, onDeactivated });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Ya estaba desactivado");
  await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));

  expect(onDeactivated).toHaveBeenCalledTimes(1);
});

test("tells when the supplier no longer exists", async () => {
  const deactivateSupplier = vi
    .fn<DeactivateSupplierModalServices["deactivateSupplier"]>()
    .mockResolvedValue({ kind: "not_found" });
  const screen = await renderModal({ deactivateSupplier });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Este proveedor ya no existe");
});

test("shows the failure notice, and the confirmation stays available", async () => {
  const deactivateSupplier = vi
    .fn<DeactivateSupplierModalServices["deactivateSupplier"]>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ deactivateSupplier });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("No se desactivó el proveedor")).toBeVisible();
  await expect.element(dialog.getByText("Volvé a intentarlo.")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Desactivar" })).toBeEnabled();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const deactivateSupplier = vi
    .fn<DeactivateSupplierModalServices["deactivateSupplier"]>()
    .mockResolvedValue({
      kind: "rate_limited",
      retryAfterSeconds: 60,
    });
  const screen = await renderModal({ deactivateSupplier });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("navigates to Mi cuenta when the change comes back forbidden", async () => {
  window.history.pushState(null, "", "/suppliers");
  const deactivateSupplier = vi
    .fn<DeactivateSupplierModalServices["deactivateSupplier"]>()
    .mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal({ deactivateSupplier });

  await confirm(screen);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("ends the session when the change finds no open session", async () => {
  const deactivateSupplier = vi
    .fn<DeactivateSupplierModalServices["deactivateSupplier"]>()
    .mockResolvedValue({
      kind: "unauthenticated",
    });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ deactivateSupplier, onSessionEnded });

  await confirm(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
