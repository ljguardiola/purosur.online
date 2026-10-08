import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { MarkRefundDoneModal, type MarkRefundDoneModalServices } from "./mark-refund-done-modal";
import { TRANSFER_REFUND_ID, transferRefund } from "./test-support/refund-fixtures";

afterEach(() => {
  window.history.pushState(null, "", "/");
});

function renderModal({
  markRefundDone = vi.fn<MarkRefundDoneModalServices["markRefundDone"]>(),
  onDone = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: {
  markRefundDone?: MarkRefundDoneModalServices["markRefundDone"];
  onDone?: () => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
} = {}) {
  return render(
    <main>
      <MarkRefundDoneModal
        target={transferRefund}
        onClose={onClose}
        onDone={onDone}
        onSessionEnded={onSessionEnded}
        services={{ markRefundDone }}
      />
    </main>,
  );
}

async function confirm(screen: Awaited<ReturnType<typeof renderModal>>) {
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Marcar como hecho" }));
  return dialog;
}

test("asks about the refund by its amount and how it was paid back", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await expect
    .element(
      dialog.getByRole("heading", { name: "¿Marcar como hecho el reembolso de $ 2.500,00?" }),
    )
    .toBeVisible();
  await expect
    .element(dialog.getByText("Confirmá que ya se lo devolviste al cliente por transferencia."))
    .toBeVisible();
});

test("confirming marks the refund as done and reports it", async () => {
  const markRefundDone = vi
    .fn<MarkRefundDoneModalServices["markRefundDone"]>()
    .mockResolvedValue({ kind: "ok" });
  const onDone = vi.fn();
  const screen = await renderModal({ markRefundDone, onDone });

  await confirm(screen);

  expect(markRefundDone).toHaveBeenCalledWith(TRANSFER_REFUND_ID);
  await expect.poll(() => onDone.mock.calls.length).toBe(1);
});

test("cancel closes the question without calling the cloud", async () => {
  const markRefundDone = vi.fn<MarkRefundDoneModalServices["markRefundDone"]>();
  const onClose = vi.fn();
  const screen = await renderModal({ markRefundDone, onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(markRefundDone).not.toHaveBeenCalled();
});

test("tells when the refund was already marked as done, and updating the list reports it", async () => {
  const markRefundDone = vi
    .fn<MarkRefundDoneModalServices["markRefundDone"]>()
    .mockResolvedValue({ kind: "already_done" });
  const onDone = vi.fn();
  const screen = await renderModal({ markRefundDone, onDone });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Ya estaba marcado como hecho");
  expect(dialog.getByRole("button", { name: "Marcar como hecho" }).query()).toBeNull();
  await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));

  expect(onDone).toHaveBeenCalledTimes(1);
});

test("tells when the refund no longer exists", async () => {
  const markRefundDone = vi
    .fn<MarkRefundDoneModalServices["markRefundDone"]>()
    .mockResolvedValue({ kind: "not_found" });
  const screen = await renderModal({ markRefundDone });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Este reembolso ya no existe");
});

test("shows the failure notice, and the confirmation stays available", async () => {
  const markRefundDone = vi
    .fn<MarkRefundDoneModalServices["markRefundDone"]>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ markRefundDone });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("No se marcó el reembolso como hecho")).toBeVisible();
  await expect.element(dialog.getByText("Volvé a intentarlo.")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Marcar como hecho" })).toBeEnabled();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const markRefundDone = vi.fn<MarkRefundDoneModalServices["markRefundDone"]>().mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 60,
  });
  const screen = await renderModal({ markRefundDone });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("navigates to Mi cuenta when the change comes back forbidden", async () => {
  window.history.pushState(null, "", "/pending-refunds");
  const markRefundDone = vi
    .fn<MarkRefundDoneModalServices["markRefundDone"]>()
    .mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal({ markRefundDone });

  await confirm(screen);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("ends the session when the change finds no open session", async () => {
  const markRefundDone = vi.fn<MarkRefundDoneModalServices["markRefundDone"]>().mockResolvedValue({
    kind: "unauthenticated",
  });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ markRefundDone, onSessionEnded });

  await confirm(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
