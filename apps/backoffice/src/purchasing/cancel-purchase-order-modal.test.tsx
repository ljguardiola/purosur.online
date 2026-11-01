import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  CancelPurchaseOrderModal,
  type CancelPurchaseOrderModalServices,
} from "./cancel-purchase-order-modal";
import { CANCELLED_ORDER, DRAFT_ORDER } from "./test-support/purchase-orders";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function renderModal({
  cancelPurchaseOrder = vi.fn<CancelPurchaseOrderModalServices["cancelPurchaseOrder"]>(),
  onCancelled = () => {},
  onOutdated = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: {
  cancelPurchaseOrder?: CancelPurchaseOrderModalServices["cancelPurchaseOrder"];
  onCancelled?: (order: typeof CANCELLED_ORDER) => void;
  onOutdated?: () => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
} = {}) {
  return render(
    <main>
      <CancelPurchaseOrderModal
        target={DRAFT_ORDER}
        services={{ cancelPurchaseOrder }}
        onCancelled={onCancelled}
        onOutdated={onOutdated}
        onClose={onClose}
        onSessionEnded={onSessionEnded}
      />
    </main>,
  );
}

async function confirm(screen: Awaited<ReturnType<typeof renderModal>>) {
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Cancelar pedido" }));
  return dialog;
}

test("asks about the order by its supplier, saying it can no longer be edited", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await expect
    .element(dialog.getByRole("heading", { name: "¿Cancelar el pedido a Distribuidora Andina?" }))
    .toBeVisible();
  await expect
    .element(dialog.getByText("El pedido queda cancelado y ya no se puede editar."))
    .toBeVisible();
});

test("confirming cancels the order and reports the order as the cloud answered it", async () => {
  const cancelPurchaseOrder = vi
    .fn<CancelPurchaseOrderModalServices["cancelPurchaseOrder"]>()
    .mockResolvedValue({ kind: "ok", order: CANCELLED_ORDER });
  const onCancelled = vi.fn();
  const screen = await renderModal({ cancelPurchaseOrder, onCancelled });

  await confirm(screen);

  expect(cancelPurchaseOrder).toHaveBeenCalledWith(DRAFT_ORDER.id);
  await expect.poll(() => onCancelled.mock.calls[0]?.[0]).toEqual(CANCELLED_ORDER);
});

test("Volver closes the question without calling the cloud", async () => {
  const cancelPurchaseOrder = vi.fn<CancelPurchaseOrderModalServices["cancelPurchaseOrder"]>();
  const onClose = vi.fn();
  const screen = await renderModal({ cancelPurchaseOrder, onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Volver" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(cancelPurchaseOrder).not.toHaveBeenCalled();
});

test("tells when the order can no longer be cancelled, and updating it reports it", async () => {
  const cancelPurchaseOrder = vi
    .fn<CancelPurchaseOrderModalServices["cancelPurchaseOrder"]>()
    .mockResolvedValue({ kind: "not_cancellable" });
  const onOutdated = vi.fn();
  const screen = await renderModal({ cancelPurchaseOrder, onOutdated });
  const dialog = await confirm(screen);

  await expect
    .element(dialog.getByRole("alert"))
    .toHaveTextContent("Este pedido ya no se puede cancelar");
  await userEvent.click(dialog.getByRole("button", { name: "Actualizar el pedido" }));

  expect(onOutdated).toHaveBeenCalledTimes(1);
});

test("tells when the order no longer exists, and updating it reports it", async () => {
  const cancelPurchaseOrder = vi
    .fn<CancelPurchaseOrderModalServices["cancelPurchaseOrder"]>()
    .mockResolvedValue({ kind: "not_found" });
  const onOutdated = vi.fn();
  const screen = await renderModal({ cancelPurchaseOrder, onOutdated });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Este pedido ya no existe");
  await userEvent.click(dialog.getByRole("button", { name: "Actualizar el pedido" }));

  expect(onOutdated).toHaveBeenCalledTimes(1);
});

test("shows the failure notice, and the confirmation stays available", async () => {
  const cancelPurchaseOrder = vi
    .fn<CancelPurchaseOrderModalServices["cancelPurchaseOrder"]>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ cancelPurchaseOrder });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("No se canceló el pedido")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Cancelar pedido" })).toBeEnabled();
});

test("shows the time to wait when the cloud rate-limits the cancellation", async () => {
  const cancelPurchaseOrder = vi
    .fn<CancelPurchaseOrderModalServices["cancelPurchaseOrder"]>()
    .mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 60 });
  const screen = await renderModal({ cancelPurchaseOrder });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("ends the session when cancelling finds no open session", async () => {
  const cancelPurchaseOrder = vi
    .fn<CancelPurchaseOrderModalServices["cancelPurchaseOrder"]>()
    .mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ cancelPurchaseOrder, onSessionEnded });

  await confirm(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when cancelling comes back forbidden", async () => {
  window.history.pushState(null, "", "/purchase-orders");
  const cancelPurchaseOrder = vi
    .fn<CancelPurchaseOrderModalServices["cancelPurchaseOrder"]>()
    .mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal({ cancelPurchaseOrder });

  await confirm(screen);

  await expect.poll(() => window.location.pathname).toBe("/account");
});
