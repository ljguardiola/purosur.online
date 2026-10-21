import { formatPointOfSaleNumber } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { OfflinePointOfSale } from "./offline-points-of-sale-api";
import {
  RetireOfflinePointOfSaleModal,
  type RetireOfflinePointOfSaleModalServices,
} from "./retire-offline-point-of-sale-modal";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const target: OfflinePointOfSale = {
  pointOfSaleNumber: 6,
  registerId: "register-1",
  registerName: "Caja 1",
  retirable: true,
  retiredAt: null,
};

const title = `¿Dar de baja el punto de venta ${formatPointOfSaleNumber(6)}?`;

function createServices(): RetireOfflinePointOfSaleModalServices {
  return {
    retireOfflinePointOfSale: vi.fn(),
    fetchSessionAuthorizationOptions: vi
      .fn()
      .mockResolvedValue({ kind: "ok", value: { challenge: "session-auth" } }),
    authorizeSession: vi.fn().mockResolvedValue({ kind: "ok" }),
    startAuthentication: vi.fn().mockResolvedValue({ id: "existing-cred" }),
  };
}

type Handlers = {
  target?: OfflinePointOfSale | null;
  onClose?: () => void;
  onRetired?: (retired: OfflinePointOfSale) => void;
  onOutdated?: () => void;
  onSessionEnded?: () => void;
};

async function renderModal(
  services: RetireOfflinePointOfSaleModalServices,
  handlers: Handlers = {},
) {
  const screen = await render(
    <main>
      <RetireOfflinePointOfSaleModal
        target={handlers.target === undefined ? target : handlers.target}
        onClose={handlers.onClose ?? (() => {})}
        onRetired={handlers.onRetired ?? (() => {})}
        onOutdated={handlers.onOutdated ?? (() => {})}
        onSessionEnded={handlers.onSessionEnded ?? (() => {})}
        services={services}
      />
    </main>,
  );
  const dialog = screen.getByRole("dialog", { name: title });
  await expect.element(dialog).toBeVisible();
  return { screen, dialog };
}

type Dialog = Awaited<ReturnType<typeof renderModal>>["dialog"];

async function confirm(dialog: Dialog) {
  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));
}

test("asks about the point of sale by its number and says what retiring it does", async () => {
  const { dialog } = await renderModal(createServices());

  await expect.element(dialog.getByRole("heading", { name: title })).toBeVisible();
  await expect
    .element(dialog.getByText(/Dalo de baja acá solo después de darle la baja en ARCA/))
    .toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "Deja de deber los informes quincenales desde la quincena en curso, salvo los que ARCA informe como adeudados; los que ya debe siguen pendientes.",
        { exact: false },
      ),
    )
    .toBeVisible();
  await expect
    .element(dialog.getByText(/No se puede deshacer y ninguna caja podrá volver a usarlo/).first())
    .toBeVisible();
});

test("has no accessibility violations", async () => {
  const { dialog } = await renderModal(createServices());

  await expectNoAccessibilityViolations(dialog.element());
});

test("is closed without a point of sale to retire", async () => {
  const screen = await render(
    <main>
      <RetireOfflinePointOfSaleModal
        target={null}
        onClose={() => {}}
        onRetired={() => {}}
        onOutdated={() => {}}
        onSessionEnded={() => {}}
        services={createServices()}
      />
    </main>,
  );

  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("retires the point of sale, closes and reports it retired", async () => {
  const services = createServices();
  vi.mocked(services.retireOfflinePointOfSale).mockResolvedValue({
    kind: "retired",
    value: { pointOfSaleNumber: 6, retiredAt: "2026-10-20T12:00:00.000Z" },
  });
  const onClose = vi.fn();
  const onRetired = vi.fn();
  const { dialog } = await renderModal(services, { onClose, onRetired });

  await confirm(dialog);

  await expect.poll(() => onRetired.mock.calls.length).toBe(1);
  expect(onRetired).toHaveBeenCalledWith(target);
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.retireOfflinePointOfSale).toHaveBeenCalledWith(6);
});

test("cancelling closes without retiring", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const { dialog } = await renderModal(services, { onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.retireOfflinePointOfSale).not.toHaveBeenCalled();
});

test("asks for the passkey on authorization_required, then authorizes and retries", async () => {
  const services = createServices();
  vi.mocked(services.retireOfflinePointOfSale)
    .mockResolvedValueOnce({ kind: "authorization_required" })
    .mockResolvedValueOnce({
      kind: "retired",
      value: { pointOfSaleNumber: 6, retiredAt: "2026-10-20T12:00:00.000Z" },
    });
  const onRetired = vi.fn();
  const { screen, dialog } = await renderModal(services, { onRetired });

  await confirm(dialog);
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect
    .element(
      authDialog.getByText(
        "Dar de baja el punto de venta necesita tu autorización. Confirmala con tu passkey.",
      ),
    )
    .toBeVisible();
  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => vi.mocked(services.retireOfflinePointOfSale).mock.calls.length).toBe(2);
  await expect.poll(() => onRetired.mock.calls.length).toBe(1);
});

test("explains that a register now uses the point of sale and asks the screen to refresh", async () => {
  const services = createServices();
  vi.mocked(services.retireOfflinePointOfSale).mockResolvedValue({ kind: "assigned" });
  const onClose = vi.fn();
  const onOutdated = vi.fn();
  const { dialog } = await renderModal(services, { onClose, onOutdated });

  await confirm(dialog);

  await expect
    .element(dialog.getByText("Una caja usa este punto de venta: no se puede dar de baja.").first())
    .toBeVisible();
  expect(onOutdated).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
});

test("closes and asks the screen to refresh when the point of sale was already retired", async () => {
  const services = createServices();
  vi.mocked(services.retireOfflinePointOfSale).mockResolvedValue({ kind: "already_retired" });
  const onClose = vi.fn();
  const onOutdated = vi.fn();
  const onRetired = vi.fn();
  const { dialog } = await renderModal(services, { onClose, onOutdated, onRetired });

  await confirm(dialog);

  await expect.poll(() => onClose.mock.calls.length).toBe(1);
  expect(onOutdated).toHaveBeenCalledTimes(1);
  expect(onRetired).not.toHaveBeenCalled();
});

test("explains that the point of sale no longer exists and asks the screen to refresh", async () => {
  const services = createServices();
  vi.mocked(services.retireOfflinePointOfSale).mockResolvedValue({ kind: "not_found" });
  const onOutdated = vi.fn();
  const { dialog } = await renderModal(services, { onOutdated });

  await confirm(dialog);

  await expect.element(dialog.getByText("Este punto de venta ya no existe.").first()).toBeVisible();
  expect(onOutdated).toHaveBeenCalledTimes(1);
});

test("shows the rate-limited notice", async () => {
  const services = createServices();
  vi.mocked(services.retireOfflinePointOfSale).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const { dialog } = await renderModal(services);

  await confirm(dialog);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("shows the attempt-failed notice", async () => {
  const services = createServices();
  vi.mocked(services.retireOfflinePointOfSale).mockResolvedValue({ kind: "failed" });
  const { dialog } = await renderModal(services);

  await confirm(dialog);

  await expect.element(dialog.getByText("No se pudo dar de baja el punto de venta")).toBeVisible();
  await expect.element(dialog.getByText("Probá de nuevo.")).toBeVisible();
});

test("ends the session when the cloud no longer knows it", async () => {
  const services = createServices();
  vi.mocked(services.retireOfflinePointOfSale).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal(services, { onSessionEnded });

  await confirm(dialog);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
