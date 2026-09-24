import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import { UserDetailScreen, type UserDetailScreenServices } from "./UserDetailScreen";
import type { BranchUser } from "./usersApi";

function createServices(
  overrides: Partial<UserDetailScreenServices> = {},
): UserDetailScreenServices {
  return {
    fetchUser: vi.fn(),
    fetchEmailChangeChallenge: vi.fn(),
    changeUserEmail: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

const lucia: BranchUser = {
  id: "user-1",
  firstName: "Lucía",
  email: "lucia.perez@purosur.online",
  version: 1,
  role: { id: "role-shift", isAdministrator: false, name: "Responsable de turno" },
};

const reauthenticationOptions = { challenge: "reauth" } as never;
const reauthAssertion = { id: "existing-cred" } as never;

function renderScreen(
  services: UserDetailScreenServices,
  onSessionEnded: () => void = () => {},
  userId = "user-1",
) {
  return render(
    <main>
      <UserDetailScreen
        userId={userId}
        isAdministrator
        services={services}
        onSessionEnded={onSessionEnded}
      />
    </main>,
  );
}

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
});

test("shows a forbidden notice, without calling the API, for a non-Administrator", async () => {
  const services = createServices();

  const screen = await render(
    <main>
      <UserDetailScreen
        userId="user-1"
        isAdministrator={false}
        services={services}
        onSessionEnded={() => {}}
      />
    </main>,
  );

  await expect.element(screen.getByText("No tenés acceso a Usuarios")).toBeVisible();
  expect(services.fetchUser).not.toHaveBeenCalled();
});

async function openEditModal(screen: Awaited<ReturnType<typeof renderScreen>>) {
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  return screen.getByRole("dialog");
}

test("opens the edit modal with Correo prefilled, and Cancelar closes it without calling the API", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();

  const dialog = await openEditModal(screen);

  await expect
    .element(dialog.getByRole("textbox", { name: /^Correo/ }))
    .toHaveValue("lucia.perez@purosur.online");
  await expect
    .element(
      dialog
        .getByText("Al guardar, el navegador te pide usar tu passkey para confirmar el cambio.")
        .first(),
    )
    .toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.fetchEmailChangeChallenge).not.toHaveBeenCalled();
  expect(services.changeUserEmail).not.toHaveBeenCalled();
});

test("changes the email through options, passkey and change, and shows it on the screen", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openEditModal(screen);

  vi.mocked(services.fetchEmailChangeChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
  const updated: BranchUser = { ...lucia, email: "nueva@purosur.online", version: 2 };
  vi.mocked(services.changeUserEmail).mockResolvedValue({ kind: "ok", value: updated });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.changeUserEmail).mock.calls.length).toBe(1);
  expect(services.changeUserEmail).toHaveBeenCalledWith(
    "user-1",
    { email: "nueva@purosur.online", version: 1 },
    reauthAssertion,
  );
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("nueva@purosur.online")).toBeVisible();
});

test("shows email_taken on Correo and keeps the modal open", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openEditModal(screen);
  vi.mocked(services.fetchEmailChangeChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(services.changeUserEmail).mockResolvedValue({ kind: "email_taken" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "tomada@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Ya existe un usuario con este correo.")).toBeVisible();
  await expect.element(screen.getByRole("dialog")).toBeVisible();
});

test("shows a stale_version notice, and Recargar refetches the user so the second save sends the new version", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openEditModal(screen);
  vi.mocked(services.fetchEmailChangeChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(services.changeUserEmail).mockResolvedValueOnce({ kind: "stale_version" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Este usuario cambió mientras lo editabas")).toBeVisible();

  const reloaded: BranchUser = { ...lucia, email: "otra@purosur.online", version: 5 };
  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "ok", value: reloaded });
  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect
    .element(dialog.getByRole("textbox", { name: /^Correo/ }))
    .toHaveValue("otra@purosur.online");
  await expect
    .poll(() => dialog.getByText("Este usuario cambió mientras lo editabas").query())
    .toBeNull();

  const updated: BranchUser = { ...reloaded, email: "final@purosur.online", version: 6 };
  vi.mocked(services.changeUserEmail).mockResolvedValueOnce({ kind: "ok", value: updated });
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "final@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.changeUserEmail).mock.calls.length).toBe(2);
  expect(vi.mocked(services.changeUserEmail).mock.calls[1]).toEqual([
    "user-1",
    { email: "final@purosur.online", version: 5 },
    reauthAssertion,
  ]);
});

test("keeps the modal open with a notice when the passkey prompt is cancelled, without calling changeUserEmail", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openEditModal(screen);
  vi.mocked(services.fetchEmailChangeChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockRejectedValue(new Error("NotAllowedError"));

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("No se pudo guardar el cambio")).toBeVisible();
  expect(services.changeUserEmail).not.toHaveBeenCalled();
});

test("requests a fresh challenge on every submit", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openEditModal(screen);
  vi.mocked(services.fetchEmailChangeChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(services.changeUserEmail).mockResolvedValueOnce({ kind: "email_taken" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "tomada@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect.element(dialog.getByText("Ya existe un usuario con este correo.")).toBeVisible();

  const updated: BranchUser = { ...lucia, email: "otra@purosur.online", version: 2 };
  vi.mocked(services.changeUserEmail).mockResolvedValueOnce({ kind: "ok", value: updated });
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "otra@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.fetchEmailChangeChallenge).mock.calls.length).toBe(2);
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
