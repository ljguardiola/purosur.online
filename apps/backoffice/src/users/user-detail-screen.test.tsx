import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { lazy } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  createServices,
  DEACTIVATE_USERS_ACCESS,
  deferred,
  type FetchUserOutcome,
  lucia,
  openEditModal,
  renderScreen,
  shiftRole,
} from "./test-support/user-detail-screen";

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
  window.history.pushState(null, "", "/users/user-1");
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
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

test("shows the credential sections between Datos and the deactivate row", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });

  const screen = await renderScreen(services);

  const sections = screen.getByRole("region", { name: "Credenciales" });
  await expect.element(sections).toBeVisible();
  const datos = screen.getByRole("heading", { name: "Datos" }).element();
  const deactivateButton = screen.getByRole("button", { name: "Desactivar a Lucía" });
  await expect.element(deactivateButton).toBeVisible();
  const deactivate = deactivateButton.element();
  expect(datos.compareDocumentPosition(sections.element())).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(sections.element().compareDocumentPosition(deactivate)).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
});

test("hands the credential sections the user, once loaded, with their removal answer and the data's status", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Usuario user-1")).toBeVisible();
  await expect.element(screen.getByText("Nombre Lucía")).toBeVisible();
  await expect.element(screen.getByText("Estado loaded")).toBeVisible();
  await expect.element(screen.getByText("Baja de passkeys permitida")).toBeVisible();
});

test("shows a loading placeholder where the credential sections go while their code downloads", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const downloading = lazy(() => new Promise<{ default: () => null }>(() => {}));

  const screen = await renderScreen(
    services,
    () => {},
    "user-1",
    "admin-1",
    undefined,
    downloading,
  );

  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
});

test("asks for the Passkeys section from an Administrator, without waiting for the user to load", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Con passkeys")).toBeVisible();
  await expect.element(screen.getByText("Nombre sin cargar")).toBeVisible();
  await expect.element(screen.getByText("Estado loading")).toBeVisible();
  expect(screen.getByRole("button", { name: "Editar" }).query()).toBeNull();
});

test("asks for no Passkeys section for a non-Administrator, and hides Editar", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({
    kind: "ok",
    value: { ...lucia, mayEdit: false, mayRemovePasskey: false },
  });

  const screen = await renderScreen(
    services,
    () => {},
    "user-1",
    "user-2",
    DEACTIVATE_USERS_ACCESS,
  );

  await expect.element(screen.getByRole("button", { name: "Desactivar a Lucía" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Editar" }).query()).toBeNull();
  await expect.element(screen.getByText("Sin passkeys")).toBeVisible();
  expect(window.location.pathname).toBe("/");
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

  await expect.element(screen.getByText("lucia.perez@purosur.online")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Editar" })).toBeEnabled();
});

test("reads the user again when the credential sections report it outdated", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Usuario desactualizado" }));

  await expect.poll(() => vi.mocked(services.fetchUser).mock.calls.length).toBe(2);
});

test("ends the session when the credential sections report it closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Terminar la sesión" }));

  expect(onSessionEnded).toHaveBeenCalledTimes(1);
});

test("follows the user's answers, not the session, for every action an Administrator is offered", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({
    kind: "ok",
    value: {
      ...lucia,
      mayEdit: false,
      mayDeactivate: false,
      mayReactivate: false,
      mayRemovePasskey: false,
    },
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Baja de passkeys no permitida")).toBeVisible();
  expect(screen.getByRole("button", { name: "Editar" }).query()).toBeNull();
  expect(screen.getByRole("button", { name: "Desactivar a Lucía" }).query()).toBeNull();
  expect(screen.getByRole("button", { name: "Reactivar a Lucía" }).query()).toBeNull();
});

test("offers Editar and the passkey removal when the user's answers allow them", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: "Editar" })).toBeVisible();
  await expect.element(screen.getByText("Baja de passkeys permitida")).toBeVisible();
});
