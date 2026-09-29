import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  createServices,
  lucia,
  NO_DEACTIVATE_ACCESS,
  notebook,
  openReactivateModal,
  REACTIVATE_USERS_ACCESS,
  renderScreen,
  sofia,
} from "./test-support/user-detail-screen";

afterEach(() => {
  window.history.pushState(null, "", "/");
});

test("shows the Inactivo tag, hides Editar, Desactivar and passkey removal, and offers Reactivar, for an inactive user", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: sofia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("heading", { name: "Sofía Díaz", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Inactivo")).toBeVisible();
  expect(screen.getByRole("button", { name: "Editar" }).query()).toBeNull();
  expect(screen.getByRole("button", { name: "Desactivar a Sofía Díaz" }).query()).toBeNull();
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Dar de baja la passkey «Notebook del local»" }).query(),
  ).toBeNull();
  await expect
    .element(screen.getByRole("button", { name: "Reactivar a Sofía Díaz" }))
    .toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Al reactivar a Sofía Díaz, vuelve a entrar a la caja y al backoffice con su misma cuenta: mismo correo, rol y passkeys.",
      ),
    )
    .toBeVisible();
});

test("shows no Inactivo tag and no Reactivar row for an active user", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  expect(screen.getByText("Inactivo").query()).toBeNull();
  expect(screen.getByRole("button", { name: "Reactivar a Lucía" }).query()).toBeNull();
});

test("lets a reactivate-only holder reach an inactive user's Reactivar row, hiding Editar and Passkeys, never reading roles or passkeys", async () => {
  window.history.pushState(null, "", "/settings/users/user-5");
  const services = createServices({
    fetchUserPasskeys: vi.fn().mockResolvedValue({ kind: "forbidden" }),
  });
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: sofia });

  const screen = await renderScreen(
    services,
    () => {},
    "user-5",
    "user-2",
    REACTIVATE_USERS_ACCESS,
  );

  await expect
    .element(screen.getByRole("button", { name: "Reactivar a Sofía Díaz" }))
    .toBeVisible();
  expect(screen.getByRole("button", { name: "Editar" }).query()).toBeNull();
  expect(screen.getByRole("heading", { name: "Passkeys" }).query()).toBeNull();
  expect(services.fetchRoles).not.toHaveBeenCalled();
  expect(services.fetchUserPasskeys).not.toHaveBeenCalled();
});

test("hides the Reactivar row for a non-Administrator without reactivate_users", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: sofia });

  const screen = await renderScreen(services, () => {}, "user-5", "user-2", NO_DEACTIVATE_ACCESS);

  await expect.element(screen.getByRole("heading", { name: "Sofía Díaz", level: 1 })).toBeVisible();
  expect(screen.getByRole("button", { name: "Reactivar a Sofía Díaz" }).query()).toBeNull();
});

test("treats a reactivation 404 as already resolved, refetching the user", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "ok", value: sofia });
  vi.mocked(services.reactivateUser).mockResolvedValue({ kind: "not_found" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Sofía Díaz", level: 1 })).toBeVisible();
  const dialog = await openReactivateModal(screen);

  vi.mocked(services.fetchUser).mockResolvedValueOnce({
    kind: "ok",
    value: { ...sofia, active: true },
  });
  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchUser).mock.calls.length).toBe(2);
  await expect
    .element(screen.getByRole("button", { name: "Desactivar a Sofía Díaz" }))
    .toBeVisible();
  expect(screen.getByText("Inactivo").query()).toBeNull();
});

test("reactivating reads the user, the roles and the passkeys again from the server", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser)
    .mockResolvedValueOnce({ kind: "ok", value: sofia })
    .mockResolvedValueOnce({ kind: "ok", value: { ...sofia, active: true } });
  vi.mocked(services.reactivateUser).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Sofía Díaz", level: 1 })).toBeVisible();
  const dialog = await openReactivateModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));

  await expect.poll(() => vi.mocked(services.fetchUser).mock.calls.length).toBe(2);
  await expect.poll(() => vi.mocked(services.fetchRoles).mock.calls.length).toBe(2);
  await expect.poll(() => vi.mocked(services.fetchUserPasskeys).mock.calls.length).toBe(2);
});

test("Reactivar opens the reactivate modal, and Cancelar closes it", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: sofia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Sofía Díaz", level: 1 })).toBeVisible();
  const dialog = await openReactivateModal(screen);
  await expect.element(dialog).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.reactivateUser).not.toHaveBeenCalled();
});

test("ends the session when the reactivate modal's reactivation finds it closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: sofia });
  vi.mocked(services.reactivateUser).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  await expect.element(screen.getByRole("heading", { name: "Sofía Díaz", level: 1 })).toBeVisible();
  const dialog = await openReactivateModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("has no accessibility violations for an inactive user, and with the reactivate modal open", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: sofia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Sofía Díaz", level: 1 })).toBeVisible();
  await expectNoAccessibilityViolations(document.body);

  await openReactivateModal(screen);
  await expectNoAccessibilityViolations(document.body);
});
