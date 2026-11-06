import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  createServices,
  lucia,
  openReactivateModal,
  REACTIVATE_USERS_ACCESS,
  renderStatusTab,
  sofia,
} from "./test-support/user-panel";

beforeEach(async () => {
  await page.viewport(1280, 900);
  window.history.pushState(null, "", "/");
});

test("shows the Inactivo state, hides Desactivar, and offers Reactivar, for an inactive user", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: sofia });

  const screen = await renderStatusTab(services);

  await expect.element(screen.getByRole("heading", { name: "Sofía Díaz", level: 2 })).toBeVisible();
  await expect.element(screen.getByText("Inactivo", { exact: true })).toBeVisible();
  expect(screen.getByRole("button", { name: "Desactivar a Sofía Díaz" }).query()).toBeNull();
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

test("shows the Activo state and no Reactivar row for an active user", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });

  const screen = await renderStatusTab(services);

  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 2 })).toBeVisible();
  await expect.element(screen.getByText("Activo", { exact: true })).toBeVisible();
  expect(screen.getByText("Inactivo", { exact: true }).query()).toBeNull();
  expect(screen.getByRole("button", { name: "Reactivar a Lucía" }).query()).toBeNull();
});

test("lets a reactivate-only holder reach an inactive user's Reactivar row, hiding Editar and the credential sections, never reading the roles", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: sofia });

  const screen = await renderStatusTab(
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
  expect(screen.getByRole("tab", { name: "Passkeys y PIN" }).query()).toBeNull();
  expect(services.fetchRoles).not.toHaveBeenCalled();
});

test("hides the Reactivar row when the cloud answers the user may not be reactivated, even for a session holding reactivate_users", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({
    kind: "ok",
    value: { ...sofia, mayReactivate: false },
  });

  const screen = await renderStatusTab(
    services,
    () => {},
    "user-5",
    "user-2",
    REACTIVATE_USERS_ACCESS,
  );

  await expect.element(screen.getByRole("heading", { name: "Sofía Díaz", level: 2 })).toBeVisible();
  expect(screen.getByRole("button", { name: "Reactivar a Sofía Díaz" }).query()).toBeNull();
});

test("treats a reactivation 404 as already resolved, refetching the user", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "ok", value: sofia });
  vi.mocked(services.reactivateUser).mockResolvedValue({ kind: "not_found" });
  const screen = await renderStatusTab(services);
  await expect.element(screen.getByRole("heading", { name: "Sofía Díaz", level: 2 })).toBeVisible();
  const dialog = await openReactivateModal(screen);

  vi.mocked(services.fetchUser).mockResolvedValueOnce({
    kind: "ok",
    value: { ...sofia, active: true, mayDeactivate: true, mayReactivate: false },
  });
  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchUser).mock.calls.length).toBe(2);
  await expect
    .element(screen.getByRole("button", { name: "Desactivar a Sofía Díaz" }))
    .toBeVisible();
  expect(screen.getByText("Inactivo").query()).toBeNull();
});

test("reactivating reads the user and the roles again from the server", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser)
    .mockResolvedValueOnce({ kind: "ok", value: sofia })
    .mockResolvedValueOnce({ kind: "ok", value: { ...sofia, active: true } });
  vi.mocked(services.reactivateUser).mockResolvedValue({ kind: "ok" });
  const screen = await renderStatusTab(services);
  await expect.element(screen.getByRole("heading", { name: "Sofía Díaz", level: 2 })).toBeVisible();
  const dialog = await openReactivateModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));

  await expect.poll(() => vi.mocked(services.fetchUser).mock.calls.length).toBe(2);
  await expect.poll(() => vi.mocked(services.fetchRoles).mock.calls.length).toBe(2);
});

test("Reactivar opens the reactivate modal, and Cancelar closes it", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: sofia });
  const screen = await renderStatusTab(services);
  await expect.element(screen.getByRole("heading", { name: "Sofía Díaz", level: 2 })).toBeVisible();
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
  const screen = await renderStatusTab(services, onSessionEnded);
  await expect.element(screen.getByRole("heading", { name: "Sofía Díaz", level: 2 })).toBeVisible();
  const dialog = await openReactivateModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("has no accessibility violations for an inactive user, and with the reactivate modal open", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: sofia });
  const screen = await renderStatusTab(services);
  await expect.element(screen.getByRole("heading", { name: "Sofía Díaz", level: 2 })).toBeVisible();
  await expectNoAccessibilityViolations(document.body);

  await openReactivateModal(screen);
  await expectNoAccessibilityViolations(document.body);
});
