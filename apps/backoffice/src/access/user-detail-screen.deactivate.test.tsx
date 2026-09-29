import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  adminTarget,
  createServices,
  DEACTIVATE_USERS_ACCESS,
  lucia,
  NO_DEACTIVATE_ACCESS,
  openDeactivateModal,
  REACTIVATE_USERS_ACCESS,
  renderScreen,
} from "./test-support/user-detail-screen";

afterEach(() => {
  window.history.pushState(null, "", "/");
});

test("shows the Desactivar row for an Administrator viewer against a non-Administrator target", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: "Desactivar a Lucía" })).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Al desactivar a Lucía, deja de poder entrar a la caja y al backoffice; su historial queda igual.",
      ),
    )
    .toBeVisible();
});

test("lets a non-Administrator holding deactivate_users deactivate the user, back to Usuarios on success", async () => {
  window.history.pushState(null, "", "/settings/users/user-1");
  const services = createServices({
    fetchUserPasskeys: vi.fn().mockResolvedValue({ kind: "forbidden" }),
  });
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.deactivateUser).mockResolvedValue({ kind: "ok" });

  const screen = await renderScreen(
    services,
    () => {},
    "user-1",
    "user-2",
    DEACTIVATE_USERS_ACCESS,
  );
  const dialog = await openDeactivateModal(screen);
  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.poll(() => vi.mocked(services.deactivateUser).mock.calls.length).toBe(1);
  expect(services.deactivateUser).toHaveBeenCalledWith("user-1");
  await expect.poll(() => window.location.pathname).toBe("/settings/users");
  expect(services.fetchUserPasskeys).not.toHaveBeenCalled();
});

test("hides the Desactivar row on the viewer's own account, even when its id arrives in another case", async () => {
  const signedInUserId = "3f2b8c1e-9d4a-4e6b-8a7c-1b2d3e4f5a6b";
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({
    kind: "ok",
    value: { ...lucia, id: signedInUserId },
  });

  const screen = await renderScreen(
    services,
    () => {},
    signedInUserId.toUpperCase(),
    signedInUserId,
    DEACTIVATE_USERS_ACCESS,
  );

  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  expect(screen.getByRole("button", { name: "Desactivar a Lucía" }).query()).toBeNull();
});

test("hides the Desactivar row for a non-Administrator without deactivate_users", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });

  const screen = await renderScreen(services, () => {}, "user-1", "user-2", NO_DEACTIVATE_ACCESS);

  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  expect(screen.getByRole("button", { name: "Desactivar a Lucía" }).query()).toBeNull();
});

test("hides the Desactivar row against an Administrator target, even for an Administrator viewer", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: adminTarget });

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("heading", { name: "Ana Fernández", level: 1 }))
    .toBeVisible();
  expect(screen.getByRole("button", { name: "Desactivar a Ana Fernández" }).query()).toBeNull();
});

test("while the user loads, shows a disabled Desactivar to someone who may deactivate users", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(
    services,
    () => {},
    "user-1",
    "user-2",
    DEACTIVATE_USERS_ACCESS,
  );

  await expect.element(screen.getByRole("button", { name: "Desactivar" })).toBeDisabled();
});

test("while the user loads, shows a disabled Desactivar to someone who may only reactivate users", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(
    services,
    () => {},
    "user-1",
    "user-2",
    REACTIVATE_USERS_ACCESS,
  );

  await expect.element(screen.getByRole("button", { name: "Desactivar" })).toBeDisabled();
});

test("after the user fails to load, shows Desactivar disabled to someone who may deactivate users", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "failed" });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir este usuario")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Desactivar" })).toBeDisabled();
});

test("while the user loads, shows no Desactivar on the viewer's own account", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services, () => {}, "admin-1", "admin-1");

  await expect.element(screen.getByRole("status").first()).toHaveTextContent("Cargando…");
  expect(screen.getByRole("button", { name: "Desactivar" }).query()).toBeNull();
});

test("while the user loads, shows no Desactivar without deactivate or reactivate permission", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services, () => {}, "user-1", "user-2", NO_DEACTIVATE_ACCESS);

  await expect.element(screen.getByRole("status").first()).toHaveTextContent("Cargando…");
  expect(screen.getByRole("button", { name: "Desactivar" }).query()).toBeNull();
});

test("a deactivation refreshes every access read", async () => {
  window.history.pushState(null, "", "/settings/users/user-1");
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.deactivateUser).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openDeactivateModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.poll(() => vi.mocked(services.fetchRoles).mock.calls.length).toBe(2);
  await expect.poll(() => vi.mocked(services.fetchUserPasskeys).mock.calls.length).toBe(2);
});

test("treats a deactivation 404 as an already-vanished target, reading the user again and showing the not-found state", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser)
    .mockResolvedValueOnce({ kind: "ok", value: lucia })
    .mockResolvedValueOnce({ kind: "not_found" });
  vi.mocked(services.deactivateUser).mockResolvedValue({ kind: "not_found" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openDeactivateModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByRole("alert")).toHaveTextContent("No encontramos este usuario");
});

test("Desactivar opens the deactivate modal, and Cancelar closes it", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openDeactivateModal(screen);
  await expect.element(dialog).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.deactivateUser).not.toHaveBeenCalled();
});

test("ends the session when the deactivate modal's deactivation finds it closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.deactivateUser).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openDeactivateModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
