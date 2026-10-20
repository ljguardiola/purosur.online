import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { CompromiseResponse } from "./compromise-response-api";
import { EndSessionsStepModal } from "./end-sessions-step-modal";
import { ACCOUNT_ID, account, runbook } from "./test-support/compromise-response";
import { createServices, grantAuthorization } from "./test-support/compromise-response-screen";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const ana = account({ id: ACCOUNT_ID, firstName: "Ana Pérez", email: "ana@example.com" });
const beto = account({
  id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  firstName: "Beto Ruiz",
  email: "beto@example.com",
});
const carla = account({
  id: "1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d",
  firstName: "Carla Gómez",
  email: "carla@example.com",
  mayRemovePasskey: false,
});

type Handlers = {
  open?: boolean;
  onClose?: () => void;
  onDone?: (runbook: CompromiseResponse) => void;
  onOutdated?: () => void;
  onSessionEnded?: () => void;
};

function servicesWithAccounts() {
  return createServices({
    fetchUsers: vi.fn().mockResolvedValue({ kind: "ok", value: [ana, beto, carla] }),
  });
}

async function renderModal(services: ReturnType<typeof createServices>, handlers: Handlers = {}) {
  const screen = await render(
    <main>
      <EndSessionsStepModal
        open={handlers.open ?? true}
        onClose={handlers.onClose ?? (() => {})}
        onDone={handlers.onDone ?? (() => {})}
        onOutdated={handlers.onOutdated ?? (() => {})}
        onSessionEnded={handlers.onSessionEnded ?? (() => {})}
        services={services}
      />
    </main>,
  );
  const dialog = screen.getByRole("dialog", {
    name: "Cerrar las sesiones y dar de baja las passkeys",
  });
  await expect.element(dialog).toBeVisible();
  return { screen, dialog };
}

type Rendered = Awaited<ReturnType<typeof renderModal>>;

async function chooseAccount({ screen, dialog }: Rendered, name: string) {
  await userEvent.click(dialog.getByRole("button", { name: /Cuenta sospechada/ }));
  await userEvent.click(screen.getByRole("option", { name }));
}

async function confirm({ dialog }: Rendered) {
  await userEvent.click(dialog.getByRole("button", { name: "Cerrar y dar de baja" }));
}

test("warns that every session ends, the caller's included, and the chosen account loses its passkeys", async () => {
  const { dialog } = await renderModal(servicesWithAccounts());

  await expect.element(dialog.getByText(/También se cierra la tuya/)).toBeVisible();
  await expect.element(dialog.getByText(/todas sus passkeys/)).toBeVisible();
});

test("has no accessibility violations", async () => {
  const { dialog } = await renderModal(servicesWithAccounts());

  await expectNoAccessibilityViolations(dialog.element());
});

test("does not read the accounts while it is closed", async () => {
  const services = servicesWithAccounts();
  await render(
    <main>
      <EndSessionsStepModal
        open={false}
        onClose={() => {}}
        onDone={() => {}}
        onOutdated={() => {}}
        onSessionEnded={() => {}}
        services={services}
      />
    </main>,
  );

  expect(services.fetchUsers).not.toHaveBeenCalled();
});

test("offers only the accounts whose passkeys the cloud answers may be removed", async () => {
  const rendered = await renderModal(servicesWithAccounts());

  await userEvent.click(rendered.dialog.getByRole("button", { name: /Cuenta sospechada/ }));

  await expect
    .element(rendered.screen.getByRole("option", { name: "Ana Pérez · ana@example.com" }))
    .toBeVisible();
  await expect
    .element(rendered.screen.getByRole("option", { name: "Beto Ruiz · beto@example.com" }))
    .toBeVisible();
  expect(
    rendered.screen.getByRole("option", { name: "Carla Gómez · carla@example.com" }).query(),
  ).toBeNull();
});

test("shows a loading state while the accounts load and disables the confirmation", async () => {
  const services = createServices({
    fetchUsers: vi.fn().mockReturnValue(new Promise(() => {})),
  });
  const { dialog } = await renderModal(services);

  await expect.element(dialog.getByRole("status")).toHaveTextContent("Cargando…");
  await expect.element(dialog.getByRole("button", { name: "Cerrar y dar de baja" })).toBeDisabled();
});

test("offers to read the accounts again when they fail to load", async () => {
  const services = createServices({
    fetchUsers: vi
      .fn()
      .mockResolvedValueOnce({ kind: "failed" })
      .mockResolvedValueOnce({ kind: "ok", value: [ana] }),
  });
  const rendered = await renderModal(services);

  await expect.element(rendered.dialog.getByText("No pudimos abrir las cuentas")).toBeVisible();
  await userEvent.click(rendered.dialog.getByRole("button", { name: "Reintentar" }));

  await expect.poll(() => vi.mocked(services.fetchUsers).mock.calls.length).toBe(2);
  await expect
    .element(rendered.dialog.getByRole("button", { name: /Cuenta sospechada/ }))
    .toBeVisible();
});

test("asks to choose an account when none was chosen, without running the step", async () => {
  const services = servicesWithAccounts();
  const rendered = await renderModal(services);

  await confirm(rendered);

  await expect.element(rendered.dialog.getByText("Elegí una cuenta.")).toBeVisible();
  expect(services.endSessionsAndRemovePasskeys).not.toHaveBeenCalled();
});

test("runs the step for the chosen account and hands the updated runbook over", async () => {
  const services = servicesWithAccounts();
  const updated = runbook(["revoke_every_installation", "end_sessions_and_remove_passkeys"]);
  vi.mocked(services.endSessionsAndRemovePasskeys).mockResolvedValue({
    kind: "ok",
    value: updated,
  });
  const onDone = vi.fn();
  const rendered = await renderModal(services, { onDone });

  await chooseAccount(rendered, "Beto Ruiz · beto@example.com");
  await confirm(rendered);

  await expect.poll(() => onDone.mock.calls).toEqual([[updated]]);
  expect(services.endSessionsAndRemovePasskeys).toHaveBeenCalledWith({ account_id: beto.id });
});

test("asks for the passkey when the cloud requires a fresh authorization, then runs the step", async () => {
  const services = servicesWithAccounts();
  const updated = runbook();
  vi.mocked(services.endSessionsAndRemovePasskeys).mockResolvedValueOnce({
    kind: "authorization_required",
  });
  vi.mocked(services.endSessionsAndRemovePasskeys).mockResolvedValueOnce({
    kind: "ok",
    value: updated,
  });
  grantAuthorization(services);
  const onDone = vi.fn();
  const rendered = await renderModal(services, { onDone });
  await chooseAccount(rendered, "Ana Pérez · ana@example.com");

  await confirm(rendered);
  await userEvent.click(
    rendered.screen
      .getByRole("dialog", { name: "Autorizá este cambio" })
      .getByRole("button", { name: "Usar mi passkey" }),
  );

  await expect.poll(() => onDone.mock.calls).toEqual([[updated]]);
});

test("explains that the account is no longer there", async () => {
  const services = servicesWithAccounts();
  vi.mocked(services.endSessionsAndRemovePasskeys).mockResolvedValue({ kind: "not_found" });
  const rendered = await renderModal(services);
  await chooseAccount(rendered, "Ana Pérez · ana@example.com");

  await confirm(rendered);

  await expect.element(rendered.dialog.getByText("Esa cuenta ya no existe")).toBeVisible();
});

test("explains that it cannot be the caller's own account", async () => {
  const services = servicesWithAccounts();
  vi.mocked(services.endSessionsAndRemovePasskeys).mockResolvedValue({ kind: "own_account" });
  const rendered = await renderModal(services);
  await chooseAccount(rendered, "Ana Pérez · ana@example.com");

  await confirm(rendered);

  await expect.element(rendered.dialog.getByText("No podés elegir tu propia cuenta")).toBeVisible();
});

test.each(["no_running_response", "out_of_order", "already_done"] as const)(
  "explains a %s refusal and reports the runbook outdated",
  async (kind) => {
    const services = servicesWithAccounts();
    vi.mocked(services.endSessionsAndRemovePasskeys).mockResolvedValue({ kind });
    const onOutdated = vi.fn();
    const rendered = await renderModal(services, { onOutdated });
    await chooseAccount(rendered, "Ana Pérez · ana@example.com");

    await confirm(rendered);

    await expect.element(rendered.dialog.getByText("El instructivo cambió")).toBeVisible();
    expect(onOutdated).toHaveBeenCalledTimes(1);
  },
);

test("shows the attempt-failed notice", async () => {
  const services = servicesWithAccounts();
  vi.mocked(services.endSessionsAndRemovePasskeys).mockResolvedValue({ kind: "failed" });
  const rendered = await renderModal(services);
  await chooseAccount(rendered, "Ana Pérez · ana@example.com");

  await confirm(rendered);

  await expect.element(rendered.dialog.getByText("No se pudo hacer este paso")).toBeVisible();
});

test("cancelling closes it without running the step", async () => {
  const services = servicesWithAccounts();
  const onClose = vi.fn();
  const { dialog } = await renderModal(services, { onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.endSessionsAndRemovePasskeys).not.toHaveBeenCalled();
});
