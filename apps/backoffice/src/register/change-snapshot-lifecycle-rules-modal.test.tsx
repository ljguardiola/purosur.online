import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  ChangeSnapshotLifecycleRulesModal,
  type ChangeSnapshotLifecycleRulesModalServices,
} from "./change-snapshot-lifecycle-rules-modal";
import {
  createAuthorizationServices,
  grantAuthorization,
} from "./test-support/snapshot-backups-screen";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function createServices(
  overrides: Partial<ChangeSnapshotLifecycleRulesModalServices> = {},
): ChangeSnapshotLifecycleRulesModalServices {
  return {
    changeSnapshotLifecycleRules: vi.fn(),
    ...createAuthorizationServices(),
    ...overrides,
  };
}

const CURRENT_RULES = { hourly: 24, daily: 30, monthly: 12 };

type Handlers = {
  open?: boolean;
  rules?: typeof CURRENT_RULES;
  onClose?: () => void;
  onChanged?: () => void;
  onSessionEnded?: () => void;
};

function modalFor(services: ChangeSnapshotLifecycleRulesModalServices, handlers: Handlers = {}) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <ChangeSnapshotLifecycleRulesModal
          open={handlers.open ?? true}
          rules={handlers.rules ?? CURRENT_RULES}
          onClose={handlers.onClose ?? (() => {})}
          onChanged={handlers.onChanged ?? (() => {})}
          onSessionEnded={handlers.onSessionEnded ?? (() => {})}
          services={services}
        />
      </main>
    </FieldSizeProvider>
  );
}

async function renderModal(
  services: ChangeSnapshotLifecycleRulesModalServices,
  handlers: Handlers = {},
) {
  const screen = await render(modalFor(services, handlers));
  const dialog = screen.getByRole("dialog", { name: "Cambiar las reglas" });
  await expect.element(dialog).toBeVisible();
  return { screen, dialog };
}

type Dialog = Awaited<ReturnType<typeof renderModal>>["dialog"];

async function typeRules(
  dialog: Dialog,
  rules: { hourly: string; daily: string; monthly: string },
) {
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Por hora/ }), rules.hourly);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Diarias/ }), rules.daily);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Mensuales/ }), rules.monthly);
}

async function submit(dialog: Dialog) {
  await userEvent.click(dialog.getByRole("button", { name: "Guardar las reglas" }));
}

test("shows the rules in force in their fields, each with the range it accepts", async () => {
  const { dialog } = await renderModal(createServices());

  await expect.element(dialog.getByRole("textbox", { name: /^Por hora/ })).toHaveValue("24");
  await expect.element(dialog.getByRole("textbox", { name: /^Diarias/ })).toHaveValue("30");
  await expect.element(dialog.getByRole("textbox", { name: /^Mensuales/ })).toHaveValue("12");
  await expect.element(dialog.getByText("Entre 1 y 72")).toBeVisible();
  await expect.element(dialog.getByText("Entre 1 y 90")).toBeVisible();
  await expect.element(dialog.getByText("Entre 1 y 24")).toBeVisible();
});

test("has no accessibility violations", async () => {
  const { dialog } = await renderModal(createServices());

  await expectNoAccessibilityViolations(dialog.element());
});

test("sends the typed rules and reports them changed", async () => {
  const services = createServices();
  vi.mocked(services.changeSnapshotLifecycleRules).mockResolvedValue({
    kind: "ok",
    value: { hourly: 48, daily: 60, monthly: 6 },
  });
  const onChanged = vi.fn();
  const { dialog } = await renderModal(services, { onChanged });

  await typeRules(dialog, { hourly: "48", daily: "60", monthly: "6" });
  await submit(dialog);

  await expect.poll(() => onChanged.mock.calls.length).toBe(1);
  expect(services.changeSnapshotLifecycleRules).toHaveBeenCalledWith({
    hourly: 48,
    daily: 60,
    monthly: 6,
  });
});

test.each([
  [
    "Por hora",
    { hourly: "73", daily: "30", monthly: "12" },
    "Ingresá un número entero entre 1 y 72.",
  ],
  [
    "Diarias",
    { hourly: "24", daily: "0", monthly: "12" },
    "Ingresá un número entero entre 1 y 90.",
  ],
  [
    "Mensuales",
    { hourly: "24", daily: "30", monthly: "1.5" },
    "Ingresá un número entero entre 1 y 24.",
  ],
])(
  "refuses a %s count outside its range without calling the cloud",
  async (_label, rules, message) => {
    const services = createServices();
    const { dialog } = await renderModal(services);

    await typeRules(dialog, rules);
    await submit(dialog);

    await expect.element(dialog.getByText(message)).toBeVisible();
    expect(services.changeSnapshotLifecycleRules).not.toHaveBeenCalled();
  },
);

test("reopening the modal starts from the rules in force with no error", async () => {
  const services = createServices();
  const { screen, dialog } = await renderModal(services);
  await typeRules(dialog, { hourly: "0", daily: "30", monthly: "12" });
  await submit(dialog);
  await expect.element(dialog.getByText("Ingresá un número entero entre 1 y 72.")).toBeVisible();
  await screen.rerender(modalFor(services, { open: false }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();

  await screen.rerender(modalFor(services, { open: true }));

  const reopened = screen.getByRole("dialog", { name: "Cambiar las reglas" });
  await expect.element(reopened.getByRole("textbox", { name: /^Por hora/ })).toHaveValue("24");
  await expect
    .element(reopened.getByText("Ingresá un número entero entre 1 y 72."))
    .not.toBeInTheDocument();
});

test("closing the modal reports it closed", async () => {
  const onClose = vi.fn();
  const { dialog } = await renderModal(createServices(), { onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
});

test("shows the field the cloud refused and does not report the rules changed", async () => {
  const services = createServices();
  vi.mocked(services.changeSnapshotLifecycleRules).mockResolvedValue({
    kind: "validation_failed",
    field: "daily",
  });
  const onChanged = vi.fn();
  const { dialog } = await renderModal(services, { onChanged });

  await submit(dialog);

  await expect.element(dialog.getByText("Ingresá un número entero entre 1 y 90.")).toBeVisible();
  expect(onChanged).not.toHaveBeenCalled();
});

test("opens the authorization modal on authorization_required, then authorizes and retries", async () => {
  const services = createServices();
  vi.mocked(services.changeSnapshotLifecycleRules).mockResolvedValueOnce({
    kind: "authorization_required",
  });
  grantAuthorization(services);
  vi.mocked(services.changeSnapshotLifecycleRules).mockResolvedValueOnce({
    kind: "ok",
    value: CURRENT_RULES,
  });
  const onChanged = vi.fn();
  const { screen, dialog } = await renderModal(services, { onChanged });

  await submit(dialog);
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();
  await expect
    .element(
      authDialog.getByText(
        "Cambiar las reglas de los backups necesita tu autorización. Confirmala con tu passkey.",
      ),
    )
    .toBeVisible();

  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect
    .poll(() => vi.mocked(services.changeSnapshotLifecycleRules).mock.calls.length)
    .toBe(2);
  await expect.poll(() => onChanged.mock.calls.length).toBe(1);
});

test("cancelling the authorization leaves the modal open and reports nothing changed", async () => {
  const services = createServices();
  vi.mocked(services.changeSnapshotLifecycleRules).mockResolvedValue({
    kind: "authorization_required",
  });
  const onChanged = vi.fn();
  const { screen, dialog } = await renderModal(services, { onChanged });

  await submit(dialog);
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await userEvent.click(authDialog.getByRole("button", { name: "Cancelar" }));

  await expect
    .poll(() => screen.getByRole("dialog", { name: "Autorizá este cambio" }).query())
    .toBeNull();
  await expect.element(dialog).toBeVisible();
  expect(onChanged).not.toHaveBeenCalled();
});

test("shows the rate-limited notice", async () => {
  const services = createServices();
  vi.mocked(services.changeSnapshotLifecycleRules).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const { dialog } = await renderModal(services);

  await submit(dialog);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("shows the attempt-failed notice", async () => {
  const services = createServices();
  vi.mocked(services.changeSnapshotLifecycleRules).mockResolvedValue({ kind: "failed" });
  const { dialog } = await renderModal(services);

  await submit(dialog);

  await expect.element(dialog.getByText("No se pudieron cambiar las reglas")).toBeVisible();
  await expect.element(dialog.getByText("Probá de nuevo.")).toBeVisible();
});

test("navigates to Mi cuenta when the change comes back forbidden", async () => {
  window.history.pushState(null, "", "/backups");
  const services = createServices();
  vi.mocked(services.changeSnapshotLifecycleRules).mockResolvedValue({ kind: "forbidden" });
  const { dialog } = await renderModal(services);

  await submit(dialog);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("ends the session when the change finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.changeSnapshotLifecycleRules).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal(services, { onSessionEnded });

  await submit(dialog);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
