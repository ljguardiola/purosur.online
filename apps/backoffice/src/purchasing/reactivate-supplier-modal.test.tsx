import type { SupplierSummary } from "@purosur/contracts";
import { ANOTHER_FICTIONAL_CUIT, FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  ReactivateSupplierModal,
  type ReactivateSupplierModalServices,
} from "./reactivate-supplier-modal";
import { suppliersWithCuits } from "./test-support/suppliers";

const { cerealera } = suppliersWithCuits(FICTIONAL_CUIT, ANOTHER_FICTIONAL_CUIT);

afterEach(() => {
  window.history.pushState(null, "", "/");
});

function renderModal({
  reactivateSupplier = vi.fn<ReactivateSupplierModalServices["reactivateSupplier"]>(),
  target = cerealera,
  onReactivated = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: {
  reactivateSupplier?: ReactivateSupplierModalServices["reactivateSupplier"];
  target?: SupplierSummary;
  onReactivated?: () => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
} = {}) {
  return render(
    <main>
      <ReactivateSupplierModal
        target={target}
        onClose={onClose}
        onReactivated={onReactivated}
        onSessionEnded={onSessionEnded}
        services={{ reactivateSupplier }}
      />
    </main>,
  );
}

async function confirm(screen: Awaited<ReturnType<typeof renderModal>>) {
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));
  return dialog;
}

test("asks about the supplier by name, saying it is offered for new purchases again", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await expect
    .element(
      dialog.getByRole("heading", { name: '¿Reactivar el proveedor "Cerealera del Norte"?' }),
    )
    .toBeVisible();
  await expect.element(dialog.getByText("Vuelve a ofrecerse para compras nuevas.")).toBeVisible();
});

test("confirming changes the supplier and reports it", async () => {
  const reactivateSupplier = vi
    .fn<ReactivateSupplierModalServices["reactivateSupplier"]>()
    .mockResolvedValue({ kind: "ok" });
  const onReactivated = vi.fn();
  const screen = await renderModal({ reactivateSupplier, onReactivated });

  await confirm(screen);

  expect(reactivateSupplier).toHaveBeenCalledWith(cerealera.id);
  await expect.poll(() => onReactivated.mock.calls.length).toBe(1);
});

test("cancel closes the question without calling the API", async () => {
  const reactivateSupplier = vi.fn<ReactivateSupplierModalServices["reactivateSupplier"]>();
  const onClose = vi.fn();
  const screen = await renderModal({ reactivateSupplier, onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(reactivateSupplier).not.toHaveBeenCalled();
});

test("tells when the supplier was already changed, and updating the list reports it", async () => {
  const reactivateSupplier = vi
    .fn<ReactivateSupplierModalServices["reactivateSupplier"]>()
    .mockResolvedValue({
      kind: "already_changed",
    });
  const onReactivated = vi.fn();
  const screen = await renderModal({ reactivateSupplier, onReactivated });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Ya estaba activo");
  await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));

  expect(onReactivated).toHaveBeenCalledTimes(1);
});

test("tells when the supplier no longer exists", async () => {
  const reactivateSupplier = vi
    .fn<ReactivateSupplierModalServices["reactivateSupplier"]>()
    .mockResolvedValue({ kind: "not_found" });
  const screen = await renderModal({ reactivateSupplier });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Este proveedor ya no existe");
});

test("shows the failure notice, and the confirmation stays available", async () => {
  const reactivateSupplier = vi
    .fn<ReactivateSupplierModalServices["reactivateSupplier"]>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ reactivateSupplier });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("No se reactivó el proveedor")).toBeVisible();
  await expect.element(dialog.getByText("Volvé a intentarlo.")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Reactivar" })).toBeEnabled();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const reactivateSupplier = vi
    .fn<ReactivateSupplierModalServices["reactivateSupplier"]>()
    .mockResolvedValue({
      kind: "rate_limited",
      retryAfterSeconds: 60,
    });
  const screen = await renderModal({ reactivateSupplier });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("navigates to Mi cuenta when the change comes back forbidden", async () => {
  window.history.pushState(null, "", "/suppliers");
  const reactivateSupplier = vi
    .fn<ReactivateSupplierModalServices["reactivateSupplier"]>()
    .mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal({ reactivateSupplier });

  await confirm(screen);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("ends the session when the change finds no open session", async () => {
  const reactivateSupplier = vi
    .fn<ReactivateSupplierModalServices["reactivateSupplier"]>()
    .mockResolvedValue({
      kind: "unauthenticated",
    });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ reactivateSupplier, onSessionEnded });

  await confirm(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
