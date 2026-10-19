import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { ACCOUNT_ID, account, runbook } from "./test-support/compromise-response";
import {
  createServices,
  grantAuthorization,
  renderScreen,
} from "./test-support/compromise-response-screen";

beforeEach(() => {
  window.history.pushState(null, "", "/compromise-response");
});

const STEP_TITLES = [
  "Revocar todas las instalaciones",
  "Cerrar todas las sesiones y dar de baja las passkeys de la cuenta sospechada",
  "Forzar el reinicio de PIN",
  "Rotar los secretos externos",
  "Avisar",
  "Volver a dar de alta cada caja",
];

function servicesWith(current: ReturnType<typeof runbook> | null) {
  const services = createServices();
  vi.mocked(services.fetchCompromiseResponse).mockResolvedValue({ kind: "ok", value: current });
  return services;
}

test("shows a loading placeholder while the runbook loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchCompromiseResponse).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("heading", { name: "Respuesta ante un compromiso", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
  expect(screen.getByRole("button", { name: "Comenzar" }).query()).toBeNull();
});

test("offers to read the runbook again when it fails to load", async () => {
  const services = createServices();
  vi.mocked(services.fetchCompromiseResponse)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: runbook() });
  const screen = await renderScreen(services);

  await expect
    .element(screen.getByText("No pudimos abrir la respuesta ante un compromiso"))
    .toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByRole("heading", { name: STEP_TITLES[0] ?? "" })).toBeVisible();
});

test("ends the session when the cloud finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.fetchCompromiseResponse).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("sends the person to Mi cuenta when the cloud refuses the runbook", async () => {
  const services = createServices();
  vi.mocked(services.fetchCompromiseResponse).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("offers to start the runbook when none exists, and shows no step", async () => {
  const screen = await renderScreen(servicesWith(null));

  await expect.element(screen.getByText("No hay una respuesta en curso")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Comenzar" })).toBeVisible();
  expect(screen.getByRole("heading", { name: STEP_TITLES[0] ?? "" }).query()).toBeNull();
});

test("starts the runbook and shows its steps", async () => {
  const services = servicesWith(null);
  vi.mocked(services.startCompromiseResponse).mockResolvedValue({ kind: "ok", value: runbook() });
  vi.mocked(services.fetchCompromiseResponse).mockResolvedValueOnce({ kind: "ok", value: null });
  vi.mocked(services.fetchCompromiseResponse).mockResolvedValue({ kind: "ok", value: runbook() });
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Comenzar" }));

  await expect.element(screen.getByRole("heading", { name: STEP_TITLES[0] ?? "" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Comenzar" }).query()).toBeNull();
});

test("explains a failed start and offers it again", async () => {
  const services = servicesWith(null);
  vi.mocked(services.startCompromiseResponse).mockResolvedValue({ kind: "failed" });
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Comenzar" }));

  await expect.element(screen.getByText("No se pudo comenzar")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Comenzar" })).toBeEnabled();
});

test("shows the six steps in order, only the first one available", async () => {
  const screen = await renderScreen(servicesWith(runbook()));

  const headings = screen.getByRole("heading", { level: 2 });
  await expect
    .poll(() => headings.elements().map((heading) => heading.textContent))
    .toEqual(STEP_TITLES);
  await expect.element(screen.getByText("Disponible")).toBeVisible();
  expect(screen.getByText("Bloqueado hasta completar el anterior").elements()).toHaveLength(5);
});

test("shows a done step with its date and the next one available", async () => {
  const screen = await renderScreen(servicesWith(runbook(["revoke_every_installation"])));

  await expect.element(screen.getByText("Hecho el 01/10/2026 · 15:30")).toBeVisible();
  await expect.element(screen.getByText("Disponible")).toBeVisible();
});

test("offers to start another runbook once the running one is completed", async () => {
  const done = runbook(
    ["revoke_every_installation", "end_sessions_and_remove_passkeys", "force_pin_resets"],
    [
      "mercado_pago_webhook_secret",
      "whatsapp_webhook_token",
      "whatsapp_webhook_secret",
      "claude_api_key",
      "postgres_credentials",
      "ci_deployment_credentials",
      "storage_bucket_credentials",
      "arca_certificate_and_private_key",
      "notify",
    ],
    true,
  );
  const screen = await renderScreen(servicesWith(done));

  await expect.element(screen.getByRole("button", { name: "Comenzar" })).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: STEP_TITLES[5] ?? "" })).toBeVisible();
});

test("disables the actions of a step that is not available", async () => {
  const screen = await renderScreen(servicesWith(runbook()));

  await expect
    .element(screen.getByRole("button", { name: "Revocar todas las instalaciones" }))
    .toBeEnabled();
  await expect.element(screen.getByRole("button", { name: "Elegir la cuenta" })).toBeDisabled();
  await expect
    .element(screen.getByRole("button", { name: "Forzar el reinicio de PIN" }))
    .toBeDisabled();
});

test("points to the registers list from the last step", async () => {
  const screen = await renderScreen(servicesWith(runbook()));

  const link = screen.getByRole("link", { name: "Ir a Cajas registradoras" });
  await expect.element(link).toBeVisible();
  expect(link.element().getAttribute("href")).toBe("/registers");
});

test("revokes every installation from its modal and reads the runbook again", async () => {
  const services = servicesWith(runbook());
  vi.mocked(services.revokeEveryInstallation).mockResolvedValue({
    kind: "ok",
    value: runbook(["revoke_every_installation"]),
  });
  const screen = await renderScreen(services);
  vi.mocked(services.fetchCompromiseResponse).mockResolvedValue({
    kind: "ok",
    value: runbook(["revoke_every_installation"]),
  });

  await userEvent.click(screen.getByRole("button", { name: "Revocar todas las instalaciones" }));
  const dialog = screen.getByRole("dialog", { name: "Revocar todas las instalaciones" });
  await userEvent.click(dialog.getByRole("button", { name: "Revocar todas" }));

  await expect.element(screen.getByText("Instalaciones revocadas")).toBeVisible();
  await expect.element(screen.getByText("Hecho el 01/10/2026 · 15:30")).toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("ends the session after ending the sessions and removing the passkeys of the chosen account", async () => {
  const services = servicesWith(runbook(["revoke_every_installation"]));
  vi.mocked(services.fetchUsers).mockResolvedValue({
    kind: "ok",
    value: [account({ id: ACCOUNT_ID, firstName: "Ana Pérez", email: "ana@example.com" })],
  });
  vi.mocked(services.endSessionsAndRemovePasskeys).mockResolvedValue({
    kind: "ok",
    value: runbook(["revoke_every_installation", "end_sessions_and_remove_passkeys"]),
  });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);

  await userEvent.click(screen.getByRole("button", { name: "Elegir la cuenta" }));
  const dialog = screen.getByRole("dialog", {
    name: "Cerrar las sesiones y dar de baja las passkeys",
  });
  await userEvent.click(dialog.getByRole("button", { name: /Cuenta sospechada/ }));
  await userEvent.click(screen.getByRole("option", { name: "Ana Pérez · ana@example.com" }));
  await userEvent.click(dialog.getByRole("button", { name: "Cerrar y dar de baja" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
  expect(services.endSessionsAndRemovePasskeys).toHaveBeenCalledWith({ account_id: ACCOUNT_ID });
});

test("forces the PIN resets from its modal and reads the runbook again", async () => {
  const afterTwo = runbook(["revoke_every_installation", "end_sessions_and_remove_passkeys"]);
  const afterThree = runbook([
    "revoke_every_installation",
    "end_sessions_and_remove_passkeys",
    "force_pin_resets",
  ]);
  const services = servicesWith(afterTwo);
  vi.mocked(services.forcePinResets).mockResolvedValue({ kind: "ok", value: afterThree });
  const screen = await renderScreen(services);
  vi.mocked(services.fetchCompromiseResponse).mockResolvedValue({ kind: "ok", value: afterThree });

  await userEvent.click(screen.getByRole("button", { name: "Forzar el reinicio de PIN" }));
  const dialog = screen.getByRole("dialog", { name: "Forzar el reinicio de PIN" });
  await userEvent.click(dialog.getByRole("button", { name: "Forzar el reinicio" }));

  await expect.element(screen.getByText("Reinicio de PIN exigido")).toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("asks for the passkey before running an action step", async () => {
  const services = servicesWith(runbook());
  vi.mocked(services.revokeEveryInstallation).mockResolvedValueOnce({
    kind: "authorization_required",
  });
  vi.mocked(services.revokeEveryInstallation).mockResolvedValueOnce({
    kind: "ok",
    value: runbook(["revoke_every_installation"]),
  });
  grantAuthorization(services);
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Revocar todas las instalaciones" }));
  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Revocar todas las instalaciones" })
      .getByRole("button", { name: "Revocar todas" }),
  );
  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Autorizá este cambio" })
      .getByRole("button", { name: "Usar mi passkey" }),
  );

  await expect.poll(() => vi.mocked(services.revokeEveryInstallation).mock.calls.length).toBe(2);
});

test("reads the runbook again when a modal reports it outdated", async () => {
  const services = servicesWith(runbook());
  vi.mocked(services.revokeEveryInstallation).mockResolvedValue({ kind: "already_done" });
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Revocar todas las instalaciones" }));
  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Revocar todas las instalaciones" })
      .getByRole("button", { name: "Revocar todas" }),
  );

  await expect.poll(() => vi.mocked(services.fetchCompromiseResponse).mock.calls.length).toBe(2);
});

function servicesAtRotation() {
  return servicesWith(
    runbook(["revoke_every_installation", "end_sessions_and_remove_passkeys", "force_pin_resets"]),
  );
}

test("marks a secret as rotated and reads the runbook again", async () => {
  const services = servicesAtRotation();
  const marked = runbook(
    ["revoke_every_installation", "end_sessions_and_remove_passkeys", "force_pin_resets"],
    ["claude_api_key"],
  );
  vi.mocked(services.markItemDone).mockResolvedValue({ kind: "ok", value: marked });
  const screen = await renderScreen(services);
  vi.mocked(services.fetchCompromiseResponse).mockResolvedValue({ kind: "ok", value: marked });

  await userEvent.click(
    screen
      .getByRole("listitem")
      .filter({ hasText: "Clave de la API de Claude" })
      .getByRole("button", { name: "Marcar como hecho" }),
  );

  expect(services.markItemDone).toHaveBeenCalledWith("claude_api_key");
  await expect.element(screen.getByText("Marcado como hecho")).toBeVisible();
  await expect.poll(() => vi.mocked(services.fetchCompromiseResponse).mock.calls.length).toBe(2);
});

test("marks the notification as done", async () => {
  const services = servicesWith(
    runbook(
      ["revoke_every_installation", "end_sessions_and_remove_passkeys", "force_pin_resets"],
      [
        "mercado_pago_webhook_secret",
        "whatsapp_webhook_token",
        "whatsapp_webhook_secret",
        "claude_api_key",
        "postgres_credentials",
        "ci_deployment_credentials",
        "storage_bucket_credentials",
        "arca_certificate_and_private_key",
      ],
    ),
  );
  vi.mocked(services.markItemDone).mockResolvedValue({ kind: "ok", value: runbook() });
  const screen = await renderScreen(services);

  await userEvent.click(
    screen
      .getByRole("listitem")
      .filter({ hasText: "Avisé y di la instrucción operativa" })
      .getByRole("button", { name: "Marcar como hecho" }),
  );

  expect(services.markItemDone).toHaveBeenCalledWith("notify");
});

test("tells the runbook changed when marking an item is refused and reads it again", async () => {
  const services = servicesAtRotation();
  vi.mocked(services.markItemDone).mockResolvedValue({ kind: "already_done" });
  const screen = await renderScreen(services);

  await userEvent.click(
    screen
      .getByRole("listitem")
      .filter({ hasText: "Credenciales de Postgres" })
      .getByRole("button", { name: "Marcar como hecho" }),
  );

  await expect.element(screen.getByText("El instructivo cambió")).toBeVisible();
  await expect.poll(() => vi.mocked(services.fetchCompromiseResponse).mock.calls.length).toBe(2);
});

test("explains a failed marking and leaves the item pending", async () => {
  const services = servicesAtRotation();
  vi.mocked(services.markItemDone).mockResolvedValue({ kind: "failed" });
  const screen = await renderScreen(services);

  await userEvent.click(
    screen
      .getByRole("listitem")
      .filter({ hasText: "Credenciales de Postgres" })
      .getByRole("button", { name: "Marcar como hecho" }),
  );

  await expect.element(screen.getByText("No se pudo marcar como hecho")).toBeVisible();
});

test("shows the wait when marking an item is rate limited", async () => {
  const services = servicesAtRotation();
  vi.mocked(services.markItemDone).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const screen = await renderScreen(services);

  await userEvent.click(
    screen
      .getByRole("listitem")
      .filter({ hasText: "Credenciales de Postgres" })
      .getByRole("button", { name: "Marcar como hecho" }),
  );

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
});

test("ends the session when marking an item finds no open session", async () => {
  const services = servicesAtRotation();
  vi.mocked(services.markItemDone).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);

  await userEvent.click(
    screen
      .getByRole("listitem")
      .filter({ hasText: "Credenciales de Postgres" })
      .getByRole("button", { name: "Marcar como hecho" }),
  );

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("has no accessibility violations", async () => {
  const screen = await renderScreen(servicesWith(runbook()));
  await expect.element(screen.getByRole("heading", { name: STEP_TITLES[0] ?? "" })).toBeVisible();

  await expectNoAccessibilityViolations(screen.container);
});
