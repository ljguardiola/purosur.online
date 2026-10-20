import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { CompromiseResponse } from "./compromise-response-api";
import { RevokeInstallationsStepModal } from "./revoke-installations-step-modal";
import { runbook } from "./test-support/compromise-response";
import { createServices, grantAuthorization } from "./test-support/compromise-response-screen";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

type Handlers = {
  open?: boolean;
  onClose?: () => void;
  onDone?: (runbook: CompromiseResponse) => void;
  onOutdated?: () => void;
  onSessionEnded?: () => void;
};

async function renderModal(services: ReturnType<typeof createServices>, handlers: Handlers = {}) {
  const screen = await render(
    <main>
      <RevokeInstallationsStepModal
        open={handlers.open ?? true}
        onClose={handlers.onClose ?? (() => {})}
        onDone={handlers.onDone ?? (() => {})}
        onOutdated={handlers.onOutdated ?? (() => {})}
        onSessionEnded={handlers.onSessionEnded ?? (() => {})}
        services={services}
      />
    </main>,
  );
  const dialog = screen.getByRole("dialog", { name: "Revocar todas las instalaciones" });
  await expect.element(dialog).toBeVisible();
  return { screen, dialog };
}

type Dialog = Awaited<ReturnType<typeof renderModal>>["dialog"];

async function confirm(dialog: Dialog) {
  await userEvent.click(dialog.getByRole("button", { name: "Revocar todas" }));
}

test("explains that every register of every branch stops syncing and must be enrolled again", async () => {
  const { dialog } = await renderModal(createServices());

  await expect.element(dialog.getByText(/dejan de poder sincronizar/)).toBeVisible();
  await expect.element(dialog.getByText(/darla de alta de nuevo/).first()).toBeVisible();
});

test("has no accessibility violations", async () => {
  const { dialog } = await renderModal(createServices());

  await expectNoAccessibilityViolations(dialog.element());
});

test("is closed when it is not open", async () => {
  const screen = await render(
    <main>
      <RevokeInstallationsStepModal
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
  const updated = runbook(["revoke_every_installation"]);
  vi.mocked(services.revokeEveryInstallation).mockResolvedValue({ kind: "ok", value: updated });
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
  expect(services.revokeEveryInstallation).not.toHaveBeenCalled();
});

test("asks for the passkey when the cloud requires a fresh authorization, then runs the step", async () => {
  const services = createServices();
  const updated = runbook(["revoke_every_installation"]);
  vi.mocked(services.revokeEveryInstallation).mockResolvedValueOnce({
    kind: "authorization_required",
  });
  vi.mocked(services.revokeEveryInstallation).mockResolvedValueOnce({ kind: "ok", value: updated });
  grantAuthorization(services);
  const onDone = vi.fn();
  const { screen, dialog } = await renderModal(services, { onDone });

  await confirm(dialog);
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();
  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => onDone.mock.calls).toEqual([[updated]]);
});

test.each(["no_running_response", "out_of_order", "already_done"] as const)(
  "explains a %s refusal and reports the runbook outdated",
  async (kind) => {
    const services = createServices();
    vi.mocked(services.revokeEveryInstallation).mockResolvedValue({ kind });
    const onOutdated = vi.fn();
    const { dialog } = await renderModal(services, { onOutdated });

    await confirm(dialog);

    await expect.element(dialog.getByText("El instructivo cambió")).toBeVisible();
    expect(onOutdated).toHaveBeenCalledTimes(1);
  },
);

test("shows the rate-limited notice", async () => {
  const services = createServices();
  vi.mocked(services.revokeEveryInstallation).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const { dialog } = await renderModal(services);

  await confirm(dialog);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
});

test("shows the attempt-failed notice", async () => {
  const services = createServices();
  vi.mocked(services.revokeEveryInstallation).mockResolvedValue({ kind: "failed" });
  const { dialog } = await renderModal(services);

  await confirm(dialog);

  await expect.element(dialog.getByText("No se pudo revocar las instalaciones")).toBeVisible();
});

test("ends the session when the step finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.revokeEveryInstallation).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal(services, { onSessionEnded });

  await confirm(dialog);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
