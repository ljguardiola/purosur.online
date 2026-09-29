import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  ADMINISTRATOR_ACCESS,
  createServices,
  DEACTIVATE_USERS_ACCESS,
  deferred,
  type FetchUserOutcome,
  lucia,
  notebook,
  openEditModal,
  openReactivateModal,
  openRemoveModal,
  phone,
  renderScreen,
  shiftRole,
  sofia,
} from "./test-support/user-detail-screen";
import { UserDetailScreen } from "./user-detail-screen";

afterEach(() => {
  window.history.pushState(null, "", "/");
});

test("shows the breadcrumb, heading, and the Datos section's role and email", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Configuración · Usuarios")).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Responsable de turno")).toBeVisible();
  await expect.element(screen.getByText("lucia.perez@purosur.online")).toBeVisible();
  expect(services.fetchUser).toHaveBeenCalledWith("user-1");
});

test("shows a not-found state for a missing or other-branch id, without calling the API twice", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "not_found" });

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("alert")).toHaveTextContent("No encontramos este usuario");
  expect(services.fetchUser).toHaveBeenCalledTimes(1);
});

test("navigates to Mi cuenta when the user read comes back forbidden", async () => {
  window.history.pushState(null, "", "/settings/users/user-1");
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
});

test("shows a load error, and Reintentar loads the user again", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "failed" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir este usuario")).toBeVisible();

  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "ok", value: lucia });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  expect(services.fetchUser).toHaveBeenCalledTimes(2);
});

test("shows a rate-limited notice with the minutes to wait when loading is rate limited", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 120 });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
});

test("ends the session when loading the user finds it closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("has no accessibility violations once loaded, and with the edit modal open", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  await expectNoAccessibilityViolations(document.body);

  await openEditModal(screen);
  await expectNoAccessibilityViolations(document.body);
});

test("lists the user's passkeys with their registration and last-use detail, once Datos loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValue({
    kind: "ok",
    value: [notebook, phone],
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  await expect
    .element(screen.getByText("Registrada el 02/08/2026 · último uso hoy 09:12"))
    .toBeVisible();
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  await expect.element(screen.getByText("Registrada el 10/08/2026")).toBeVisible();
  expect(services.fetchUserPasskeys).toHaveBeenCalledWith("user-1");
});

test("shows a minimal empty state when the user has no passkeys, without the single-passkey account notice", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValue({ kind: "ok", value: [] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No tiene ninguna passkey registrada.")).toBeVisible();
  expect(screen.getByRole("alert").query()).toBeNull();
});

test("shows a load error with a retry action when the passkeys fail to load, without affecting Datos", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValueOnce({ kind: "failed" });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir las passkeys")).toBeVisible();
  await expect.element(screen.getByText("Responsable de turno")).toBeVisible();

  vi.mocked(services.fetchUserPasskeys).mockResolvedValueOnce({ kind: "ok", value: [notebook] });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  expect(services.fetchUser).toHaveBeenCalledTimes(1);
});

test("shows a rate-limited notice for the passkeys list", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("ends the session when the passkeys list finds it closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the passkeys list comes back forbidden", async () => {
  window.history.pushState(null, "", "/settings/users/user-1");
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
});

test("shows no remove button on the signed-in Administrator's own passkeys", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValue({
    kind: "ok",
    value: [notebook, phone],
  });

  const screen = await renderScreen(services, () => {}, "user-1", "user-1");

  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  expect(
    screen.getByRole("button", { name: `Dar de baja la passkey «${notebook.name}»` }).query(),
  ).toBeNull();
});

test("shows no remove button on the Administrator's own passkeys when the id arrives in another case", async () => {
  const signedInUserId = "3f2b8c1e-9d4a-4e6b-8a7c-1b2d3e4f5a6b";
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({
    kind: "ok",
    value: { ...lucia, id: signedInUserId },
  });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValue({
    kind: "ok",
    value: [notebook, phone],
  });

  const screen = await renderScreen(
    services,
    () => {},
    signedInUserId.toUpperCase(),
    signedInUserId,
  );

  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  expect(
    screen.getByRole("button", { name: `Dar de baja la passkey «${notebook.name}»` }).query(),
  ).toBeNull();
});

test("shows the only-passkey sentence only when it is the user's last passkey", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();

  const dialog = await openRemoveModal(screen, "Notebook del local");

  await expect
    .element(
      dialog.getByText(
        "«Notebook del local» deja de servir para entrar. Es su única passkey: para volver a entrar, Lucía va a tener que pedir el enlace de recuperación por correo.",
      ),
    )
    .toBeVisible();
});

test("removes a passkey directly, without the authorization modal, reading the list again from the server", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys)
    .mockResolvedValueOnce({ kind: "ok", value: [notebook, phone] })
    .mockResolvedValueOnce({ kind: "ok", value: [phone] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  vi.mocked(services.removeUserPasskey).mockResolvedValue({ kind: "ok" });
  const dialog = await openRemoveModal(screen, "Notebook del local");

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect.poll(() => vi.mocked(services.removeUserPasskey).mock.calls.length).toBe(1);
  expect(services.removeUserPasskey).toHaveBeenCalledWith("user-1", "pk-1");
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => screen.getByText("Notebook del local").query()).toBeNull();
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  expect(services.fetchUserPasskeys).toHaveBeenCalledTimes(2);
  expect(services.fetchUser).toHaveBeenCalledTimes(2);
});

test("has no accessibility violations with the passkeys section loaded and the remove modal open", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValue({
    kind: "ok",
    value: [notebook, phone],
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  await expectNoAccessibilityViolations(document.body);

  await openRemoveModal(screen, "Notebook del local");
  await expectNoAccessibilityViolations(document.body);
});

test("hides Editar and the whole Passkeys section for a non-Administrator, never reading the passkeys", async () => {
  window.history.pushState(null, "", "/settings/users/user-1");
  const services = createServices({
    fetchUserPasskeys: vi.fn().mockResolvedValue({ kind: "forbidden" }),
  });
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });

  const screen = await renderScreen(
    services,
    () => {},
    "user-1",
    "user-2",
    DEACTIVATE_USERS_ACCESS,
  );

  await expect.element(screen.getByRole("button", { name: "Desactivar a Lucía" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Editar" }).query()).toBeNull();
  expect(screen.getByRole("heading", { name: "Passkeys" }).query()).toBeNull();
  expect(services.fetchUserPasskeys).not.toHaveBeenCalled();
  expect(window.location.pathname).toBe("/settings/users/user-1");
});

test("dates each passkey's last use against the time the passkeys were last loaded", async () => {
  const services = createServices();
  let current = new Date("2026-09-23T12:00:00.000Z");
  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "ok", value: sofia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  vi.mocked(services.reactivateUser).mockResolvedValue({ kind: "ok" });
  const screen = await render(
    <main>
      <UserDetailScreen
        userId="user-5"
        signedInUserId="admin-1"
        access={ADMINISTRATOR_ACCESS}
        now={() => current}
        services={services}
        onSessionEnded={() => {}}
      />
    </main>,
  );
  await expect
    .element(screen.getByText("Registrada el 02/08/2026 · último uso hoy 09:12"))
    .toBeVisible();

  current = new Date("2026-09-24T12:00:00.000Z");
  vi.mocked(services.fetchUser).mockResolvedValueOnce({
    kind: "ok",
    value: { ...sofia, active: true },
  });
  const dialog = await openReactivateModal(screen);
  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));

  await expect
    .element(screen.getByText("Registrada el 02/08/2026 · último uso el 23/09/2026 09:12"))
    .toBeVisible();
});

test("dates each passkey's last use against the time the list was read again after a removal", async () => {
  const services = createServices();
  let current = new Date("2026-09-23T12:00:00.000Z");
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys)
    .mockResolvedValueOnce({ kind: "ok", value: [notebook, phone] })
    .mockResolvedValueOnce({ kind: "ok", value: [notebook] });
  vi.mocked(services.removeUserPasskey).mockResolvedValue({ kind: "ok" });
  const screen = await render(
    <main>
      <UserDetailScreen
        userId="user-1"
        signedInUserId="admin-1"
        access={ADMINISTRATOR_ACCESS}
        now={() => current}
        services={services}
        onSessionEnded={() => {}}
      />
    </main>,
  );
  await expect
    .element(screen.getByText("Registrada el 02/08/2026 · último uso hoy 09:12"))
    .toBeVisible();

  current = new Date("2026-09-24T12:00:00.000Z");
  const dialog = await openRemoveModal(screen, "Teléfono de Lucía");
  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect
    .element(screen.getByText("Registrada el 02/08/2026 · último uso el 23/09/2026 09:12"))
    .toBeVisible();
  expect(services.fetchUserPasskeys).toHaveBeenCalledTimes(2);
});

test("while the user loads, shows a loading placeholder, keeps Editar disabled and reads the passkeys without waiting for the user", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("status").first()).toHaveTextContent("Cargando…");
  await expect.element(screen.getByRole("button", { name: "Editar" })).toBeDisabled();
  await expect.poll(() => vi.mocked(services.fetchUserPasskeys).mock.calls.length).toBe(1);
  expect(services.fetchUserPasskeys).toHaveBeenCalledWith("user-1");
});

test("shows the passkeys placeholder while only the passkeys are loading, with Datos already shown", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("lucia.perez@purosur.online")).toBeVisible();
  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
  await expect.element(screen.getByRole("button", { name: "Editar" })).toBeEnabled();
});

test("a failed user read keeps Editar disabled, and Reintentar starts again from the loading placeholder", async () => {
  const services = createServices();
  const retry = deferred<FetchUserOutcome>();
  vi.mocked(services.fetchUser)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir este usuario")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Editar" })).toBeDisabled();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("No pudimos abrir este usuario")).not.toBeInTheDocument();
  await expect.element(screen.getByRole("status").first()).toHaveTextContent("Cargando…");
  await expect.element(screen.getByRole("button", { name: "Editar" })).toBeDisabled();
  retry.resolve({ kind: "ok", value: lucia });
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Editar" })).toBeEnabled();
});

test("a failed roles read fails the Datos section too, and Reintentar reads the roles again", async () => {
  const services = createServices({
    fetchRoles: vi.fn().mockResolvedValueOnce({ kind: "failed" }),
  });
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir este usuario")).toBeVisible();

  vi.mocked(services.fetchRoles).mockResolvedValueOnce({ kind: "ok", value: [shiftRole] });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  expect(services.fetchUser).toHaveBeenCalledTimes(1);
});
