import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import type { RoleSummary } from "../platform/roles-api";
import { render } from "../shell/test-support/render-with-router";
import { EditUserModal, type EditUserModalServices } from "./edit-user-modal";
import type { BranchUser } from "./users-api";
import type { UserRead } from "./users-queries";

const shiftRole: RoleSummary = {
  id: "00000000-0000-4000-8000-000000000002",
  isAdministrator: false,
  name: "Responsable de turno",
  permissionKeys: [],
  userCount: 1,
  mayEdit: true,
};
const cashierRole: RoleSummary = {
  id: "00000000-0000-4000-8000-000000000003",
  isAdministrator: false,
  name: "Cajero",
  permissionKeys: [],
  userCount: 0,
  mayEdit: true,
};
const administratorRole: RoleSummary = {
  id: "00000000-0000-4000-8000-000000000001",
  isAdministrator: true,
  name: null,
  permissionKeys: [],
  userCount: 1,
  mayEdit: false,
};

const lucia: BranchUser = {
  id: "user-1",
  firstName: "Lucía",
  email: "lucia.perez@purosur.online",
  version: 1,
  role: shiftRole,
  passkeyCount: 1,
  isLastActiveAdministrator: false,
  mayEmitPinCode: true,
  mayEdit: true,
  mayDeactivate: true,
  mayReactivate: false,
  mayRemovePasskey: true,
};

function createServices(overrides: Partial<EditUserModalServices> = {}): EditUserModalServices {
  return {
    editUser: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

const authorizationOptions = { challenge: "session-auth" } as never;
const assertion = { id: "existing-cred" } as never;

function grantAuthorization(services: EditUserModalServices) {
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(assertion);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
}

afterEach(() => {
  window.history.pushState(null, "", "/");
});

type Handlers = {
  onClose?: () => void;
  onSaved?: () => void;
  onSessionEnded?: () => void;
  reload?: (userId: string) => Promise<CloudReadOutcome<UserRead>>;
};

async function renderModal(
  services: EditUserModalServices,
  handlers: Handlers = {},
  user: BranchUser = lucia,
) {
  const screen = await render(
    <main>
      <EditUserModal
        open
        user={user}
        roles={[administratorRole, shiftRole, cashierRole]}
        onClose={handlers.onClose ?? (() => {})}
        onSaved={handlers.onSaved ?? (() => {})}
        onSessionEnded={handlers.onSessionEnded ?? (() => {})}
        reload={handlers.reload ?? vi.fn()}
        services={services}
      />
    </main>,
  );
  return { screen, dialog: screen.getByRole("dialog", { name: user.firstName }) };
}

test("opens with Correo prefilled, with no advance notice about a passkey, and Cancelar calls onClose without calling the API", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const { dialog } = await renderModal(services, { onClose });

  await expect
    .element(dialog.getByRole("textbox", { name: /^Correo/ }))
    .toHaveValue("lucia.perez@purosur.online");
  await expect
    .element(dialog.getByRole("button", { name: /^Responsable de turno Rol/ }))
    .toBeVisible();
  expect(
    dialog
      .getByText("Al guardar, el navegador te pide usar tu passkey para confirmar el cambio.")
      .query(),
  ).toBeNull();

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => onClose.mock.calls.length).toBe(1);
  expect(services.editUser).not.toHaveBeenCalled();
});

test("lists every role and lets picking a different one change the Rol selector's value", async () => {
  const services = createServices();
  const { screen, dialog } = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: /^Responsable de turno Rol/ }));
  await expect.element(screen.getByRole("option", { name: "Administrador" })).toBeVisible();
  await expect.element(screen.getByRole("option", { name: "Cajero" })).toBeVisible();
  await userEvent.click(screen.getByRole("option", { name: "Cajero" }));

  await expect.element(dialog.getByRole("button", { name: /^Cajero Rol/ })).toBeVisible();
});

test("saves the newly picked role together with the email", async () => {
  const services = createServices();
  const onSaved = vi.fn();
  const { screen, dialog } = await renderModal(services, { onSaved });
  vi.mocked(services.editUser).mockResolvedValue({ kind: "ok" });

  await userEvent.click(dialog.getByRole("button", { name: /^Responsable de turno Rol/ }));
  await userEvent.click(screen.getByRole("option", { name: "Cajero" }));
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editUser).mock.calls.length).toBe(1);
  expect(services.editUser).toHaveBeenCalledWith("user-1", {
    email: "lucia.perez@purosur.online",
    role_id: "00000000-0000-4000-8000-000000000003",
    version: 1,
  });
  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
});

const lastAdministratorReason =
  "Es el único Administrador activo. Para cambiarle el rol, primero hacé Administrador a otra persona.";

function openLastAdministratorEditModal() {
  const lastAdmin: BranchUser = {
    ...lucia,
    role: administratorRole,
    isLastActiveAdministrator: true,
    mayEmitPinCode: true,
    mayEdit: true,
    mayDeactivate: true,
    mayReactivate: false,
    mayRemovePasskey: true,
  };
  return renderModal(createServices(), {}, lastAdmin);
}

test("shows the last active Administrator's Rol as a read-only field with no button, described by why it is fixed", async () => {
  const { dialog } = await openLastAdministratorEditModal();

  expect(dialog.getByRole("combobox", { name: /Rol$/ }).query()).toBeNull();
  const rol = dialog.getByRole("textbox", { name: "Rol" });
  await expect.element(rol).toHaveValue("Administrador");
  await expect.element(rol).toHaveAttribute("readonly");
  await expect.element(rol).toHaveAccessibleDescription(lastAdministratorReason);
  const box = (rol.element() as HTMLElement).parentElement as HTMLElement;
  expect(box.querySelector("button")).toBeNull();
});

test("opens the last active Administrator's explanation when the Rol field is hovered", async () => {
  const { screen, dialog } = await openLastAdministratorEditModal();

  // Wider than the default phone-sized browser-mode viewport, or the field is unhoverable.
  await page.viewport(1280, 900);
  onTestFinished(() => page.viewport(414, 896));
  await userEvent.hover(dialog.getByRole("textbox", { name: "Rol" }));
  await expect.element(screen.getByRole("tooltip")).toBeVisible();
  await expect.element(screen.getByRole("tooltip")).toHaveTextContent(lastAdministratorReason);
});

test("opens the last active Administrator's explanation when the Rol field is focused with the keyboard", async () => {
  const { screen, dialog } = await openLastAdministratorEditModal();

  await page.viewport(1280, 900);
  onTestFinished(() => page.viewport(414, 896));
  const rol = dialog.getByRole("textbox", { name: "Rol" });
  for (let presses = 0; presses < 10 && document.activeElement !== rol.element(); presses++) {
    await userEvent.tab();
  }
  expect(document.activeElement).toBe(rol.element());
  await expect.element(screen.getByRole("tooltip")).toBeVisible();
  await expect.element(screen.getByRole("tooltip")).toHaveTextContent(lastAdministratorReason);
});

test("shows a last_administrator notice with a reload action when the server still refuses the role change", async () => {
  const services = createServices();
  const { screen, dialog } = await renderModal(services);
  vi.mocked(services.editUser).mockResolvedValue({ kind: "last_administrator" });

  await userEvent.click(dialog.getByRole("button", { name: /^Responsable de turno Rol/ }));
  await userEvent.click(screen.getByRole("option", { name: "Cajero" }));
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Ahora es el único Administrador activo")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Recargar" })).toBeVisible();
});

test("shows the role the cloud refused on Rol, not as a notice", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);
  vi.mocked(services.editUser).mockResolvedValue({ kind: "validation_failed", field: "role_id" });

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect
    .element(dialog.getByText("Ese rol ya no está disponible. Elegí otro."))
    .toBeVisible();
  expect(dialog.getByText("No se pudo guardar el cambio").query()).toBeNull();
});

test("rejects an email longer than any address can be, without calling the API", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);

  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Correo/ }),
    `${"a".repeat(250)}@purosur.online`,
  );
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Ingresá un correo válido.")).toBeVisible();
  expect(services.editUser).not.toHaveBeenCalled();
});

test("shows the generic failure notice when the cloud refuses a field the form does not have", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);
  vi.mocked(services.editUser).mockResolvedValue({ kind: "validation_failed", field: "other" });

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("No se pudo guardar el cambio")).toBeVisible();
});

test("shows no helper line under Correo in the edit modal", async () => {
  const { dialog } = await renderModal(createServices());

  await expect
    .element(dialog.getByRole("textbox", { name: /^Correo/ }))
    .not.toHaveAccessibleDescription();
});

test("changes the email directly, without the authorization modal, when the session already has one", async () => {
  const services = createServices();
  const onSaved = vi.fn();
  const { screen, dialog } = await renderModal(services, { onSaved });
  vi.mocked(services.editUser).mockResolvedValue({ kind: "ok" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editUser).mock.calls.length).toBe(1);
  expect(services.editUser).toHaveBeenCalledWith("user-1", {
    email: "nueva@purosur.online",
    role_id: "00000000-0000-4000-8000-000000000002",
    version: 1,
  });
  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
  expect(screen.getByRole("dialog", { name: "Autorizá este cambio" }).query()).toBeNull();
});

test("opens the authorization modal on authorization_required, then authorizes and retries the change", async () => {
  const services = createServices();
  const onSaved = vi.fn();
  const { screen, dialog } = await renderModal(services, { onSaved });
  vi.mocked(services.editUser).mockResolvedValueOnce({ kind: "authorization_required" });
  grantAuthorization(services);
  vi.mocked(services.editUser).mockResolvedValueOnce({ kind: "ok" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();
  await expect
    .element(
      authDialog.getByText(
        "Editar un usuario necesita tu autorización. Confirmala con tu passkey.",
      ),
    )
    .toBeVisible();

  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => vi.mocked(services.editUser).mock.calls.length).toBe(2);
  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
  await expect
    .poll(() => screen.getByRole("dialog", { name: "Autorizá este cambio" }).query())
    .toBeNull();
});

test("cancelling the authorization modal keeps the edit modal open with its typed value, with no error", async () => {
  const services = createServices();
  const { screen, dialog } = await renderModal(services);
  vi.mocked(services.editUser).mockResolvedValue({ kind: "authorization_required" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();

  await userEvent.click(authDialog.getByRole("button", { name: "Cancelar" }));

  await expect
    .poll(() => screen.getByRole("dialog", { name: "Autorizá este cambio" }).query())
    .toBeNull();
  await expect.element(screen.getByRole("dialog", { name: "Lucía" })).toBeVisible();
  await expect
    .element(screen.getByRole("textbox", { name: /^Correo/ }))
    .toHaveValue("nueva@purosur.online");
  expect(screen.getByText("No se pudo guardar el cambio").query()).toBeNull();
  expect(services.editUser).toHaveBeenCalledTimes(1);
});

test("shows email_taken on Correo and keeps the modal open", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const { dialog } = await renderModal(services, { onClose, onSaved });
  vi.mocked(services.editUser).mockResolvedValue({ kind: "email_taken" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "tomada@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Ya existe un usuario con este correo.")).toBeVisible();
  expect(onClose).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();
});

test("shows an error inside the authorization modal, not calling editUser again, when the browser cancels the passkey ceremony", async () => {
  const services = createServices();
  const { screen, dialog } = await renderModal(services);
  vi.mocked(services.editUser).mockResolvedValue({ kind: "authorization_required" });
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockRejectedValue(new Error("NotAllowedError"));

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.element(authDialog.getByText("No se pudo confirmar con tu passkey")).toBeVisible();
  expect(services.editUser).toHaveBeenCalledTimes(1);
});

test("ends the session when authorizing the email change finds it closed", async () => {
  const services = createServices();
  const onSessionEnded = vi.fn();
  const { screen, dialog } = await renderModal(services, { onSessionEnded });
  vi.mocked(services.editUser).mockResolvedValue({ kind: "authorization_required" });
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "unauthenticated",
  });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("ends the session when the change itself finds it closed", async () => {
  const services = createServices();
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal(services, { onSessionEnded });
  vi.mocked(services.editUser).mockResolvedValue({ kind: "unauthenticated" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta, without the authorization modal, when the email change comes back forbidden", async () => {
  window.history.pushState(null, "", "/users/user-1");
  const services = createServices();
  const { dialog } = await renderModal(services);
  vi.mocked(services.editUser).mockResolvedValue({ kind: "forbidden" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => window.location.pathname).toBe("/account");
  expect(services.fetchSessionAuthorizationOptions).not.toHaveBeenCalled();
});

test("navigates to Mi cuenta when the email change retried after the authorization comes back forbidden", async () => {
  window.history.pushState(null, "", "/users/user-1");
  const services = createServices();
  const { screen, dialog } = await renderModal(services);
  vi.mocked(services.editUser).mockResolvedValueOnce({ kind: "authorization_required" });
  grantAuthorization(services);
  vi.mocked(services.editUser).mockResolvedValueOnce({ kind: "forbidden" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Autorizá este cambio" })
      .getByRole("button", { name: "Usar mi passkey" }),
  );

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("shows a rate-limited notice when the change is rate limited", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);
  vi.mocked(services.editUser).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
});

test("shows a server-rejected email on Correo", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);
  vi.mocked(services.editUser).mockResolvedValue({
    kind: "validation_failed",
    field: "email",
  });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Revisá el correo.")).toBeVisible();
});

test("shows a server-rejected version as a failed notice, leaving Correo without an error", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);
  vi.mocked(services.editUser).mockResolvedValue({
    kind: "validation_failed",
    field: "version",
  });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("No se pudo guardar el cambio")).toBeVisible();
  await expect
    .element(dialog.getByRole("textbox", { name: /^Correo/ }))
    .not.toHaveAttribute("aria-invalid", "true");
});

test("shows a stale_version notice, and Recargar refetches the user so the second save sends the new version", async () => {
  const services = createServices();
  const reload = vi.fn<(userId: string) => Promise<CloudReadOutcome<UserRead>>>();
  const { dialog } = await renderModal(services, { reload });
  vi.mocked(services.editUser).mockResolvedValueOnce({ kind: "stale_version" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Este usuario cambió mientras lo editabas")).toBeVisible();

  const reloaded: BranchUser = { ...lucia, email: "otra@purosur.online", version: 5 };
  reload.mockResolvedValueOnce({ kind: "ok", value: { kind: "found", user: reloaded } });
  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  expect(reload).toHaveBeenCalledWith("user-1");
  await expect
    .element(dialog.getByRole("textbox", { name: /^Correo/ }))
    .toHaveValue("otra@purosur.online");
  await expect
    .poll(() => dialog.getByText("Este usuario cambió mientras lo editabas").query())
    .toBeNull();

  vi.mocked(services.editUser).mockResolvedValueOnce({ kind: "ok" });
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "final@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editUser).mock.calls.length).toBe(2);
  expect(vi.mocked(services.editUser).mock.calls[1]).toEqual([
    "user-1",
    { email: "final@purosur.online", role_id: "00000000-0000-4000-8000-000000000002", version: 5 },
  ]);
});

test("disables Recargar and Guardar while the reload is pending", async () => {
  const services = createServices();
  const reload = vi.fn().mockReturnValue(new Promise(() => {}));
  const { dialog } = await renderModal(services, { reload });
  vi.mocked(services.editUser).mockResolvedValueOnce({ kind: "stale_version" });
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect.element(dialog.getByText("Este usuario cambió mientras lo editabas")).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect.element(dialog.getByRole("button", { name: "Recargar" })).toBeDisabled();
  await expect.element(dialog.getByRole("button", { name: "Guardar los cambios" })).toBeDisabled();
});
