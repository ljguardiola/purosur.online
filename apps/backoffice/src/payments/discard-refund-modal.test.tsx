import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { DiscardRefundModal, type DiscardRefundModalServices } from "./discard-refund-modal";
import { LATE_PAYMENT_REFUND_ID, latePaymentRefund } from "./test-support/refund-fixtures";

afterEach(() => {
  window.history.pushState(null, "", "/");
});

function renderModal({
  discardRefund = vi.fn<DiscardRefundModalServices["discardRefund"]>(),
  onDone = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: {
  discardRefund?: DiscardRefundModalServices["discardRefund"];
  onDone?: () => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
} = {}) {
  return render(
    <main>
      <DiscardRefundModal
        target={latePaymentRefund}
        onClose={onClose}
        onDone={onDone}
        onSessionEnded={onSessionEnded}
        services={{ discardRefund }}
      />
    </main>,
  );
}

async function confirm(screen: Awaited<ReturnType<typeof renderModal>>) {
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Descartar reembolso" }));
  return dialog;
}

test("asks about the refund by its amount and explains that discarding closes the task without refunding and resolves its alert", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await expect
    .element(dialog.getByRole("heading", { name: "¿Descartar el reembolso de $ 1.250,00?" }))
    .toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "Se cierra la tarea sin devolver el dinero al cliente y se resuelve su alerta. Descartala solo si no corresponde reembolsar este pago.",
      ),
    )
    .toBeVisible();
});

test("confirming discards the refund and reports it", async () => {
  const discardRefund = vi
    .fn<DiscardRefundModalServices["discardRefund"]>()
    .mockResolvedValue({ kind: "ok" });
  const onDone = vi.fn();
  const screen = await renderModal({ discardRefund, onDone });

  await confirm(screen);

  expect(discardRefund).toHaveBeenCalledWith(LATE_PAYMENT_REFUND_ID);
  await expect.poll(() => onDone.mock.calls.length).toBe(1);
});

test("cancel closes the question without calling the cloud", async () => {
  const discardRefund = vi.fn<DiscardRefundModalServices["discardRefund"]>();
  const onClose = vi.fn();
  const screen = await renderModal({ discardRefund, onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(discardRefund).not.toHaveBeenCalled();
});

test.each([
  ["already_done", "Ya estaba marcado como hecho"],
  ["already_discarded", "Ya estaba descartado"],
  ["not_discardable", "Este reembolso no se puede descartar"],
  ["not_found", "Este reembolso ya no existe"],
] as const)("tells %s, and updating the list reports it", async (kind, message) => {
  const discardRefund = vi
    .fn<DiscardRefundModalServices["discardRefund"]>()
    .mockResolvedValue({ kind });
  const onDone = vi.fn();
  const screen = await renderModal({ discardRefund, onDone });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByRole("alert")).toHaveTextContent(message);
  expect(dialog.getByRole("button", { name: "Descartar reembolso" }).query()).toBeNull();
  await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));

  expect(onDone).toHaveBeenCalledTimes(1);
});

test("shows the failure notice, and the confirmation stays available", async () => {
  const discardRefund = vi
    .fn<DiscardRefundModalServices["discardRefund"]>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ discardRefund });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("No se descartó el reembolso")).toBeVisible();
  await expect.element(dialog.getByText("Volvé a intentarlo.")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Descartar reembolso" })).toBeEnabled();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const discardRefund = vi.fn<DiscardRefundModalServices["discardRefund"]>().mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 60,
  });
  const screen = await renderModal({ discardRefund });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("navigates to Mi cuenta when the change comes back forbidden", async () => {
  window.history.pushState(null, "", "/pending-refunds");
  const discardRefund = vi
    .fn<DiscardRefundModalServices["discardRefund"]>()
    .mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal({ discardRefund });

  await confirm(screen);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("ends the session when the change finds no open session", async () => {
  const discardRefund = vi.fn<DiscardRefundModalServices["discardRefund"]>().mockResolvedValue({
    kind: "unauthenticated",
  });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ discardRefund, onSessionEnded });

  await confirm(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
