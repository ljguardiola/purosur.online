import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { OwnAlertEmailOptInSection } from "./own-alert-email-opt-in-section";
import type { OwnAlertEmailOptInSectionServices } from "./own-alert-email-opt-in-section-services";

function createServices(
  overrides: Partial<OwnAlertEmailOptInSectionServices> = {},
): OwnAlertEmailOptInSectionServices {
  return {
    fetchOwnAlertEmailOptIn: vi.fn(),
    recordOwnAlertEmailOptIn: vi.fn(),
    withdrawOwnAlertEmailOptIn: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

const OPTED_IN_AT = "2026-03-14T15:00:00.000Z";
const authorizationOptions = { challenge: "session-auth" } as never;
const assertion = { id: "existing-cred" } as never;

function grantAuthorization(services: OwnAlertEmailOptInSectionServices) {
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(assertion);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
}

function renderSection(
  services: OwnAlertEmailOptInSectionServices,
  onSessionEnded: () => void = () => {},
) {
  return render(
    <main>
      <OwnAlertEmailOptInSection onSessionEnded={onSessionEnded} services={services} />
    </main>,
  );
}

function expectNoOptInAction(screen: Awaited<ReturnType<typeof renderSection>>) {
  expect(screen.getByRole("button", { name: "Recibir alertas por email" }).query()).toBeNull();
  expect(
    screen.getByRole("button", { name: "Dejar de recibir alertas por email" }).query(),
  ).toBeNull();
}

test("shows a loading state before the opt-in resolves, with no action yet", async () => {
  const services = createServices();
  vi.mocked(services.fetchOwnAlertEmailOptIn).mockReturnValue(new Promise(() => {}));

  const screen = await renderSection(services);

  await expect.element(screen.getByRole("status")).toBeVisible();
  expect(screen.getByRole("heading").query()).toBeNull();
  expectNoOptInAction(screen);
});

test("shows a failure with a retry when the opt-in cannot be read, with no action", async () => {
  const services = createServices();
  vi.mocked(services.fetchOwnAlertEmailOptIn).mockResolvedValueOnce({ kind: "failed" });
  vi.mocked(services.fetchOwnAlertEmailOptIn).mockResolvedValueOnce({
    kind: "ok",
    value: { optedInAt: null },
  });

  const screen = await renderSection(services);

  await expect.element(screen.getByText("No pudimos abrir tus alertas por email")).toBeVisible();
  expectNoOptInAction(screen);

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("No recibe alertas por email")).toBeVisible();
});

test("shows that the user does not receive alerts by email, offering to receive them", async () => {
  const services = createServices();
  vi.mocked(services.fetchOwnAlertEmailOptIn).mockResolvedValue({
    kind: "ok",
    value: { optedInAt: null },
  });

  const screen = await renderSection(services);

  await expect.element(screen.getByText("No recibe alertas por email")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Recibir alertas por email" }))
    .toBeEnabled();
  expect(
    screen.getByRole("button", { name: "Dejar de recibir alertas por email" }).query(),
  ).toBeNull();
  await expectNoAccessibilityViolations(screen.container);
});

test("shows since when the user receives alerts by email, offering to stop", async () => {
  const services = createServices();
  vi.mocked(services.fetchOwnAlertEmailOptIn).mockResolvedValue({
    kind: "ok",
    value: { optedInAt: OPTED_IN_AT },
  });

  const screen = await renderSection(services);

  await expect.element(screen.getByText("Recibe alertas por email desde 14/03/2026")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Dejar de recibir alertas por email" }))
    .toBeEnabled();
  expect(screen.getByRole("button", { name: "Recibir alertas por email" }).query()).toBeNull();
});

test("records the opt-in with an authorization at hand and shows the new state", async () => {
  const services = createServices();
  vi.mocked(services.fetchOwnAlertEmailOptIn)
    .mockResolvedValueOnce({ kind: "ok", value: { optedInAt: null } })
    .mockResolvedValue({ kind: "ok", value: { optedInAt: OPTED_IN_AT } });
  vi.mocked(services.recordOwnAlertEmailOptIn).mockResolvedValue({
    kind: "ok",
    value: { optedInAt: OPTED_IN_AT },
  });
  const screen = await renderSection(services);

  await userEvent.click(screen.getByRole("button", { name: "Recibir alertas por email" }));

  await expect.element(screen.getByText("Recibe alertas por email desde 14/03/2026")).toBeVisible();
  expect(services.recordOwnAlertEmailOptIn).toHaveBeenCalledTimes(1);
});

test("opens the authorization modal first, recording nothing until it is given", async () => {
  const services = createServices();
  vi.mocked(services.fetchOwnAlertEmailOptIn)
    .mockResolvedValueOnce({ kind: "ok", value: { optedInAt: null } })
    .mockResolvedValue({ kind: "ok", value: { optedInAt: OPTED_IN_AT } });
  vi.mocked(services.recordOwnAlertEmailOptIn).mockResolvedValueOnce({
    kind: "authorization_required",
  });
  vi.mocked(services.recordOwnAlertEmailOptIn).mockResolvedValueOnce({
    kind: "ok",
    value: { optedInAt: OPTED_IN_AT },
  });
  grantAuthorization(services);
  const screen = await renderSection(services);

  await userEvent.click(screen.getByRole("button", { name: "Recibir alertas por email" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();
  await expect
    .element(
      authDialog.getByText(
        "Recibir alertas por email necesita tu autorización. Confirmala con tu passkey.",
      ),
    )
    .toBeVisible();
  expect(services.authorizeSession).not.toHaveBeenCalled();

  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.element(screen.getByText("Recibe alertas por email desde 14/03/2026")).toBeVisible();
  expect(services.recordOwnAlertEmailOptIn).toHaveBeenCalledTimes(2);
});

test("keeps the opt-in unchanged when the authorization modal is cancelled", async () => {
  const services = createServices();
  vi.mocked(services.fetchOwnAlertEmailOptIn).mockResolvedValue({
    kind: "ok",
    value: { optedInAt: null },
  });
  vi.mocked(services.recordOwnAlertEmailOptIn).mockResolvedValue({
    kind: "authorization_required",
  });
  const screen = await renderSection(services);

  await userEvent.click(screen.getByRole("button", { name: "Recibir alertas por email" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await userEvent.click(authDialog.getByRole("button", { name: "Cancelar" }));

  await expect
    .poll(() => screen.getByRole("dialog", { name: "Autorizá este cambio" }).query())
    .toBeNull();
  await expect.element(screen.getByText("No recibe alertas por email")).toBeVisible();
  expect(services.recordOwnAlertEmailOptIn).toHaveBeenCalledTimes(1);
});

test("withdraws the opt-in, going through the authorization when it is missing", async () => {
  const services = createServices();
  vi.mocked(services.fetchOwnAlertEmailOptIn)
    .mockResolvedValueOnce({ kind: "ok", value: { optedInAt: OPTED_IN_AT } })
    .mockResolvedValue({ kind: "ok", value: { optedInAt: null } });
  vi.mocked(services.withdrawOwnAlertEmailOptIn).mockResolvedValueOnce({
    kind: "authorization_required",
  });
  vi.mocked(services.withdrawOwnAlertEmailOptIn).mockResolvedValueOnce({
    kind: "ok",
    value: { optedInAt: null },
  });
  grantAuthorization(services);
  const screen = await renderSection(services);

  await userEvent.click(screen.getByRole("button", { name: "Dejar de recibir alertas por email" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect
    .element(
      authDialog.getByText(
        "Dejar de recibir alertas por email necesita tu autorización. Confirmala con tu passkey.",
      ),
    )
    .toBeVisible();
  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.element(screen.getByText("No recibe alertas por email")).toBeVisible();
  expect(services.withdrawOwnAlertEmailOptIn).toHaveBeenCalledTimes(2);
});

test("shows a failure notice when the change fails, keeping the state shown", async () => {
  const services = createServices();
  vi.mocked(services.fetchOwnAlertEmailOptIn).mockResolvedValue({
    kind: "ok",
    value: { optedInAt: null },
  });
  vi.mocked(services.recordOwnAlertEmailOptIn).mockResolvedValue({ kind: "failed" });
  const screen = await renderSection(services);

  await userEvent.click(screen.getByRole("button", { name: "Recibir alertas por email" }));

  await expect
    .element(screen.getByText("No se pudo cambiar si recibís alertas por email"))
    .toBeVisible();
  await expect.element(screen.getByText("No recibe alertas por email")).toBeVisible();
});

test("shows when the change can be tried again after a rate limit", async () => {
  const services = createServices();
  vi.mocked(services.fetchOwnAlertEmailOptIn).mockResolvedValue({
    kind: "ok",
    value: { optedInAt: null },
  });
  vi.mocked(services.recordOwnAlertEmailOptIn).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 60,
  });
  const screen = await renderSection(services);

  await userEvent.click(screen.getByRole("button", { name: "Recibir alertas por email" }));

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("ends the session when the change finds it already closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchOwnAlertEmailOptIn).mockResolvedValue({
    kind: "ok",
    value: { optedInAt: null },
  });
  vi.mocked(services.recordOwnAlertEmailOptIn).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderSection(services, onSessionEnded);

  await userEvent.click(screen.getByRole("button", { name: "Recibir alertas por email" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
