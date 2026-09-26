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
        "Lucía Pérez registró la passkey «Teléfono de Lucía». Si no se reconoce este cambio, conviene dar de baja esa passkey desde Usuarios.",
      ),
    )
    .toBeVisible();
  await expect.element(screen.getByText("Todavía no")).toBeVisible();
  await expect
    .element(screen.getByText("No se cierra sola: se cierra a mano después de revisarla."))
    .toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});

test("shows the self-removed passkey description", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(
      baseDetail({
        detail: { action: "removed", passkeyName: "Teléfono de Lucía", via: "self" },
      }),
    ),
  );

  const screen = await renderModal(services);

  await expect
    .element(
      screen.getByText(
        "Lucía Pérez dio de baja la passkey «Teléfono de Lucía». Si no se reconoce este cambio, conviene revisar sus passkeys desde Usuarios.",
      ),
    )
    .toBeVisible();
});

test("shows the passkey registered through account recovery", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(
      baseDetail({
        detail: { action: "registered", passkeyName: "Teléfono de Lucía", via: "recovery" },
      }),
    ),
  );

  const screen = await renderModal(services);

  await expect
    .element(
      screen.getByText(
        "Lucía Pérez registró la passkey «Teléfono de Lucía» al usar el enlace de recuperación de acceso. Si no se reconoce este cambio, conviene dar de baja esa passkey desde Usuarios.",
      ),
    )
    .toBeVisible();
});

test("describes no passkey removal through account recovery, which only registers", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValueOnce(
    ok(
      baseDetail({
        detail: { action: "removed", passkeyName: "Teléfono de Lucía", via: "recovery" },
      }),
    ),
  );
  const screen = await renderModal(services);
  await expect.element(screen.getByText("Lucía Pérez", { exact: true })).toBeVisible();

  expect(screen.getByText(/Teléfono de Lucía/).query()).toBeNull();
});

test("describes no Administrator's registration of someone else's passkey", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValueOnce(
    ok(
      baseDetail({
        detail: {
          action: "registered",
          passkeyName: "Teléfono de Lucía",
          via: "administrator",
          actorId: "admin-1",
          actorName: "Ada",
        },
      }),
    ),
  );
  const screen = await renderModal(services);
  await expect.element(screen.getByText("Lucía Pérez", { exact: true })).toBeVisible();

  expect(screen.getByText(/Teléfono de Lucía/).query()).toBeNull();
});

test("shows when an escalated alert escalated, with no fixed escalation line repeating it", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(baseDetail({ level: "critical", escalatedAt: "2026-01-06T12:00:00.000Z" })),
  );

  const screen = await renderModal(services);

  await expect.element(screen.getByText("Crítica")).toBeVisible();
  expect(screen.getByText("Todavía no").query()).toBeNull();
  expect(screen.getByText(/24 horas/).query()).toBeNull();
});

test("shows the closing note only while the alert is still open", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(baseDetail({ resolvedAt: "2026-01-05T13:00:00.000Z" })),
  );

  const screen = await renderModal(services);
  await expect.element(screen.getByText("Se registró una passkey")).toBeVisible();

  expect(screen.getByText(/No se cierra sola/).query()).toBeNull();
});

test("never shows an Administrator's change without that Administrator's name", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(
      baseDetail({
        kind: "user_email_changed",
        detail: { previousEmail: "old@example.com", newEmail: "new@example.com" },
      }),
    ),
  );

  const screen = await renderModal(services);
  await expect.element(screen.getByText("Se cambió un correo")).toBeVisible();

  expect(screen.getByText(/Administrador/).query()).toBeNull();
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
        "Alguien pidió el enlace de acceso para Lucía Pérez. Si no se reconoce este pedido, conviene revisar sus passkeys desde Usuarios.",
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

test("describes a closed sign-in lockout without its source address, and leaves out the scope row", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(
      baseDetail({
        kind: "backoffice_sign_in_lockout",
        scope: "a-hashed-address",
        scopeDisplay: null,
        detail: {
          sourceAddress: "a-hashed-address",
          failureCount: 6,
          blockedUntil: "2026-01-05T12:15:00.000Z",
        },
        resolvedAt: "2026-01-05T13:00:00.000Z",
      }),
    ),
  );

  const screen = await renderModal(services);

  await expect
    .element(
      screen.getByText(
        "Una dirección quedó bloqueada para ingresar al backoffice después de 6 intentos fallidos.",
      ),
    )
    .toBeVisible();
  expect(screen.getByText(/a-hashed-address/).query()).toBeNull();
  expect(screen.getByText("Alcance").query()).toBeNull();
});

test("shows each recipient's delivery status: sent, or failed with its error", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(
      baseDetail({
        deliveries: [
          {
            channel: "backoffice",
            status: "sent",
            error: null,
            createdAt: "2026-01-05T12:00:00.000Z",
            recipient: {
              id: "admin-1",
              firstName: "Ada",
              role: { id: "role-admin", name: "Administrador", isAdministrator: true },
            },
          },
          {
            channel: "backoffice",
            status: "failed",
            error: "connection refused",
            createdAt: "2026-01-05T12:00:00.000Z",
            recipient: {
              id: "user-2",
              firstName: "Grace",
              role: { id: "role-cashier", name: "Cajera", isAdministrator: false },
            },
          },
        ],
      }),
    ),
  );

  const screen = await renderModal(services);

  await expect.element(screen.getByText("Ada · Administrador")).toBeVisible();
  await expect.element(screen.getByText("Grace · Cajera")).toBeVisible();
  await expect.element(screen.getByText("Enviado")).toBeVisible();
  await expect.element(screen.getByText("No se pudo enviar: connection refused")).toBeVisible();
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
