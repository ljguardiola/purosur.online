import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { EmitUserPinCodeModalServices } from "./emit-user-pin-code-modal";
import { UserPinSection } from "./user-pin-section";

function createServices(
  overrides: Partial<EmitUserPinCodeModalServices> = {},
): EmitUserPinCodeModalServices {
  return {
    emitUserPinCode: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

const lucia = { id: "user-1", firstName: "Lucía" };
const issued = {
  kind: "ok",
  value: { code: "K7QM2XPA7DTR4HWN", expiresAt: "2026-09-30T12:15:00.000Z" },
} as const;

afterEach(() => {
  window.history.pushState(null, "", "/");
});

function renderSection(services: EmitUserPinCodeModalServices, onSessionEnded = () => {}) {
  return render(
    <main>
      <UserPinSection
        user={lucia}
        dataStatus="loaded"
        onSessionEnded={onSessionEnded}
        services={services}
      />
    </main>,
  );
}

async function pressReiniciar(screen: Awaited<ReturnType<typeof renderSection>>) {
  await userEvent.click(screen.getByRole("button", { name: "Reiniciar el PIN" }));
  return screen.getByRole("dialog", { name: "Código para reiniciar el PIN" });
}

test("explains what the reset code is and offers to reset the PIN, without emitting anything yet", async () => {
  const services = createServices();
  const screen = await renderSection(services);

  await expect.element(screen.getByRole("heading", { name: "PIN de la caja" })).toBeVisible();
  await expect
    .element(
      screen.getByText("El código de reinicio vale 15 minutos y se usa una sola vez en la caja."),
    )
    .toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Reiniciar el PIN" })).toBeVisible();
  expect(services.emitUserPinCode).not.toHaveBeenCalled();
  await expectNoAccessibilityViolations(screen.container);
});

test("pressing Reiniciar el PIN emits a code for the user and shows it in the modal", async () => {
  const services = createServices();
  vi.mocked(services.emitUserPinCode).mockResolvedValue(issued);
  const screen = await renderSection(services);

  const dialog = await pressReiniciar(screen);

  await expect.element(dialog.getByText("K7QM 2XPA 7DTR 4HWN")).toBeVisible();
  expect(services.emitUserPinCode).toHaveBeenCalledExactlyOnceWith("user-1");
});

test("Listo closes the modal and discards the code", async () => {
  const services = createServices();
  vi.mocked(services.emitUserPinCode).mockResolvedValue(issued);
  const screen = await renderSection(services);
  const dialog = await pressReiniciar(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Listo" }));

  await expect.element(screen.getByText("K7QM 2XPA 7DTR 4HWN")).not.toBeInTheDocument();
  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("emits again on Reintentar after a failure, and shows the new code", async () => {
  const services = createServices();
  vi.mocked(services.emitUserPinCode)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce(issued);
  const screen = await renderSection(services);
  const dialog = await pressReiniciar(screen);
  await expect.element(dialog.getByText("No se pudo emitir el código")).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Reintentar" }));

  await expect.element(dialog.getByText("K7QM 2XPA 7DTR 4HWN")).toBeVisible();
  expect(services.emitUserPinCode).toHaveBeenCalledTimes(2);
});

test("says when to try again when the cloud rate-limits the emission", async () => {
  const services = createServices();
  vi.mocked(services.emitUserPinCode).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 1800,
  });
  const screen = await renderSection(services);

  const dialog = await pressReiniciar(screen);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 30 minutos.")).toBeVisible();
});

test.each([["not_found"], ["inactive"]] as const)(
  "closes the modal without a code when the user comes back %s",
  async (kind) => {
    const services = createServices();
    vi.mocked(services.emitUserPinCode).mockResolvedValue({ kind });
    const screen = await renderSection(services);

    await userEvent.click(screen.getByRole("button", { name: "Reiniciar el PIN" }));

    await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  },
);

test("asks for the passkey first when the emission needs authorization, and shows the code once it is granted", async () => {
  const services = createServices();
  vi.mocked(services.emitUserPinCode)
    .mockResolvedValueOnce({ kind: "authorization_required" })
    .mockResolvedValueOnce(issued);
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: { challenge: "session-auth" } as never,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue({ id: "existing-cred" } as never);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
  const screen = await renderSection(services);
  await userEvent.click(screen.getByRole("button", { name: "Reiniciar el PIN" }));

  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect
    .element(
      authDialog.getByText("Reiniciar el PIN necesita tu autorización. Confirmala con tu passkey."),
    )
    .toBeVisible();
  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.element(screen.getByText("K7QM 2XPA 7DTR 4HWN")).toBeVisible();
});

test("cancelling the authorization leaves nothing open and emits nothing more", async () => {
  const services = createServices();
  vi.mocked(services.emitUserPinCode).mockResolvedValue({ kind: "authorization_required" });
  const screen = await renderSection(services);
  await userEvent.click(screen.getByRole("button", { name: "Reiniciar el PIN" }));

  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Autorizá este cambio" })
      .getByRole("button", { name: "Cancelar" }),
  );

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.emitUserPinCode).toHaveBeenCalledTimes(1);
});

test("reports the session ended when the emission comes back unauthenticated", async () => {
  const services = createServices();
  vi.mocked(services.emitUserPinCode).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderSection(services, onSessionEnded);

  await userEvent.click(screen.getByRole("button", { name: "Reiniciar el PIN" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
});

test("sends the person to Mi cuenta when the emission comes back forbidden", async () => {
  const services = createServices();
  vi.mocked(services.emitUserPinCode).mockResolvedValue({ kind: "forbidden" });
  const screen = await renderSection(services);

  await userEvent.click(screen.getByRole("button", { name: "Reiniciar el PIN" }));

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
});

test("disables Reiniciar el PIN while the user's data is loading", async () => {
  const screen = await render(
    <main>
      <UserPinSection
        user={lucia}
        dataStatus="loading"
        onSessionEnded={() => {}}
        services={createServices()}
      />
    </main>,
  );

  await expect.element(screen.getByRole("button", { name: "Reiniciar el PIN" })).toBeDisabled();
});
