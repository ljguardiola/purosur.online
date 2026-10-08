import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  createServices,
  lucia,
  notebook,
  openRemoveModal,
  phone,
  renderSections,
} from "./test-support/user-credential-sections";

afterEach(() => {
  window.history.pushState(null, "", "/");
});

test("lists the user's passkeys with their registration and last-use detail", async () => {
  const services = createServices({
    fetchUserPasskeys: vi.fn().mockResolvedValue({ kind: "ok", value: [notebook, phone] }),
  });

  const screen = await renderSections(services);

  await expect.element(screen.getByRole("heading", { name: "Passkeys" })).toBeVisible();
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  await expect
    .element(screen.getByText("Registrada el 02/08/2026 · último uso hoy 09:12"))
    .toBeVisible();
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  await expect.element(screen.getByText("Registrada el 10/08/2026")).toBeVisible();
  expect(services.fetchUserPasskeys).toHaveBeenCalledWith("user-1");
});

test("shows a minimal empty state when the user has no passkeys, without the single-passkey account notice", async () => {
  const screen = await renderSections(createServices());

  await expect.element(screen.getByText("No tiene ninguna passkey registrada.")).toBeVisible();
  expect(screen.getByRole("alert").query()).toBeNull();
});

test("shows a load error with a retry action when the passkeys fail to load", async () => {
  const services = createServices();
  vi.mocked(services.fetchUserPasskeys).mockResolvedValueOnce({ kind: "failed" });

  const screen = await renderSections(services);

  await expect.element(screen.getByText("No pudimos abrir las passkeys")).toBeVisible();
  vi.mocked(services.fetchUserPasskeys).mockResolvedValueOnce({ kind: "ok", value: [notebook] });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
});

test("shows a rate-limited notice for the passkeys list", async () => {
  const services = createServices({
    fetchUserPasskeys: vi.fn().mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 120 }),
  });

  const screen = await renderSections(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("shows the passkeys placeholder while the passkeys are loading", async () => {
  const services = createServices({
    fetchUserPasskeys: vi.fn().mockReturnValue(new Promise(() => {})),
  });

  const screen = await renderSections(services);

  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
});

test("reads the passkeys without waiting for the user to load", async () => {
  const services = createServices();

  await renderSections(services, { user: undefined, dataStatus: "loading" });

  await expect.poll(() => vi.mocked(services.fetchUserPasskeys).mock.calls.length).toBe(1);
  expect(services.fetchUserPasskeys).toHaveBeenCalledWith("user-1");
});

test("ends the session when the passkeys list finds it closed", async () => {
  const services = createServices({
    fetchUserPasskeys: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
  });
  const onSessionEnded = vi.fn();

  await renderSections(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the passkeys list comes back forbidden", async () => {
  const services = createServices({
    fetchUserPasskeys: vi.fn().mockResolvedValue({ kind: "forbidden" }),
  });

  await renderSections(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("shows no remove button when the cloud answers the user's passkeys may not be removed", async () => {
  const services = createServices({
    fetchUserPasskeys: vi.fn().mockResolvedValue({ kind: "ok", value: [notebook, phone] }),
  });

  const screen = await renderSections(services, {
    user: { ...lucia, mayRemovePasskey: false },
  });

  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  expect(
    screen.getByRole("button", { name: `Dar de baja la passkey «${notebook.name}»` }).query(),
  ).toBeNull();
});

test("offers the remove button when the user's answers allow it", async () => {
  const services = createServices({
    fetchUserPasskeys: vi.fn().mockResolvedValue({ kind: "ok", value: [notebook] }),
  });

  const screen = await renderSections(services);

  await expect
    .element(screen.getByRole("button", { name: `Dar de baja la passkey «${notebook.name}»` }))
    .toBeVisible();
});

test("shows no remove button while the user loads", async () => {
  const services = createServices({
    fetchUserPasskeys: vi.fn().mockResolvedValue({ kind: "ok", value: [notebook] }),
  });

  const screen = await renderSections(services, { user: undefined, dataStatus: "loading" });

  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  expect(
    screen.getByRole("button", { name: `Dar de baja la passkey «${notebook.name}»` }).query(),
  ).toBeNull();
});

test("shows no Passkeys section when the screen asks for none", async () => {
  const services = createServices();

  const screen = await renderSections(services, { showsPasskeys: false });

  expect(screen.getByRole("heading", { name: "Passkeys" }).query()).toBeNull();
  expect(services.fetchUserPasskeys).not.toHaveBeenCalled();
});

test("a passkey's remove action opens the remove modal, without the only-passkey sentence when the user has more, and Cancelar closes it", async () => {
  const services = createServices({
    fetchUserPasskeys: vi.fn().mockResolvedValue({ kind: "ok", value: [notebook, phone] }),
  });
  const screen = await renderSections(services);
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();

  const dialog = await openRemoveModal(screen, "Notebook del local");

  await expect
    .element(dialog.getByText("«Notebook del local» deja de servir para entrar."))
    .toBeVisible();
  expect(dialog.getByText(/Es su única passkey/).query()).toBeNull();
  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.removeUserPasskey).not.toHaveBeenCalled();
});

test("shows the only-passkey sentence only when it is the user's last passkey", async () => {
  const services = createServices({
    fetchUserPasskeys: vi.fn().mockResolvedValue({ kind: "ok", value: [notebook] }),
  });
  const screen = await renderSections(services);
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

test("removes a passkey directly, without the authorization modal, reading the list again and reporting the user outdated", async () => {
  const services = createServices();
  vi.mocked(services.fetchUserPasskeys)
    .mockResolvedValueOnce({ kind: "ok", value: [notebook, phone] })
    .mockResolvedValueOnce({ kind: "ok", value: [phone] });
  vi.mocked(services.removeUserPasskey).mockResolvedValue({ kind: "ok" });
  const onUserOutdated = vi.fn();
  const screen = await renderSections(services, { onUserOutdated });
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  const dialog = await openRemoveModal(screen, "Notebook del local");

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect.poll(() => vi.mocked(services.removeUserPasskey).mock.calls.length).toBe(1);
  expect(services.removeUserPasskey).toHaveBeenCalledWith("user-1", "pk-1");
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => screen.getByText("Notebook del local").query()).toBeNull();
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  expect(services.fetchUserPasskeys).toHaveBeenCalledTimes(2);
  expect(onUserOutdated).toHaveBeenCalledTimes(1);
});

test("ends the session when the remove modal's removal finds it closed", async () => {
  const services = createServices({
    fetchUserPasskeys: vi.fn().mockResolvedValue({ kind: "ok", value: [notebook] }),
    removeUserPasskey: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
  });
  const onSessionEnded = vi.fn();
  const screen = await renderSections(services, { onSessionEnded });
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  const dialog = await openRemoveModal(screen, "Notebook del local");

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("dates each passkey's last use against the time the passkeys were last loaded", async () => {
  let current = new Date("2026-09-23T12:00:00.000Z");
  const services = createServices();
  vi.mocked(services.fetchUserPasskeys)
    .mockResolvedValueOnce({ kind: "ok", value: [notebook, phone] })
    .mockResolvedValueOnce({ kind: "ok", value: [notebook] });
  vi.mocked(services.removeUserPasskey).mockResolvedValue({ kind: "ok" });
  const screen = await renderSections(services, { now: () => current });
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

test("has no accessibility violations with the passkeys section loaded and the remove modal open", async () => {
  const services = createServices({
    fetchUserPasskeys: vi.fn().mockResolvedValue({ kind: "ok", value: [notebook, phone] }),
  });
  const screen = await renderSections(services);
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  await expectNoAccessibilityViolations(document.body);

  await openRemoveModal(screen, "Notebook del local");
  await expectNoAccessibilityViolations(document.body);
});

test("shows the PIN section after the passkeys, with its reset action", async () => {
  const screen = await renderSections(createServices(), { showsPin: true });

  await expect.element(screen.getByRole("heading", { name: "PIN de la caja" })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Reiniciar el PIN" })).toBeVisible();
  const headings = screen.getByRole("heading", { level: 2 }).elements();
  expect(headings.map((heading) => heading.textContent)).toEqual(["Passkeys", "PIN de la caja"]);
});

test("shows only the PIN section when the screen asks for no Passkeys", async () => {
  const services = createServices();

  const screen = await renderSections(services, { showsPasskeys: false, showsPin: true });

  await expect.element(screen.getByRole("heading", { name: "PIN de la caja" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Passkeys" }).query()).toBeNull();
  expect(services.fetchUserPasskeys).not.toHaveBeenCalled();
});

test("shows no PIN section when the screen asks for none", async () => {
  const screen = await renderSections(createServices());

  await expect.element(screen.getByRole("heading", { name: "Passkeys" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "PIN de la caja" }).query()).toBeNull();
});

test("Reiniciar el PIN emits a code for the shown user and opens its modal", async () => {
  const services = createServices({
    emitUserPinCode: vi.fn().mockResolvedValue({
      kind: "ok",
      value: { code: "K7QM2XPA7DTR4HWN", expiresAt: "2026-09-30T12:15:00.000Z" },
    }),
  });
  const screen = await renderSections(services, { showsPasskeys: false, showsPin: true });

  await userEvent.click(screen.getByRole("button", { name: "Reiniciar el PIN" }));

  const dialog = screen.getByRole("dialog", { name: "Código para reiniciar el PIN" });
  await expect.element(dialog.getByText("K7QM 2XPA 7DTR 4HWN")).toBeVisible();
  expect(services.emitUserPinCode).toHaveBeenCalledExactlyOnceWith("user-1");
});

test("disables Reiniciar el PIN while the screen's data loads", async () => {
  const screen = await renderSections(createServices(), {
    showsPasskeys: false,
    showsPin: true,
    user: undefined,
    dataStatus: "loading",
  });

  await expect.element(screen.getByRole("button", { name: "Reiniciar el PIN" })).toBeDisabled();
});

test("disables Reiniciar el PIN after the screen's data fails to load", async () => {
  const screen = await renderSections(createServices(), {
    showsPasskeys: false,
    showsPin: true,
    user: undefined,
    dataStatus: "failed",
  });

  await expect.element(screen.getByRole("button", { name: "Reiniciar el PIN" })).toBeDisabled();
});
