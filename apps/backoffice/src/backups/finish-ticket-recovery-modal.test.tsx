import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  FinishTicketRecoveryModal,
  type FinishTicketRecoveryModalServices,
} from "./finish-ticket-recovery-modal";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const target = {
  recovery_id: "5b1c1c5e-5b0a-4d6e-9d58-0c2f6f0d3a21",
  register_name: "Caja 1",
};

function renderModal({
  finishContingencyTicketRecovery = vi.fn<
    FinishTicketRecoveryModalServices["finishContingencyTicketRecovery"]
  >(),
  onFinished = () => {},
  onClose = () => {},
  onSessionEnded = () => {},
}: {
  finishContingencyTicketRecovery?: FinishTicketRecoveryModalServices["finishContingencyTicketRecovery"];
  onFinished?: (outcome: "finished" | "already_finished" | "not_found") => void;
  onClose?: () => void;
  onSessionEnded?: () => void;
} = {}) {
  return render(
    <main>
      <FinishTicketRecoveryModal
        target={target}
        onClose={onClose}
        onFinished={onFinished}
        onSessionEnded={onSessionEnded}
        services={{ finishContingencyTicketRecovery }}
      />
    </main>,
  );
}

async function confirm(screen: Awaited<ReturnType<typeof renderModal>>) {
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Terminar el rescate" }));
  return dialog;
}

test("asks about the register by name, saying what happens to the tickets scanned later", async () => {
  const screen = await renderModal();
  const dialog = screen.getByRole("dialog");

  await expect
    .element(dialog.getByRole("heading", { name: "¿Terminar el rescate de Caja 1?" }))
    .toBeVisible();
  await expect
    .element(
      dialog.getByText("Los tickets que se escaneen después no van a llegar a la caja restaurada."),
    )
    .toBeVisible();
});

test.each(["finished", "already_finished", "not_found"] as const)(
  "reports the outcome the cloud answered: %s",
  async (outcome) => {
    const finishContingencyTicketRecovery = vi
      .fn<FinishTicketRecoveryModalServices["finishContingencyTicketRecovery"]>()
      .mockResolvedValue({ kind: "ok", value: { outcome } });
    const onFinished = vi.fn();
    const screen = await renderModal({ finishContingencyTicketRecovery, onFinished });

    await confirm(screen);

    expect(finishContingencyTicketRecovery).toHaveBeenCalledWith(target.recovery_id);
    await expect.poll(() => onFinished.mock.calls).toEqual([[outcome]]);
  },
);

test("cancel closes the question without calling the API", async () => {
  const finishContingencyTicketRecovery =
    vi.fn<FinishTicketRecoveryModalServices["finishContingencyTicketRecovery"]>();
  const onClose = vi.fn();
  const screen = await renderModal({ finishContingencyTicketRecovery, onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(finishContingencyTicketRecovery).not.toHaveBeenCalled();
});

test("cannot be closed while the cloud has not answered yet", async () => {
  const finishContingencyTicketRecovery = vi
    .fn<FinishTicketRecoveryModalServices["finishContingencyTicketRecovery"]>()
    .mockReturnValue(new Promise(() => {}));
  const onClose = vi.fn();
  const screen = await renderModal({ finishContingencyTicketRecovery, onClose });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  await userEvent.click(
    dialog.getByText("Los tickets que se escaneen después no van a llegar a la caja restaurada."),
  );
  await userEvent.keyboard("{Escape}");

  await expect.element(dialog).toBeVisible();
  expect(onClose).not.toHaveBeenCalled();
});

test("shows the failure notice, and the confirmation stays available", async () => {
  const finishContingencyTicketRecovery = vi
    .fn<FinishTicketRecoveryModalServices["finishContingencyTicketRecovery"]>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await renderModal({ finishContingencyTicketRecovery });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("No se pudo terminar el rescate")).toBeVisible();
  await expect.element(dialog.getByText("Probá de nuevo.")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Terminar el rescate" })).toBeEnabled();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const finishContingencyTicketRecovery = vi
    .fn<FinishTicketRecoveryModalServices["finishContingencyTicketRecovery"]>()
    .mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 60 });
  const screen = await renderModal({ finishContingencyTicketRecovery });
  const dialog = await confirm(screen);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("navigates to Mi cuenta when finishing comes back forbidden", async () => {
  window.history.pushState(null, "", "/rescue");
  const finishContingencyTicketRecovery = vi
    .fn<FinishTicketRecoveryModalServices["finishContingencyTicketRecovery"]>()
    .mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal({ finishContingencyTicketRecovery });

  await confirm(screen);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("ends the session when finishing finds no open session", async () => {
  const finishContingencyTicketRecovery = vi
    .fn<FinishTicketRecoveryModalServices["finishContingencyTicketRecovery"]>()
    .mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ finishContingencyTicketRecovery, onSessionEnded });

  await confirm(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
