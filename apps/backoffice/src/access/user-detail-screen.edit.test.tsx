import { useEffect } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { useRefreshAccess } from "./access-queries";
import {
  ADMINISTRATOR_ACCESS,
  createServices,
  deferred,
  type FetchUserOutcome,
  type FetchUserPasskeysOutcome,
  lucia,
  NOW,
  notebook,
  openEditModal,
  openStaleModal,
  phone,
  renderScreen,
} from "./test-support/user-detail-screen";
import { UserDetailScreen } from "./user-detail-screen";
import type { BranchUser } from "./users-api";

afterEach(() => {
  window.history.pushState(null, "", "/");
});

test("shows the load failure when Recargar cannot read the user, and Reintentar reads again without reopening the modal", async () => {
  const services = createServices();
  const { screen } = await openStaleModal(services);

  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "failed" });
  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Recargar" }));

  await expect.element(screen.getByText("No pudimos abrir este usuario")).toBeVisible();
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "ok", value: lucia });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("shows the rate-limited load failure when Recargar is rate limited", async () => {
  const services = createServices();
  const { screen } = await openStaleModal(services);

  vi.mocked(services.fetchUser).mockResolvedValueOnce({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Recargar" }));

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
});

test("Recargar reads the user again through the cache once, refreshing every access read", async () => {
  const services = createServices();
  const { dialog } = await openStaleModal(services);

  const reloaded: BranchUser = { ...lucia, email: "otra@purosur.online", version: 5 };
  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "ok", value: reloaded });
  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect
    .element(dialog.getByRole("textbox", { name: /^Correo/ }))
    .toHaveValue("otra@purosur.online");
  expect(services.fetchUser).toHaveBeenCalledTimes(2);
  await expect.poll(() => vi.mocked(services.fetchRoles).mock.calls.length).toBe(2);
  await expect.poll(() => vi.mocked(services.fetchUserPasskeys).mock.calls.length).toBe(2);
});

test("shows the screen's not-found state when Recargar finds the user gone", async () => {
  const services = createServices();
  const { screen, dialog } = await openStaleModal(services);

  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "not_found" });
  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByRole("alert")).toHaveTextContent("No encontramos este usuario");
});

test("navigates to Mi cuenta when Recargar comes back forbidden", async () => {
  window.history.pushState(null, "", "/settings/users/user-1");
  const services = createServices();
  const { screen, dialog } = await openStaleModal(services);

  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "forbidden" });
  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
});

test("keeps the loaded screen and an open edit modal with its typed email when the parent re-renders with a new onSessionEnded", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services, () => {});
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openEditModal(screen);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");

  await screen.rerender(
    <main>
      <UserDetailScreen
        userId="user-1"
        signedInUserId="admin-1"
        access={ADMINISTRATOR_ACCESS}
        services={services}
        onSessionEnded={() => {}}
      />
    </main>,
  );

  await expect
    .element(screen.getByRole("dialog").getByRole("textbox", { name: /^Correo/ }))
    .toHaveValue("nueva@purosur.online");
  expect(services.fetchUser).toHaveBeenCalledTimes(1);
});

test("a change refreshes the user, the roles and the passkeys from the server, keeping what is shown and Editar enabled meanwhile", async () => {
  const services = createServices();
  const refreshedUser = deferred<FetchUserOutcome>();
  const refreshedPasskeys = deferred<FetchUserPasskeysOutcome>();
  vi.mocked(services.fetchUser)
    .mockResolvedValueOnce({ kind: "ok", value: lucia })
    .mockReturnValueOnce(refreshedUser.promise);
  vi.mocked(services.fetchUserPasskeys)
    .mockResolvedValueOnce({ kind: "ok", value: [notebook] })
    .mockReturnValueOnce(refreshedPasskeys.promise);
  vi.mocked(services.editUser).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  const dialog = await openEditModal(screen);

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchUser).mock.calls.length).toBe(2);
  await expect.poll(() => vi.mocked(services.fetchRoles).mock.calls.length).toBe(2);
  await expect.poll(() => vi.mocked(services.fetchUserPasskeys).mock.calls.length).toBe(2);
  await expect.element(screen.getByText("lucia.perez@purosur.online")).toBeVisible();
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Editar" })).toBeEnabled();
  refreshedUser.resolve({
    kind: "ok",
    value: { ...lucia, email: "nueva@purosur.online", version: 2 },
  });
  refreshedPasskeys.resolve({ kind: "ok", value: [notebook, phone] });
  await expect.element(screen.getByText("nueva@purosur.online")).toBeVisible();
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
});

function RefreshProbe({ onReady }: { onReady: (refresh: () => Promise<void>) => void }) {
  const refreshAccess = useRefreshAccess();
  useEffect(() => onReady(refreshAccess));
  return null;
}

test("a refresh of the user in the background does not overwrite what is typed in the edit modal", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser)
    .mockResolvedValueOnce({ kind: "ok", value: lucia })
    .mockResolvedValueOnce({
      kind: "ok",
      value: { ...lucia, email: "otra@purosur.online", version: 4 },
    });
  let refreshAccess: () => Promise<void> = () => Promise.resolve();
  const screen = await render(
    <main>
      <RefreshProbe
        onReady={(refresh) => {
          refreshAccess = refresh;
        }}
      />
      <UserDetailScreen
        userId="user-1"
        signedInUserId="admin-1"
        access={ADMINISTRATOR_ACCESS}
        now={NOW}
        services={services}
        onSessionEnded={() => {}}
      />
    </main>,
  );
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openEditModal(screen);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "escrito@purosur.online");

  await refreshAccess();

  await expect.poll(() => vi.mocked(services.fetchUser).mock.calls.length).toBe(2);
  await expect.element(screen.getByText("otra@purosur.online")).toBeVisible();
  await expect
    .element(dialog.getByRole("textbox", { name: /^Correo/ }))
    .toHaveValue("escrito@purosur.online");
});

test("Editar opens the edit modal offering the roles the screen read, and Cancelar closes it", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openEditModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: /^Responsable de turno Rol/ }));
  await expect.element(screen.getByRole("option", { name: "Administrador" })).toBeVisible();
  await expect.element(screen.getByRole("option", { name: "Cajero" })).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.editUser).not.toHaveBeenCalled();
});

test("ends the session when the edit modal's change finds it closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.editUser).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openEditModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
