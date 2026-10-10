import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { type Locator, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  EditRegisterOfflinePointOfSaleModal,
  type EditRegisterOfflinePointOfSaleModalServices,
} from "./edit-register-offline-point-of-sale-modal";
import type { RegisterPointOfSale } from "./register-points-of-sale-api";

function createServices(
  overrides: Partial<EditRegisterOfflinePointOfSaleModalServices> = {},
): EditRegisterOfflinePointOfSaleModalServices {
  return {
    configureRegisterOfflinePointOfSale: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

const configured: RegisterPointOfSale = {
  registerId: "register-1",
  registerName: "Caja 1",
  pointOfSaleNumber: 12,
  fiscalAddressId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  version: 2,
  offlinePointOfSaleNumber: 13,
  offlineVersion: 4,
};

const withoutOffline: RegisterPointOfSale = {
  ...configured,
  offlinePointOfSaleNumber: null,
  offlineVersion: 0,
};

type ModalOptions = {
  target?: RegisterPointOfSale | null;
  services?: EditRegisterOfflinePointOfSaleModalServices;
  onClose?: () => void;
  onSaved?: () => void;
  reload?: () => Promise<{ kind: "ok"; value: RegisterPointOfSale[] }>;
  onSessionEnded?: () => void;
};

function reloaded(...value: RegisterPointOfSale[]) {
  return Promise.resolve({ kind: "ok", value } as const);
}

function modalElement({
  target = configured,
  services = createServices(),
  onClose = () => {},
  onSaved = () => {},
  reload = () => reloaded(configured),
  onSessionEnded = () => {},
}: ModalOptions) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <EditRegisterOfflinePointOfSaleModal
          target={target}
          services={services}
          onClose={onClose}
          onSaved={onSaved}
          reload={reload}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>
  );
}

async function renderModal(options: ModalOptions = {}) {
  const screen = await render(modalElement(options));
  return { screen, dialog: screen.getByRole("dialog", { name: "Caja 1" }) };
}

function save(dialog: Locator) {
  return userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
}

function numberField(dialog: Locator) {
  return dialog.getByRole("textbox", { name: /^Punto de venta CAEA/ });
}

test("names the register under a Punto de venta CAEA eyebrow, prefills its offline number and asks for no fiscal address", async () => {
  const { dialog } = await renderModal();

  await expect
    .element(dialog.getByText("Punto de venta CAEA", { exact: true }).first())
    .toBeVisible();
  await expect.element(numberField(dialog)).toHaveValue("13");
  expect(dialog.getByRole("button", { name: /Domicilio fiscal/ }).query()).toBeNull();
  await expect
    .element(
      dialog
        .getByText(
          "Tiene que ser un punto de venta CAEA dado de alta en ARCA solo para esta caja, en el mismo domicilio que su punto de venta CAE.",
        )
        .first(),
    )
    .toBeVisible();
  await expectNoAccessibilityViolations(document.body);
});

test("Cancelar asks to close without calling the cloud", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const { dialog } = await renderModal({ services, onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.configureRegisterOfflinePointOfSale).not.toHaveBeenCalled();
});

test("requires the offline number of a register without one, without calling the cloud", async () => {
  const services = createServices();
  const { dialog } = await renderModal({ target: withoutOffline, services });

  await save(dialog);

  await expect.element(dialog.getByText("Ingresá el punto de venta.")).toBeVisible();
  expect(services.configureRegisterOfflinePointOfSale).not.toHaveBeenCalled();
});

test("asks to review a number that is not a point of sale, without calling the cloud", async () => {
  const services = createServices();
  const { dialog } = await renderModal({ services });
  await userEvent.fill(numberField(dialog), "trece");

  await save(dialog);

  await expect.element(dialog.getByText("Revisá el punto de venta.")).toBeVisible();
  expect(services.configureRegisterOfflinePointOfSale).not.toHaveBeenCalled();
});

test("saves the typed number with the offline version, reads the data again and reports it saved", async () => {
  const services = createServices();
  vi.mocked(services.configureRegisterOfflinePointOfSale).mockResolvedValue({ kind: "ok" });
  const reload = vi.fn(() => reloaded(configured));
  const onSaved = vi.fn();
  const { dialog } = await renderModal({ services, reload, onSaved });
  await userEvent.fill(numberField(dialog), "9");

  await save(dialog);

  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
  expect(services.configureRegisterOfflinePointOfSale).toHaveBeenCalledWith("register-1", {
    point_of_sale_number: 9,
    version: 4,
  });
  expect(reload).toHaveBeenCalledTimes(1);
});

test("opens the authorization modal on authorization_required, then authorizes and retries the save", async () => {
  const services = createServices();
  vi.mocked(services.configureRegisterOfflinePointOfSale).mockResolvedValueOnce({
    kind: "authorization_required",
  });
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: { challenge: "session-auth" } as never,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue({ id: "existing-cred" } as never);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
  vi.mocked(services.configureRegisterOfflinePointOfSale).mockResolvedValueOnce({ kind: "ok" });
  const onSaved = vi.fn();
  const { screen, dialog } = await renderModal({ services, onSaved });

  await save(dialog);
  await expect.element(screen.getByRole("heading", { name: "Autorizá este cambio" })).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
  expect(services.configureRegisterOfflinePointOfSale).toHaveBeenCalledTimes(2);
});

test("says the number is already assigned, on the number's field", async () => {
  const services = createServices();
  vi.mocked(services.configureRegisterOfflinePointOfSale).mockResolvedValue({
    kind: "point_of_sale_taken",
  });
  const onSaved = vi.fn();
  const { dialog } = await renderModal({ services, onSaved });

  await save(dialog);

  await expect.element(dialog.getByText("Ese punto de venta ya está asignado.")).toBeVisible();
  expect(onSaved).not.toHaveBeenCalled();
});

test("says to configure the CAE point of sale first when the register has none", async () => {
  const services = createServices();
  vi.mocked(services.configureRegisterOfflinePointOfSale).mockResolvedValue({
    kind: "real_time_point_of_sale_missing",
  });
  const onSaved = vi.fn();
  const { dialog } = await renderModal({ services, onSaved });

  await save(dialog);

  await expect.element(dialog.getByText("Falta el punto de venta CAE")).toBeVisible();
  await expect
    .element(dialog.getByText("Configurá primero el punto de venta CAE de esta caja."))
    .toBeVisible();
  expect(onSaved).not.toHaveBeenCalled();
});

test("shows the message of the field the cloud refused", async () => {
  const services = createServices();
  vi.mocked(services.configureRegisterOfflinePointOfSale).mockResolvedValue({
    kind: "validation_failed",
    field: "point_of_sale_number",
  });
  const { dialog } = await renderModal({ services });

  await save(dialog);

  await expect.element(dialog.getByText("Revisá el punto de venta.")).toBeVisible();
});

test("shows the attempt-failed notice when the save fails", async () => {
  const services = createServices();
  vi.mocked(services.configureRegisterOfflinePointOfSale).mockResolvedValue({ kind: "failed" });
  const { dialog } = await renderModal({ services });

  await save(dialog);

  await expect.element(dialog.getByText("No se pudo guardar el cambio")).toBeVisible();
  await expect.element(dialog.getByText("Probá de nuevo.")).toBeVisible();
});

test("shows the rate-limit notice with the wait", async () => {
  const services = createServices();
  vi.mocked(services.configureRegisterOfflinePointOfSale).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 30,
  });
  const { dialog } = await renderModal({ services });

  await save(dialog);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.configureRegisterOfflinePointOfSale).mockResolvedValue({
    kind: "unauthenticated",
  });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal({ services, onSessionEnded });

  await save(dialog);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("reads the data again when the register is gone", async () => {
  const services = createServices();
  vi.mocked(services.configureRegisterOfflinePointOfSale).mockResolvedValue({
    kind: "not_found",
  });
  const reload = vi.fn(() => reloaded());
  const { dialog } = await renderModal({ services, reload });

  await save(dialog);

  await expect.poll(() => reload.mock.calls.length).toBe(1);
});

function ReloadingModal({
  services,
  changed,
}: {
  services: EditRegisterOfflinePointOfSaleModalServices;
  changed: RegisterPointOfSale;
}) {
  const [target, setTarget] = useState(configured);
  return modalElement({
    target,
    services,
    reload: () => {
      setTarget(changed);
      return reloaded(changed);
    },
  });
}

test("shows a stale-version notice, and Recargar brings the offline number and version so the second save sends them", async () => {
  const services = createServices();
  vi.mocked(services.configureRegisterOfflinePointOfSale).mockResolvedValueOnce({
    kind: "stale_version",
  });
  const changed: RegisterPointOfSale = {
    ...configured,
    offlinePointOfSaleNumber: 31,
    offlineVersion: 6,
  };
  const screen = await render(<ReloadingModal services={services} changed={changed} />);
  const dialog = screen.getByRole("dialog", { name: "Caja 1" });
  await save(dialog);
  await expect
    .element(dialog.getByText("El punto de venta cambió mientras lo editabas"))
    .toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect.element(numberField(dialog)).toHaveValue("31");
  vi.mocked(services.configureRegisterOfflinePointOfSale).mockResolvedValueOnce({ kind: "ok" });
  await save(dialog);
  await expect
    .poll(() => vi.mocked(services.configureRegisterOfflinePointOfSale).mock.calls.length)
    .toBe(2);
  expect(services.configureRegisterOfflinePointOfSale).toHaveBeenLastCalledWith("register-1", {
    point_of_sale_number: 31,
    version: 6,
  });
});
