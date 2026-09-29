import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { NewRegisterModal, type NewRegisterModalServices } from "./new-register-modal";

function createServices(
  overrides: Partial<NewRegisterModalServices> = {},
): NewRegisterModalServices {
  return {
    createRegister: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

const authorizationOptions = { challenge: "session-auth" } as never;
const assertion = { id: "existing-cred" } as never;

function grantAuthorization(services: NewRegisterModalServices) {
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(assertion);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
}

type Handlers = {
  open?: boolean;
  onClose?: () => void;
  onCreated?: () => void;
  onSessionEnded?: () => void;
};

function modalFor(services: NewRegisterModalServices, handlers: Handlers = {}) {
  return (
    <main>
      <NewRegisterModal
        open={handlers.open ?? true}
        onClose={handlers.onClose ?? (() => {})}
        onCreated={handlers.onCreated ?? (() => {})}
        onSessionEnded={handlers.onSessionEnded ?? (() => {})}
        services={services}
      />
    </main>
  );
}

async function renderModal(services: NewRegisterModalServices, handlers: Handlers = {}) {
  const screen = await render(modalFor(services, handlers));
  const dialog = screen.getByRole("dialog", { name: "Nueva caja" });
  await expect.element(dialog).toBeVisible();
  return { screen, dialog };
}

async function submitName(dialog: Awaited<ReturnType<typeof renderModal>>["dialog"], name: string) {
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre de la caja/ }), name);
  await userEvent.click(dialog.getByRole("button", { name: "Crear la caja" }));
}

test("creates the register with the typed name and reports it created", async () => {
  const services = createServices();
  vi.mocked(services.createRegister).mockResolvedValue({ kind: "ok" });
  const onCreated = vi.fn();
  const { dialog } = await renderModal(services, { onCreated });

  await submitName(dialog, "Caja 3");

  await expect.poll(() => onCreated.mock.calls.length).toBe(1);
  expect(services.createRegister).toHaveBeenCalledWith({ name: "Caja 3" });
});

test("requires a name before submitting the create modal, without calling the API", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: "Crear la caja" }));

  await expect.element(dialog.getByText("Ingresá el nombre de la caja.")).toBeVisible();
  expect(services.createRegister).not.toHaveBeenCalled();
});

test("shows the name-too-long error on create, without calling the API", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);

  await submitName(dialog, "a".repeat(101));

  await expect
    .element(dialog.getByText("El nombre puede tener hasta 100 caracteres."))
    .toBeVisible();
  expect(services.createRegister).not.toHaveBeenCalled();
});

test("reopening the create modal starts from an empty name with no error", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const { screen, dialog } = await renderModal(services, { onClose });
  await submitName(dialog, "  ");
  await expect.element(dialog.getByText("Ingresá el nombre de la caja.")).toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  await screen.rerender(modalFor(services, { open: false, onClose }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();

  await screen.rerender(modalFor(services, { open: true, onClose }));

  const reopened = screen.getByRole("dialog", { name: "Nueva caja" });
  await expect
    .element(reopened.getByRole("textbox", { name: /^Nombre de la caja/ }))
    .toHaveValue("");
  await expect.element(reopened.getByText("Ingresá el nombre de la caja.")).not.toBeInTheDocument();
});

test("shows the server's validation_failed error on create and does not report the register created", async () => {
  const services = createServices();
  vi.mocked(services.createRegister).mockResolvedValue({
    kind: "validation_failed",
    field: "name",
  });
  const onCreated = vi.fn();
  const { dialog } = await renderModal(services, { onCreated });

  await submitName(dialog, "Caja 2");

  await expect.element(dialog.getByText("Revisá el nombre de la caja.")).toBeVisible();
  expect(dialog.getByText("Ingresá el nombre de la caja.").query()).toBeNull();
  await expect.element(dialog).toBeVisible();
  expect(onCreated).not.toHaveBeenCalled();
});

test("shows the attempt-failed notice when the cloud names a field the form does not have", async () => {
  const services = createServices();
  vi.mocked(services.createRegister).mockResolvedValue({
    kind: "validation_failed",
    field: "branch_id",
  });
  const { dialog } = await renderModal(services);

  await submitName(dialog, "Caja 1");

  await expect.element(dialog.getByText("No se pudo crear la caja")).toBeVisible();
  await expect.element(dialog.getByText("Ingresá el nombre de la caja.")).not.toBeInTheDocument();
});

test("shows the name-taken error on create and does not report the register created", async () => {
  const services = createServices();
  vi.mocked(services.createRegister).mockResolvedValue({ kind: "name_taken" });
  const onCreated = vi.fn();
  const { dialog } = await renderModal(services, { onCreated });

  await submitName(dialog, "caja 1");

  await expect.element(dialog.getByText("Ya existe una caja con este nombre.")).toBeVisible();
  await expect.element(dialog).toBeVisible();
  expect(onCreated).not.toHaveBeenCalled();
});

test("shows the rate-limited notice in the create modal", async () => {
  const services = createServices();
  vi.mocked(services.createRegister).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const { dialog } = await renderModal(services);

  await submitName(dialog, "Caja 1");

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("shows the attempt-failed notice in the create modal", async () => {
  const services = createServices();
  vi.mocked(services.createRegister).mockResolvedValue({ kind: "failed" });
  const { dialog } = await renderModal(services);

  await submitName(dialog, "Caja 1");

  await expect.element(dialog.getByText("No se pudo crear la caja")).toBeVisible();
  await expect.element(dialog.getByText("Probá de nuevo.")).toBeVisible();
});

test("navigates to Mi cuenta when creating a register comes back forbidden", async () => {
  window.history.pushState(null, "", "/settings/registers");
  try {
    const services = createServices();
    vi.mocked(services.createRegister).mockResolvedValue({ kind: "forbidden" });
    const { dialog } = await renderModal(services);

    await submitName(dialog, "Caja 1");

    await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  } finally {
    window.history.pushState(null, "", "/");
  }
});

test("ends the session when creating a register finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.createRegister).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal(services, { onSessionEnded });

  await submitName(dialog, "Caja 1");

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("opens the authorization modal on create's authorization_required, then authorizes and retries", async () => {
  const services = createServices();
  vi.mocked(services.createRegister).mockResolvedValueOnce({ kind: "authorization_required" });
  grantAuthorization(services);
  vi.mocked(services.createRegister).mockResolvedValueOnce({ kind: "ok" });
  const onCreated = vi.fn();
  const { screen, dialog } = await renderModal(services, { onCreated });

  await submitName(dialog, "Caja 3");
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();
  await expect
    .element(
      authDialog.getByText("Crear una caja necesita tu autorización. Confirmala con tu passkey."),
    )
    .toBeVisible();

  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => vi.mocked(services.createRegister).mock.calls.length).toBe(2);
  await expect.poll(() => onCreated.mock.calls.length).toBe(1);
  await expect
    .poll(() => screen.getByRole("dialog", { name: "Autorizá este cambio" }).query())
    .toBeNull();
});
