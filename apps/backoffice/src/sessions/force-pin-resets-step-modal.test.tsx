import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { ForcePinResetsStepModal } from "./force-pin-resets-step-modal";
import { runbook } from "./test-support/compromise-response";
import { createServices, grantAuthorization } from "./test-support/compromise-response-screen";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

type Handlers = {
  open?: boolean;
  onClose?: () => void;
  onDone?: (runbook: ReturnType<typeof runbook>) => void;
  onOutdated?: () => void;
  onSessionEnded?: () => void;
};

async function renderModal(
  services: ReturnType<typeof createServices>,
  handlers: Handlers = {},
) {
  const screen = await render(
    <main>
      <ForcePinResetsStepModal
        open={handlers.open ?? true}
        onClose={handlers.onClose ?? (() => {})}
        onDone={handlers.onDone ?? (() => {})}
        onOutdated={handlers.onOutdated ?? (() => {})}
        onSessionEnded={handlers.onSessionEnded ?? (() => {})}
        services={services}
      />
    </main>,
  );
  const dialog = screen.getByRole("dialog", { name: "Forzar el reinicio de PIN" });
  await expect.element(dialog).toBeVisible();
  return { screen, dialog };
}

type Dialog = Awaited<ReturnType<typeof renderModal>>["dialog"];

async function confirm(dialog: Dialog) {
  await userEvent.click(dialog.getByRole("button", { name: "Forzar el reinicio" }));
}

test("explains that every user of every branch must set a new PIN at the register", async () => {
  const { dialog } = await renderModal(createServices());

  await expect
    .element(dialog.getByText(/Todos los usuarios de todas las sucursales/))
    .toBeVisible();
  await expect.element(dialog.getByText(/nuevo PIN en la caja/)).toBeVisible();
});

test("has no accessibility violations", async () => {
  const { dialog } = await renderModal(createServices());

  await expectNoAccessibilityViolations(dialog.element());
});

test("is closed when it is not open", async () => {
  const screen = await render(
    <main>
      <ForcePinResetsStepModal
        open={false}
        onClose={() => {}}
        onDone={() => {}}
        onOutdated={() => {}}
        onSessionEnded={() => {}}
        services={createServices()}
      />
    </main>,
  );

  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("runs the step and hands the updated runbook over", async () => {
  const services = createServices();
  const updated = runbook(["force_pin_resets"]);
  vi.mocked(services.forcePinResets).mockResolvedValue({ kind: "ok", value: updated });
  const onDone = vi.fn();
  const { dialog } = await renderModal(services, { onDone });

  await confirm(dialog);

  await expect.poll(() => onDone.mock.calls).toEqual([[updated]]);
});

test("cancelling closes it without running the step", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const { dialog } = await renderModal(services, { onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.forcePinResets).not.toHaveBeenCalled();
});

test("asks for the passkey when the cloud requires a fresh authorization, then runs the step", async () => {
  const services = createServices();
  const updated = runbook(["force_pin_resets"]);
  vi.mocked(services.forcePinResets).mockResolvedValueOnce({
    kind: "authorization_required",
  });
  vi.mocked(services.forcePinResets).mockResolvedValueOnce({ kind: "ok", value: updated });
  grantAuthorization(services);
  const onDone = vi.fn();
  const { screen, dialog } = await renderModal(services, { onDone });

  await confirm(dialog);
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();
  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => onDone.mock.calls).toEqual([[updated]]);
});

test.each([
  "no_running_response",
  "out_of_order",
  "already_done",
] as const)("explains a %s refusal and reports the runbook outdated", async (kind) => {
  const services = createServices();
  vi.mocked(services.forcePinResets).mockResolvedValue({ kind });
  const onOutdated = vi.fn();
  const { dialog } = await renderModal(services, { onOutdated });

  await confirm(dialog);

  await expect.element(dialog.getByText("El instructivo cambió")).toBeVisible();
  expect(onOutdated).toHaveBeenCalledTimes(1);
});

test("shows the rate-limited notice", async () => {
  const services = createServices();
  vi.mocked(services.forcePinResets).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const { dialog } = await renderModal(services);

  await confirm(dialog);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
});

test("shows the attempt-failed notice", async () => {
  const services = createServices();
  vi.mocked(services.forcePinResets).mockResolvedValue({ kind: "failed" });
  const { dialog } = await renderModal(services);

  await confirm(dialog);

  await expect.element(dialog.getByText("No se pudo forzar el reinicio de PIN")).toBeVisible();
});

test("ends the session when the step finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.forcePinResets).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal(services, { onSessionEnded });

  await confirm(dialog);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
