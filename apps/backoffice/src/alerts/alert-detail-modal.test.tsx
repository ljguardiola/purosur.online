import type { AlertDetail, PermissionCatalogWire } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { act } from "react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { permissionCatalogFixture } from "../platform/test-support/permission-catalog";
import type { BackofficeAccess } from "../shell/backoffice-access";
import {
  ADMINISTRATOR_ACCESS,
  NO_CAPABILITIES_ACCESS,
} from "../shell/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import { AlertDetailModal, type AlertDetailModalServices } from "./alert-detail-modal";
import type { FetchAlertOutcome } from "./alerts-api";

function createServices(
  overrides: Partial<AlertDetailModalServices> = {},
): AlertDetailModalServices {
  return {
    fetchAlert: vi.fn().mockReturnValue(new Promise<never>(() => {})),
    fetchPermissionCatalog: vi
      .fn()
      .mockResolvedValue({ kind: "ok", value: permissionCatalogFixture }),
    closeAlert: vi.fn(),
    ...overrides,
  };
}

type PasskeyAlert = Extract<AlertDetail, { kind: "backoffice_passkey_changed" }>;
type CommonFields = Partial<Omit<AlertDetail, "kind" | "detail">>;
type KindAndDetail<Alert extends AlertDetail = AlertDetail> = Alert extends AlertDetail
  ? Pick<Alert, "kind" | "detail">
  : never;
type DetailOverrides =
  | (CommonFields & Partial<Pick<PasskeyAlert, "detail">>)
  | (CommonFields & KindAndDetail);

function baseDetail(overrides: DetailOverrides = {}): AlertDetail {
  const passkeyAlert: PasskeyAlert = {
    id: "alert-1",
    kind: "backoffice_passkey_changed",
    scope: "user-1",
    scopeDisplay: "Lucía Pérez",
    level: "warning",
    audience: "all",
    detail: {
      action: "registered",
      passkeyName: "Teléfono de Lucía",
      actorId: "user-1",
      via: "self",
    },
    openedAt: "2026-01-05T12:00:00.000Z",
    escalatedAt: null,
    resolvedAt: null,
    open: true,
    resolvesByItself: false,
    deliveries: [],
  };
  return { ...passkeyAlert, ...overrides };
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
        detail: {
          action: "removed",
          passkeyName: "Teléfono de Lucía",
          actorId: "user-1",
          via: "self",
        },
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
        detail: {
          action: "registered",
          passkeyName: "Teléfono de Lucía",
          actorId: "user-1",
          via: "recovery",
        },
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
    ok(baseDetail({ resolvedAt: "2026-01-05T13:00:00.000Z", open: false })),
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
        detail: {
          previousEmail: "old@example.com",
          newEmail: "new@example.com",
          actorId: "admin-1",
        },
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
        open: false,
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

  const screen = await renderModal(services, { access: NO_CAPABILITIES_ACCESS });
  await expect.element(screen.getByText("Se registró una passkey")).toBeVisible();

  expect(screen.getByRole("button", { name: "Cerrar la alerta" }).query()).toBeNull();
});

test("offers neither closing nor the closing note once the cloud answers the alert is not open", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(ok(baseDetail({ open: false })));

  const screen = await renderModal(services);
  await expect.element(screen.getByText("Se registró una passkey")).toBeVisible();

  expect(screen.getByRole("button", { name: "Cerrar la alerta" }).query()).toBeNull();
  expect(screen.getByText(/No se cierra sola/).query()).toBeNull();
});

test("hides Cerrar la alerta for an alert that's already closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(baseDetail({ resolvedAt: "2026-01-05T13:00:00.000Z", open: false })),
  );

  const screen = await renderModal(services);
  await expect.element(screen.getByText("Se registró una passkey")).toBeVisible();

  expect(screen.getByRole("button", { name: "Cerrar la alerta" }).query()).toBeNull();
});

test("Cerrar la alerta closes the alert and reports it back through onClosed", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(ok(baseDetail()));
  vi.mocked(services.closeAlert).mockResolvedValue({ kind: "ok" });
  const onClosed = vi.fn();
  const screen = await renderModal(services, { onClosed });
  await expect.element(screen.getByRole("button", { name: "Cerrar la alerta" })).toBeEnabled();

  await userEvent.click(screen.getByRole("button", { name: "Cerrar la alerta" }));

  await expect.poll(() => onClosed).toHaveBeenCalled();
  expect(services.closeAlert).toHaveBeenCalledWith("alert-1");
});

test("does not read the alert again once it is closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(ok(baseDetail()));
  vi.mocked(services.closeAlert).mockResolvedValue({ kind: "ok" });
  const onClosed = vi.fn();
  const screen = await renderModal(services, { onClosed });
  await expect.element(screen.getByRole("button", { name: "Cerrar la alerta" })).toBeEnabled();

  await userEvent.click(screen.getByRole("button", { name: "Cerrar la alerta" }));
  await expect.poll(() => onClosed).toHaveBeenCalled();
  await act(async () => {});

  expect(services.fetchAlert).toHaveBeenCalledTimes(1);
});

test("shows a notice when someone else already closed it, instead of reporting success", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(ok(baseDetail()));
  vi.mocked(services.closeAlert).mockResolvedValue({ kind: "already_closed" });
  const onClosed = vi.fn();
  const screen = await renderModal(services, { onClosed });
  await expect.element(screen.getByRole("button", { name: "Cerrar la alerta" })).toBeEnabled();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(baseDetail({ resolvedAt: "2026-01-05T13:00:00.000Z", open: false })),
  );

  await userEvent.click(screen.getByRole("button", { name: "Cerrar la alerta" }));

  await expect.element(screen.getByText("Esta alerta ya estaba cerrada")).toBeVisible();
  expect(onClosed).not.toHaveBeenCalled();
  expect(services.fetchAlert).toHaveBeenCalledTimes(2);
  await expect
    .element(screen.getByRole("button", { name: "Cerrar la alerta" }))
    .not.toBeInTheDocument();
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

test("shows the load placeholder while the alert loads, with Cerrar la alerta disabled", async () => {
  const services = createServices();

  const screen = await renderModal(services);

  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
  await expect.element(screen.getByRole("button", { name: "Cerrar la alerta" })).toBeDisabled();
});

test("shows the failure with a disabled Cerrar la alerta, and the wait when rate limited", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValueOnce({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });

  const screen = await renderModal(services);

  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Cerrar la alerta" })).toBeDisabled();
});

test("retrying a failed read starts again from the load placeholder", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(new Promise<never>(() => {}));
  const screen = await renderModal(services);
  await expect.element(screen.getByText("No pudimos abrir la alerta")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("No pudimos abrir la alerta")).not.toBeInTheDocument();
  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
});

test("shows only the not-found state for an alert that no longer exists", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue({ kind: "not_found" });

  const screen = await renderModal(services);

  await expect.element(screen.getByText("No encontramos esa alerta")).toBeVisible();
  expect(screen.getByRole("button", { name: "Cerrar la alerta" }).query()).toBeNull();
  expect(screen.getByRole("button", { name: "Reintentar" }).query()).toBeNull();
});

test("shows the not-found state when closing finds the alert gone", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValueOnce(ok(baseDetail()));
  vi.mocked(services.closeAlert).mockResolvedValue({ kind: "not_found" });
  const screen = await renderModal(services);
  await expect.element(screen.getByRole("button", { name: "Cerrar la alerta" })).toBeEnabled();
  vi.mocked(services.fetchAlert).mockResolvedValue({ kind: "not_found" });

  await userEvent.click(screen.getByRole("button", { name: "Cerrar la alerta" }));

  await expect.element(screen.getByText("No encontramos esa alerta")).toBeVisible();
});

test("shows a notice, and keeps the alert open, when closing is rate limited or fails", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(ok(baseDetail()));
  vi.mocked(services.closeAlert)
    .mockResolvedValueOnce({ kind: "rate_limited", retryAfterSeconds: 120 })
    .mockResolvedValueOnce({ kind: "failed" });
  const onClosed = vi.fn();
  const screen = await renderModal(services, { onClosed });
  await expect.element(screen.getByRole("button", { name: "Cerrar la alerta" })).toBeEnabled();

  await userEvent.click(screen.getByRole("button", { name: "Cerrar la alerta" }));
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Cerrar la alerta" }));
  await expect.element(screen.getByText("No se pudo cerrar la alerta")).toBeVisible();
  expect(onClosed).not.toHaveBeenCalled();
});

test("ends the session when the alert read comes back unauthenticated", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderModal(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("ends the session when closing the alert comes back unauthenticated", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(ok(baseDetail()));
  vi.mocked(services.closeAlert).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal(services, { onSessionEnded });
  await expect.element(screen.getByRole("button", { name: "Cerrar la alerta" })).toBeEnabled();

  await userEvent.click(screen.getByRole("button", { name: "Cerrar la alerta" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the alert read comes back forbidden", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue({ kind: "forbidden" });

  await renderModal(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
  window.history.pushState(null, "", "/");
});

test("navigates to Mi cuenta when closing the alert comes back forbidden", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(ok(baseDetail()));
  vi.mocked(services.closeAlert).mockResolvedValue({ kind: "forbidden" });
  const screen = await renderModal(services);
  await expect.element(screen.getByRole("button", { name: "Cerrar la alerta" })).toBeEnabled();

  await userEvent.click(screen.getByRole("button", { name: "Cerrar la alerta" }));

  await expect.poll(() => window.location.pathname).toBe("/account");
  window.history.pushState(null, "", "/");
});

test("shows the description of a role change that gives permissions the user did not have", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(
      baseDetail({
        kind: "user_access_increased",
        level: "critical",
        detail: {
          cause: "role_assigned",
          previousRole: { name: "Cajera", isAdministrator: false },
          newRole: { name: "Encargada", isAdministrator: false },
          actorId: "admin-1",
          actorName: "Ada",
        },
      }),
    ),
  );

  const screen = await renderModal(services);

  await expect.element(screen.getByText("Se amplió el acceso de un usuario")).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "El Administrador Ada cambió el rol de Lucía Pérez de «Cajera» a «Encargada», que le da permisos que no tenía.",
      ),
    )
    .toBeVisible();
});

test("shows the Administrator role by its name when someone is made Administrator", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(
      baseDetail({
        kind: "user_access_increased",
        level: "critical",
        detail: {
          cause: "role_assigned",
          previousRole: { name: "Cajera", isAdministrator: false },
          newRole: { name: null, isAdministrator: true },
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
        "El Administrador Ada cambió el rol de Lucía Pérez de «Cajera» a «Administrador», que le da permisos que no tenía.",
      ),
    )
    .toBeVisible();
});

test("shows each permission added to the role the user holds", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(
      baseDetail({
        kind: "user_access_increased",
        level: "critical",
        detail: {
          cause: "role_permissions_added",
          roleName: "Cajera",
          addedPermissionKeys: ["view_sales_history", "configure_branch"],
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
        "El Administrador Ada agregó los permisos «Caja: Consultar el historial de ventas» y «Sucursal: Configurar la sucursal» al rol «Cajera», que tiene Lucía Pérez.",
      ),
    )
    .toBeVisible();
});

test("shows a single permission added to the role the user holds", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(
      baseDetail({
        kind: "user_access_increased",
        level: "critical",
        detail: {
          cause: "role_permissions_added",
          roleName: "Cajera",
          addedPermissionKeys: ["configure_branch"],
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
        "El Administrador Ada agregó el permiso «Sucursal: Configurar la sucursal» al rol «Cajera», que tiene Lucía Pérez.",
      ),
    )
    .toBeVisible();
});

function permissionsAddedAlert(addedPermissionKeys: string[]) {
  return ok(
    baseDetail({
      kind: "user_access_increased",
      level: "critical",
      detail: {
        cause: "role_permissions_added",
        roleName: "Cajera",
        addedPermissionKeys,
        actorId: "admin-1",
        actorName: "Ada",
      },
    }),
  );
}

test("shows the loading placeholder in place of the added permissions until the permission catalog loads", async () => {
  let resolveCatalog: (outcome: CloudReadOutcome<PermissionCatalogWire>) => void = () => {};
  const services = createServices({
    fetchPermissionCatalog: vi.fn().mockReturnValue(
      new Promise((settle) => {
        resolveCatalog = settle;
      }),
    ),
  });
  vi.mocked(services.fetchAlert).mockResolvedValue(permissionsAddedAlert(["configure_branch"]));

  const screen = await renderModal(services);

  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
  expect(screen.getByText(/Administrador/).query()).toBeNull();

  resolveCatalog({ kind: "ok", value: permissionCatalogFixture });
  await expect.element(screen.getByText(/Sucursal: Configurar la sucursal/)).toBeVisible();
});

test("a permission catalog that fails to load shows the failure in place of the added permissions, and Reintentar reads it again", async () => {
  const services = createServices({
    fetchPermissionCatalog: vi
      .fn()
      .mockResolvedValueOnce({ kind: "failed" })
      .mockResolvedValueOnce({ kind: "ok", value: permissionCatalogFixture }),
  });
  vi.mocked(services.fetchAlert).mockResolvedValue(permissionsAddedAlert(["configure_branch"]));
  const screen = await renderModal(services);
  await expect.element(screen.getByText("No pudimos abrir los permisos")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText(/Sucursal: Configurar la sucursal/)).toBeVisible();
});

test("shows no description when an added permission is not in the permission catalog", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    permissionsAddedAlert(["configure_branch", "make_coffee"]),
  );

  const screen = await renderModal(services);
  await expect.element(screen.getByText("Se amplió el acceso de un usuario")).toBeVisible();
  await expect.element(screen.getByRole("status")).not.toBeInTheDocument();

  expect(screen.getByText(/Administrador/).query()).toBeNull();
});

test("reads the permission catalog only for an alert that lists added permissions", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(ok(baseDetail()));

  const screen = await renderModal(services);
  await expect.element(screen.getByText("Se registró una passkey")).toBeVisible();

  expect(services.fetchPermissionCatalog).not.toHaveBeenCalled();
});

test("never shows an increase of access without the Administrator's name", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(
      baseDetail({
        kind: "user_access_increased",
        level: "critical",
        detail: {
          cause: "role_permissions_added",
          roleName: "Cajera",
          addedPermissionKeys: ["configure_branch"],
          actorId: "admin-1",
        },
      }),
    ),
  );

  const screen = await renderModal(services);
  await expect.element(screen.getByText("Se amplió el acceso de un usuario")).toBeVisible();

  expect(screen.getByText(/Administrador/).query()).toBeNull();
});

test("shows the description of a user created as Administrator", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(
      baseDetail({
        kind: "user_access_increased",
        level: "critical",
        detail: { cause: "created_as_administrator", actorId: "admin-1", actorName: "Ada" },
      }),
    ),
  );

  const screen = await renderModal(services);

  await expect.element(screen.getByText("Se amplió el acceso de un usuario")).toBeVisible();
  await expect
    .element(screen.getByText("El Administrador Ada creó a Lucía Pérez como Administrador."))
    .toBeVisible();
});

test("shows a register's enrollment, telling that the installation it had before stopped working", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(
      baseDetail({
        kind: "register_enrolled",
        scope: "register-1",
        scopeDisplay: "Caja 1",
        detail: {
          deviceId: "device-1",
          hostname: "CAJA-MOSTRADOR",
          windowsVersion: "Windows 11 Pro 10.0.26100",
          replacedInstallation: true,
        },
      }),
    ),
  );

  const screen = await renderModal(services);

  await expect.element(screen.getByText("Se dio de alta una caja")).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "La caja «Caja 1» se dio de alta en el equipo «CAJA-MOSTRADOR» (Windows 11 Pro 10.0.26100). La instalación que tenía antes dejó de funcionar. Si no se reconoce esta alta, conviene revisarla desde Cajas registradoras.",
      ),
    )
    .toBeVisible();
});

test("describes a register that had no installation before without a replaced one", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(
      baseDetail({
        kind: "register_enrolled",
        scopeDisplay: "Caja 1",
        detail: {
          deviceId: "device-1",
          hostname: "CAJA-MOSTRADOR",
          windowsVersion: "11",
          replacedInstallation: false,
        },
      }),
    ),
  );

  const screen = await renderModal(services);

  await expect
    .element(
      screen.getByText(
        "La caja «Caja 1» se dio de alta en el equipo «CAJA-MOSTRADOR» (11). Si no se reconoce esta alta, conviene revisarla desde Cajas registradoras.",
      ),
    )
    .toBeVisible();
});

test("tells which event of a register was quarantined and why", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(
      baseDetail({
        kind: "events_quarantined",
        scope: "event-1",
        scopeDisplay: "event-1",
        detail: {
          deviceId: "device-1",
          eventId: "event-1",
          eventType: "sale_completed",
          aggregateType: "Sale",
          aggregateId: "sale-1",
          reason: {
            kind: "missing_dependency",
            aggregateType: "CashSession",
            aggregateId: "session-1",
          },
        },
      }),
    ),
  );

  const screen = await renderModal(services);

  await expect.element(screen.getByText("Evento de una caja en cuarentena")).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "El evento de venta (event-1) de la venta sale-1 no se pudo aplicar y quedó en cuarentena: depende de la sesión de caja session-1, que todavía no se aplicó. Los eventos siguientes de la venta sale-1 esperan hasta que se resuelva.",
      ),
    )
    .toBeVisible();
});

test("tells which event was applied with an inconsistency and what it breaks", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(
      baseDetail({
        kind: "event_invariant_violated",
        scope: "event-1",
        scopeDisplay: "event-1",
        detail: {
          eventId: "event-1",
          eventType: "sale_completed",
          aggregateType: "Sale",
          aggregateId: "sale-1",
          breaks: ["approved_payments_below_total"],
        },
      }),
    ),
  );

  const screen = await renderModal(services);

  await expect.element(screen.getByText("Evento aplicado con una inconsistencia")).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Se aplicó el evento de venta (event-1) de la venta sale-1, pero tiene una inconsistencia: los pagos aprobados no cubren el total de la venta.",
      ),
    )
    .toBeVisible();
});

test("shows an expiring ARCA certificate with the environment it is for and the day it expires", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(
      baseDetail({
        kind: "arca_certificate_expiring",
        scope: "production",
        scopeDisplay: "production",
        detail: { notAfter: "2026-11-20T15:30:00.000Z" },
      }),
    ),
  );

  const screen = await renderModal(services);

  await expect.element(screen.getByText("El certificado de ARCA está por vencer")).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "El certificado de ARCA de producción vence el 20/11/2026 12:30. Conviene cargar uno nuevo antes de esa fecha.",
      ),
    )
    .toBeVisible();
  await expect.element(screen.getByText("Producción", { exact: true })).toBeVisible();
});

test("tells which register runs a version the cloud no longer accepts, and which version", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(
      baseDetail({
        kind: "update_required",
        level: "critical",
        scope: "register-1",
        scopeDisplay: "Caja 1",
        detail: { deviceId: "device-1", appVersion: "1.4.0" },
      }),
    ),
  );

  const screen = await renderModal(services);

  await expect
    .element(screen.getByText("La nube no acepta la versión de una caja", { exact: true }))
    .toBeVisible();
  await expect
    .element(
      screen.getByText(
        "La caja «Caja 1» usa la versión 1.4.0, que la nube ya no acepta. Hay que actualizarla para que vuelva a sincronizar.",
      ),
    )
    .toBeVisible();
  await expect.element(screen.getByText("Caja 1", { exact: true })).toBeVisible();
});

test("tells a quiet register's alert in plain language: what it is, what it means and what to do", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(
      baseDetail({
        kind: "register_silent",
        level: "critical",
        audience: "local",
        scope: "register-1",
        scopeDisplay: "Caja 1",
        detail: { deviceId: "device-1", lastAcceptedPushAt: "2026-01-05T11:30:00.000Z" },
      }),
    ),
  );

  const screen = await renderModal(services);

  await expect
    .element(screen.getByText("La caja no está sincronizando", { exact: true }))
    .toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Hace rato que esta caja no logra mandar nada a la nube durante el horario de atención.",
      ),
    )
    .toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Se puede seguir vendiendo con normalidad. Revisar la conexión a internet del local; en cuanto vuelva, la caja se pone al día sola. El Administrador ya fue avisado.",
      ),
    )
    .toBeVisible();
  await expect.element(screen.getByText("Caja 1", { exact: true })).toBeVisible();
});

test("tells a register that can't sell in plain language: what it is, what it means and what to do", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(
      baseDetail({
        kind: "sales_denied",
        level: "critical",
        audience: "local",
        scope: "register-1",
        scopeDisplay: "Caja 1",
        detail: { deviceId: "device-1", reason: "event_history_broken" },
      }),
    ),
  );

  const screen = await renderModal(services);

  await expect.element(screen.getByText("La caja no puede vender", { exact: true })).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Esta caja dejó de abrir ventas nuevas porque encontró un problema en su registro de operaciones.",
      ),
    )
    .toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Avisar al Administrador de inmediato; ya fue notificado, pero conviene confirmarle la situación.",
      ),
    )
    .toBeVisible();
  await expect.element(screen.getByText("Caja 1", { exact: true })).toBeVisible();
});

test("names a register that can't sell by what happened when the alert is not for the Local audience", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(
      baseDetail({
        kind: "sales_denied",
        level: "critical",
        audience: "all",
        scope: "register-1",
        scopeDisplay: "Caja 1",
        detail: { deviceId: "device-1", reason: "event_history_broken" },
      }),
    ),
  );

  const screen = await renderModal(services);

  await expect
    .element(screen.getByText("Una caja dejó de abrir ventas nuevas", { exact: true }))
    .toBeVisible();
  await expect.element(screen.getByText("La caja no puede vender")).not.toBeInTheDocument();
});

test.each([
  ["content", "Contenido del comprobante"],
  ["standing", "Situación ante ARCA"],
] as const)(
  "tells an invoice ARCA rejected over its %s: that each sale of the point of sale is deferred, the cause and each code with ARCA's message",
  async (rejectionClass, classLabel) => {
    const services = createServices();
    vi.mocked(services.fetchAlert).mockResolvedValue(
      ok(
        baseDetail({
          kind: "fiscal_rejected",
          level: "critical",
          audience: "all",
          scope: "12:factura_c",
          scopeDisplay: "12:factura_c",
          detail: {
            pointOfSale: 12,
            documentType: "factura_c",
            rejectionClass,
            fiscalDocumentId: "fiscal-document-1",
            saleId: "sale-1",
            rejections: [
              { code: 10242, message: "El valor de CondicionIVAReceptorId es invalido." },
              { code: 10015, message: "Debe informar el documento." },
            ],
          },
        }),
      ),
    );

    const screen = await renderModal(services);

    await expect
      .element(screen.getByText("ARCA rechazó una factura", { exact: true }))
      .toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Cada venta de este punto de venta queda diferida hasta corregir la causa que indica ARCA.",
          { exact: true },
        ),
      )
      .toBeVisible();
    await expect.element(screen.getByText(classLabel, { exact: true })).toBeVisible();
    await expect
      .element(screen.getByText("10242: El valor de CondicionIVAReceptorId es invalido."))
      .toBeVisible();
    await expect.element(screen.getByText("10015: Debe informar el documento.")).toBeVisible();
    await expect
      .element(screen.getByText("Punto de venta 12 · Factura C", { exact: true }))
      .toBeVisible();
  },
);

test("shows the fixed plain-language text only for an alert the cloud says is for the Local audience", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(
      baseDetail({
        kind: "register_silent",
        level: "critical",
        audience: "all",
        scope: "register-1",
        scopeDisplay: "Caja 1",
        detail: { deviceId: "device-1", lastAcceptedPushAt: "2026-01-05T11:30:00.000Z" },
      }),
    ),
  );

  const screen = await renderModal(services);

  await expect.element(screen.getByText("Caja 1", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("La caja no está sincronizando")).not.toBeInTheDocument();
  await expect.element(screen.getByText(/Hace rato que esta caja/)).not.toBeInTheDocument();
});

test("says nothing about closing by hand for an open alert the cloud says resolves by itself", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(
      baseDetail({
        kind: "register_silent",
        level: "critical",
        audience: "local",
        scope: "register-1",
        scopeDisplay: "Caja 1",
        resolvesByItself: true,
        detail: { deviceId: "device-1", lastAcceptedPushAt: "2026-01-05T11:30:00.000Z" },
      }),
    ),
  );

  const screen = await renderModal(services);

  await expect.element(screen.getByText("Caja 1", { exact: true })).toBeVisible();
  expect(screen.getByText(/No se cierra sola/).query()).toBeNull();
});

test("names the homologation environment of an expiring ARCA certificate", async () => {
  const services = createServices();
  vi.mocked(services.fetchAlert).mockResolvedValue(
    ok(
      baseDetail({
        kind: "arca_certificate_expiring",
        scope: "homologation",
        scopeDisplay: "homologation",
        detail: { notAfter: "2026-11-20T15:30:00.000Z" },
      }),
    ),
  );

  const screen = await renderModal(services);

  await expect
    .element(screen.getByText(/El certificado de ARCA de homologación vence el/))
    .toBeVisible();
});
