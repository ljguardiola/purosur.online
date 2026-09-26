import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import { AlertDetailModal, type AlertDetailModalServices } from "./AlertDetailModal";
import type { BackofficeAccess } from "./access";
import type { AlertDetail, CloseAlertOutcome, FetchAlertOutcome } from "./alertsApi";

const ADMINISTRATOR_ACCESS: BackofficeAccess = { isAdministrator: true, permissions: [] };
const NO_ALERT_PERMISSIONS_ACCESS: BackofficeAccess = { isAdministrator: false, permissions: [] };

function createServices(
  overrides: Partial<AlertDetailModalServices> = {},
): AlertDetailModalServices {
  return {
    fetchAlert: vi.fn().mockReturnValue(new Promise<never>(() => {})),
    closeAlert: vi.fn(),
    ...overrides,
  };
}

function baseDetail(overrides: Partial<AlertDetail> = {}): AlertDetail {
  return {
    id: "alert-1",
    kind: "backoffice_passkey_changed",
    scope: "user-1",
    scopeDisplay: "Lucía Pérez",
    level: "warning",
    audience: "all",
    detail: { action: "registered", passkeyName: "Teléfono de Lucía", via: "self" },
    openedAt: "2026-01-05T12:00:00.000Z",
    escalatedAt: null,
    resolvedAt: null,
    deliveries: [],
    ...overrides,
  };
}

function ok(value: AlertDetail): FetchAlertOutcome {
  return { kind: "ok", value };
}

function renderModal(
  services: AlertDetailModalServices,
  overrides: {
    access?: BackofficeAccess;
    onClose?: () => void;
    onClosed?: () => void;
    onSessionEnded?: () => void;
  } = {},
) {
  return render(
    <main>
      <AlertDetailModal
        alertId="alert-1"
        access={overrides.access ?? ADMINISTRATOR_ACCESS}
        onClose={overrides.onClose ?? (() => {})}
        onClosed={overrides.onClosed ?? (() => {})}
        onSessionEnded={overrides.onSessionEnded ?? (() => {})}
        services={services}
      />
    </main>,
  );
}

test("shows the self-registered passkey title, description, opened/escalated/scope, and the closing note", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(ok(baseDetail()));

  const screen = await renderModal(services);

  await expect.element(screen.getByText("Se registró una passkey")).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Lucía Pérez registró la passkey «Teléfono de Lucía». Si no fue ella, conviene dar de baja esa passkey desde Usuarios.",
      ),
    )
    .toBeVisible();
  await expect.element(screen.getByText("Todavía no")).toBeVisible();
  await expect
    .element(screen.getByText("No se cierra sola: se cierra a mano después de revisar el cambio."))
    .toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});

test("shows the escalation line once the alert has escalated", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(baseDetail({ level: "critical", escalatedAt: "2026-01-06T12:00:00.000Z" })),
  );

  const screen = await renderModal(services);

  await expect
    .element(screen.getByText("Advertencia al abrirse · escaló a las 24 horas"))
    .toBeVisible();
});

test("shows the administrator-driven removal description with the actor's name", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(
      baseDetail({
        detail: {
          action: "removed",
          passkeyName: "Notebook de Grace",
          via: "administrator",
          actorId: "admin-1",
          actorName: "Ada",
        },
      }),
    ),
  );

  const screen = await renderModal(services);

  await expect
    .element(
      screen.getByText(
        "El Administrador Ada dio de baja la passkey «Notebook de Grace» de Lucía Pérez. Si no fue así, conviene revisarlo.",
      ),
    )
    .toBeVisible();
});

test("shows the recovery-requested description", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(
      baseDetail({
        kind: "backoffice_recovery_requested",
        detail: {
          requestedAt: "2026-01-05T12:00:00.000Z",
          issuedAt: "2026-01-05T12:00:01.000Z",
          expiresAt: "2026-01-05T12:15:00.000Z",
        },
      }),
    ),
  );

  const screen = await renderModal(services);

  await expect.element(screen.getByText("Se pidió el enlace de acceso")).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Alguien pidió el enlace de acceso para Lucía Pérez porque no pudo entrar con ninguna de sus passkeys. Si no fue ella, conviene revisar sus passkeys desde Usuarios.",
      ),
    )
    .toBeVisible();
});

test("shows the email-changed description", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(
      baseDetail({
        kind: "user_email_changed",
        detail: {
          previousEmail: "old@example.com",
          newEmail: "new@example.com",
          actorId: "admin-1",
          actorName: "Ada",
        },
      }),
    ),
  );

  const screen = await renderModal(services);

  await expect.element(screen.getByText("Se cambió un correo")).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "El Administrador Ada cambió el correo de Lucía Pérez de old@example.com a new@example.com.",
      ),
    )
    .toBeVisible();
});

test("shows the sign-in lockout description, scoped to the source address", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(
      baseDetail({
        kind: "backoffice_sign_in_lockout",
        scope: "203.0.113.5",
        scopeDisplay: "203.0.113.5",
        detail: {
          sourceAddress: "203.0.113.5",
          failureCount: 6,
          blockedUntil: "2026-01-05T12:15:00.000Z",
        },
      }),
    ),
  );

  const screen = await renderModal(services);

  await expect.element(screen.getByText("Se bloqueó un origen de ingreso")).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "La dirección 203.0.113.5 quedó bloqueada para ingresar al backoffice después de 6 intentos fallidos.",
      ),
    )
    .toBeVisible();
});

test("hides Cerrar la alerta for a viewer without dismiss_alerts_manually", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(ok(baseDetail()));

  const screen = await renderModal(services, { access: NO_ALERT_PERMISSIONS_ACCESS });
  await expect.element(screen.getByText("Se registró una passkey")).toBeVisible();

  expect(screen.getByRole("button", { name: "Cerrar la alerta" }).query()).toBeNull();
});

test("hides Cerrar la alerta for an alert that's already closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(baseDetail({ resolvedAt: "2026-01-05T13:00:00.000Z" })),
  );

  const screen = await renderModal(services);
  await expect.element(screen.getByText("Se registró una passkey")).toBeVisible();

  expect(screen.getByRole("button", { name: "Cerrar la alerta" }).query()).toBeNull();
});

test("Cerrar la alerta closes the alert and reports it back through onClosed", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(ok(baseDetail()));
  const closeOutcome: CloseAlertOutcome = {
    kind: "ok",
    value: baseDetail({ resolvedAt: "2026-01-05T13:00:00.000Z" }),
  };
  vi.mocked(services.closeAlert).mockResolvedValue(closeOutcome);
  const onClosed = vi.fn();
  const screen = await renderModal(services, { onClosed });
  await expect.element(screen.getByRole("button", { name: "Cerrar la alerta" })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Cerrar la alerta" }));

  await expect.poll(() => onClosed).toHaveBeenCalled();
  expect(services.closeAlert).toHaveBeenCalledWith("alert-1");
});

test("shows a notice when someone else already closed it, instead of reporting success", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(ok(baseDetail()));
  vi.mocked(services.closeAlert).mockResolvedValue({ kind: "already_closed" });
  const onClosed = vi.fn();
  const screen = await renderModal(services, { onClosed });
  await expect.element(screen.getByRole("button", { name: "Cerrar la alerta" })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Cerrar la alerta" }));

  await expect.element(screen.getByText("Esta alerta ya estaba cerrada")).toBeVisible();
  expect(onClosed).not.toHaveBeenCalled();
});

test("Volver calls onClose without closing the alert", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(ok(baseDetail()));
  const onClose = vi.fn();
  const screen = await renderModal(services, { onClose });
  await expect.element(screen.getByText("Se registró una passkey")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Volver" }));

  expect(onClose).toHaveBeenCalled();
  expect(services.closeAlert).not.toHaveBeenCalled();
});

test("shows a load error with a retry action that reads the alert again", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValueOnce({ kind: "failed" });
  const screen = await renderModal(services);
  await expect.element(screen.getByText("No pudimos abrir la alerta")).toBeVisible();

  vi.mocked(services.fetchAlert).mockResolvedValueOnce(ok(baseDetail()));
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Se registró una passkey")).toBeVisible();
});

test("shows a rate-limited notice with a retry action that reads the alert again", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValueOnce({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const screen = await renderModal(services);
  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();

  vi.mocked(services.fetchAlert).mockResolvedValueOnce(ok(baseDetail()));
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Se registró una passkey")).toBeVisible();
});
