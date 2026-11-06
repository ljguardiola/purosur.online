import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { lazy } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  createServices,
  DEACTIVATE_USERS_ACCESS,
  deferred,
  type FetchUserOutcome,
  lucia,
  openEditModal,
  renderCredentialsTab,
  renderScreen,
  renderStatusTab,
  shiftRole,
} from "./test-support/user-detail-screen";

beforeEach(async () => {
  await page.viewport(1280, 900);
  window.history.pushState(null, "", "/");
});

test("opens a panel titled with the user's name, showing the Datos tab's role and email", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("complementary", { name: "Lucía" })).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 2 })).toBeVisible();
  await expect.element(screen.getByRole("tab", { name: "Datos", selected: true })).toBeVisible();
  await expect.element(screen.getByText("Responsable de turno")).toBeVisible();
  await expect.element(screen.getByText("lucia.perez@example.com")).toBeVisible();
  expect(services.fetchUser).toHaveBeenCalledWith("user-1");
});

test("shows a not-found state for a missing or other-branch id, without calling the API twice", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "not_found" });

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("alert")).toHaveTextContent("No encontramos este usuario");
  expect(services.fetchUser).toHaveBeenCalledTimes(1);
});

test("opens the own account panel over Inicio when the user read comes back forbidden", async () => {
  window.history.pushState(null, "", "/people/users?user=user-1");
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect
    .poll(() => window.location.pathname + window.location.search)
    .toBe("/?account=credentials");
});

test("shows the tabs Datos, Passkeys y PIN and Estado to an Administrator, with Datos selected by default", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("tab", { name: "Datos", selected: true })).toBeVisible();
  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  await expect.element(screen.getByRole("tab", { name: "Estado" })).toBeVisible();
});

test("selects the tab the URL names, and falls back to Datos for one the person cannot see", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({
    kind: "ok",
    value: { ...lucia, mayEmitPinCode: false },
  });

  const screen = await renderCredentialsTab(
    services,
    () => {},
    "user-1",
    "user-2",
    DEACTIVATE_USERS_ACCESS,
  );

  await expect.element(screen.getByRole("tab", { name: "Datos", selected: true })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Passkeys y PIN" }).query()).toBeNull();
  expect(screen.getByRole("region", { name: "Credenciales" }).query()).toBeNull();
});

test("shows Passkeys y PIN to a person without manage_users once the user answers it may emit a PIN code", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });

  const screen = await renderScreen(
    services,
    () => {},
    "user-1",
    "user-2",
    DEACTIVATE_USERS_ACCESS,
  );

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
});

test("a tab changes the URL's tab, keeping the rest of its search", async () => {
  window.history.pushState(null, "", "/people/users?state=active");
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 2 })).toBeVisible();

  await userEvent.click(screen.getByRole("tab", { name: "Estado" }));

  await expect.poll(() => window.location.search).toContain("tab=status");
  expect(window.location.search).toContain("user=user-1");
  expect(window.location.search).toContain("state=active");
});

test("the panel's close button asks to close it", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const onClose = vi.fn();
  const screen = await renderScreen(
    services,
    () => {},
    "user-1",
    "admin-1",
    undefined,
    undefined,
    onClose,
  );
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 2 })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
});

test("shows a load error, and Reintentar loads the user again", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "failed" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir este usuario")).toBeVisible();

  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "ok", value: lucia });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 2 })).toBeVisible();
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
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 2 })).toBeVisible();
  await expectNoAccessibilityViolations(document.body);

  await openEditModal(screen);
  await expectNoAccessibilityViolations(document.body);
});

test("a failed user read shows no Editar, and Reintentar starts again from the loading placeholder", async () => {
  const services = createServices();
  const retry = deferred<FetchUserOutcome>();
  vi.mocked(services.fetchUser)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir este usuario")).toBeVisible();
  expect(screen.getByRole("button", { name: "Editar" }).query()).toBeNull();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("No pudimos abrir este usuario")).not.toBeInTheDocument();
  await expect.element(screen.getByRole("status").first()).toHaveTextContent("Cargando…");
  expect(screen.getByRole("button", { name: "Editar" }).query()).toBeNull();
  retry.resolve({ kind: "ok", value: lucia });
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 2 })).toBeVisible();
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

  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 2 })).toBeVisible();
  expect(services.fetchUser).toHaveBeenCalledTimes(1);
});

test("shows the credential sections under Passkeys y PIN, away from Datos and Estado", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });

  const screen = await renderCredentialsTab(services);

  await expect.element(screen.getByRole("region", { name: "Credenciales" })).toBeVisible();
  await expect
    .element(screen.getByRole("tab", { name: "Passkeys y PIN", selected: true }))
    .toBeVisible();
  expect(screen.getByRole("button", { name: "Desactivar a Lucía" }).query()).toBeNull();
  expect(screen.getByText("lucia.perez@example.com").query()).toBeNull();
});

test("hands the credential sections the user, once loaded, with their removal answer and the data's status", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });

  const screen = await renderCredentialsTab(services);

  await expect.element(screen.getByText("Usuario user-1")).toBeVisible();
  await expect.element(screen.getByText("Nombre Lucía")).toBeVisible();
  await expect.element(screen.getByText("Estado loaded")).toBeVisible();
  await expect.element(screen.getByText("Baja de passkeys permitida")).toBeVisible();
});

test("shows a loading placeholder where the credential sections go while their code downloads", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const downloading = lazy(() => new Promise<{ default: () => null }>(() => {}));

  const screen = await renderCredentialsTab(
    services,
    () => {},
    "user-1",
    "admin-1",
    undefined,
    downloading,
  );

  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 2 })).toBeVisible();
  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
});

test("asks for the Passkeys section from an Administrator, without waiting for the user to load", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockReturnValue(new Promise(() => {}));

  const screen = await renderCredentialsTab(services);

  await expect.element(screen.getByText("Con passkeys")).toBeVisible();
  await expect.element(screen.getByText("Nombre sin cargar")).toBeVisible();
  await expect.element(screen.getByText("Estado loading")).toBeVisible();
});

test("asks for no Passkeys section for a non-Administrator", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({
    kind: "ok",
    value: { ...lucia, mayEdit: false, mayRemovePasskey: false },
  });

  const screen = await renderCredentialsTab(
    services,
    () => {},
    "user-1",
    "user-2",
    DEACTIVATE_USERS_ACCESS,
  );

  await expect.element(screen.getByText("Sin passkeys")).toBeVisible();
  expect(window.location.pathname).toBe("/");
});

test("hides Editar from a non-Administrator whose user answers it may not be edited", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({
    kind: "ok",
    value: { ...lucia, mayEdit: false },
  });

  const screen = await renderScreen(
    services,
    () => {},
    "user-1",
    "user-2",
    DEACTIVATE_USERS_ACCESS,
  );

  await expect.element(screen.getByText("lucia.perez@example.com")).toBeVisible();
  expect(screen.getByRole("button", { name: "Editar" }).query()).toBeNull();
});

test("shows the loading placeholder and no Editar while the user loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("status").first()).toHaveTextContent("Cargando…");
  expect(screen.getByRole("button", { name: "Editar" }).query()).toBeNull();
});

test("shows Datos and Editar enabled once the user loads, whatever the credential sections are doing", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("lucia.perez@example.com")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Editar" })).toBeEnabled();
});

test("reads the user again when the credential sections report it outdated", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderCredentialsTab(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 2 })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Usuario desactualizado" }));

  await expect.poll(() => vi.mocked(services.fetchUser).mock.calls.length).toBe(2);
});

test("ends the session when the credential sections report it closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const onSessionEnded = vi.fn();
  const screen = await renderCredentialsTab(services, onSessionEnded);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 2 })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Terminar la sesión" }));

  expect(onSessionEnded).toHaveBeenCalledTimes(1);
});

test("follows the user's answers, not the session, for the passkey removal an Administrator is offered", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({
    kind: "ok",
    value: { ...lucia, mayRemovePasskey: false },
  });

  const screen = await renderCredentialsTab(services);

  await expect.element(screen.getByText("Baja de passkeys no permitida")).toBeVisible();
});

test("follows the user's answers, not the session, for Editar an Administrator is offered", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({
    kind: "ok",
    value: { ...lucia, mayEdit: false },
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("lucia.perez@example.com")).toBeVisible();
  expect(screen.getByRole("button", { name: "Editar" }).query()).toBeNull();
});

test("follows the user's answers, not the session, for Desactivar and Reactivar an Administrator is offered", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({
    kind: "ok",
    value: { ...lucia, mayDeactivate: false, mayReactivate: false },
  });

  const screen = await renderStatusTab(services);

  await expect.element(screen.getByText("Activo", { exact: true })).toBeVisible();
  expect(screen.getByRole("button", { name: "Desactivar a Lucía" }).query()).toBeNull();
  expect(screen.getByRole("button", { name: "Reactivar a Lucía" }).query()).toBeNull();
});

test("offers Editar and the passkey removal when the user's answers allow them", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: "Editar" })).toBeVisible();
});
