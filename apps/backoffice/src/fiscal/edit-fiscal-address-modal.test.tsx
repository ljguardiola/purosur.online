import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { type Locator, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  EditFiscalAddressModal,
  type EditFiscalAddressModalServices,
} from "./edit-fiscal-address-modal";
import type { FiscalAddress } from "./fiscal-addresses-api";

function createServices(
  overrides: Partial<EditFiscalAddressModalServices> = {},
): EditFiscalAddressModalServices {
  return {
    editFiscalAddress: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

const depot: FiscalAddress = {
  id: "address-1",
  name: "Depósito Central",
  streetAddress: "Calle Ficticia 123, CABA",
  version: 2,
};

type ModalOptions = {
  target?: FiscalAddress | null;
  services?: EditFiscalAddressModalServices;
  onClose?: () => void;
  onSaved?: () => void;
  reload?: () => Promise<{ kind: "ok"; value: FiscalAddress[] }>;
  onSessionEnded?: () => void;
};

function reloaded(...value: FiscalAddress[]) {
  return Promise.resolve({ kind: "ok", value } as const);
}

function modalElement({
  target = depot,
  services = createServices(),
  onClose = () => {},
  onSaved = () => {},
  reload = () => reloaded(depot),
  onSessionEnded = () => {},
}: ModalOptions) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <EditFiscalAddressModal
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
  const dialog = screen.getByRole("dialog", { name: "Editar el domicilio fiscal" });
  await expect.element(dialog).toBeVisible();
  return { screen, dialog };
}

function save(dialog: Locator) {
  return userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
}

test("opens with the address's name and street address", async () => {
  const { dialog } = await renderModal();

  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Depósito Central");
  await expect
    .element(dialog.getByRole("textbox", { name: /^Dirección/ }))
    .toHaveValue("Calle Ficticia 123, CABA");
  await expectNoAccessibilityViolations(document.body);
});

test("Cancelar asks to close without calling the cloud", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const { dialog } = await renderModal({ services, onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.editFiscalAddress).not.toHaveBeenCalled();
});

test("requires the name and the address, without calling the cloud", async () => {
  const services = createServices();
  const { dialog } = await renderModal({ services });
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Dirección/ }), "");

  await save(dialog);

  await expect.element(dialog.getByText("Ingresá el nombre del domicilio fiscal.")).toBeVisible();
  await expect
    .element(dialog.getByText("Ingresá la dirección del domicilio fiscal."))
    .toBeVisible();
  expect(services.editFiscalAddress).not.toHaveBeenCalled();
});

test("saves the edit with the version loaded, reads the data again and reports it saved", async () => {
  const services = createServices();
  vi.mocked(services.editFiscalAddress).mockResolvedValue({ kind: "ok" });
  const reload = vi.fn(() => reloaded(depot));
  const onSaved = vi.fn();
  const { dialog } = await renderModal({ services, reload, onSaved });
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Dirección/ }), " Calle Inventada 9 ");

  await save(dialog);

  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
  expect(services.editFiscalAddress).toHaveBeenCalledWith("address-1", {
    name: "Depósito Central",
    street_address: "Calle Inventada 9",
    version: 2,
  });
  expect(reload).toHaveBeenCalledTimes(1);
  expect(onSaved).toHaveBeenCalledWith("Depósito Central");
});

test("opens the authorization modal on authorization_required, then authorizes and retries", async () => {
  const services = createServices();
  vi.mocked(services.editFiscalAddress).mockResolvedValueOnce({ kind: "authorization_required" });
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: { challenge: "session-auth" } as never,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue({ id: "existing-cred" } as never);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
  vi.mocked(services.editFiscalAddress).mockResolvedValueOnce({ kind: "ok" });
  const onSaved = vi.fn();
  const { screen, dialog } = await renderModal({ services, onSaved });

  await save(dialog);
  await expect.element(screen.getByRole("heading", { name: "Autorizá este cambio" })).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
  expect(services.editFiscalAddress).toHaveBeenCalledTimes(2);
});

test("says the name is taken, on the name's field", async () => {
  const services = createServices();
  vi.mocked(services.editFiscalAddress).mockResolvedValue({ kind: "name_taken" });
  const { dialog } = await renderModal({ services });

  await save(dialog);

  await expect
    .element(dialog.getByText("Ya hay un domicilio fiscal con ese nombre."))
    .toBeVisible();
});

test("shows the message of the field the cloud refused", async () => {
  const services = createServices();
  vi.mocked(services.editFiscalAddress).mockResolvedValue({
    kind: "validation_failed",
    field: "name",
  });
  const { dialog } = await renderModal({ services });

  await save(dialog);

  await expect.element(dialog.getByText("Ese nombre es demasiado largo.")).toBeVisible();
});

test("shows the attempt-failed notice when the save fails", async () => {
  const services = createServices();
  vi.mocked(services.editFiscalAddress).mockResolvedValue({ kind: "failed" });
  const { dialog } = await renderModal({ services });

  await save(dialog);

  await expect.element(dialog.getByText("No se pudo guardar el cambio")).toBeVisible();
  await expect.element(dialog.getByText("Probá de nuevo.")).toBeVisible();
});

test("shows the rate-limit notice with the wait", async () => {
  const services = createServices();
  vi.mocked(services.editFiscalAddress).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 30,
  });
  const { dialog } = await renderModal({ services });

  await save(dialog);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.editFiscalAddress).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal({ services, onSessionEnded });

  await save(dialog);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("reads the data again when the address is gone", async () => {
  const services = createServices();
  vi.mocked(services.editFiscalAddress).mockResolvedValue({ kind: "not_found" });
  const reload = vi.fn(() => reloaded());
  const { dialog } = await renderModal({ services, reload });

  await save(dialog);

  await expect.poll(() => reload.mock.calls.length).toBe(1);
});

function ReloadingModal({
  services,
  changed,
}: {
  services: EditFiscalAddressModalServices;
  changed: FiscalAddress;
}) {
  const [target, setTarget] = useState(depot);
  return modalElement({
    target,
    services,
    reload: () => {
      setTarget(changed);
      return reloaded(changed);
    },
  });
}

test("shows a stale-version notice, and Recargar reads the data again so the second save sends the new version", async () => {
  const services = createServices();
  vi.mocked(services.editFiscalAddress).mockResolvedValueOnce({ kind: "stale_version" });
  const changed: FiscalAddress = { ...depot, name: "Depósito Sur", version: 5 };
  const screen = await render(<ReloadingModal services={services} changed={changed} />);
  const dialog = screen.getByRole("dialog", { name: "Editar el domicilio fiscal" });
  await save(dialog);
  await expect
    .element(dialog.getByText("El domicilio fiscal cambió mientras lo editabas"))
    .toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Depósito Sur");
  vi.mocked(services.editFiscalAddress).mockResolvedValueOnce({ kind: "ok" });
  await save(dialog);
  await expect.poll(() => vi.mocked(services.editFiscalAddress).mock.calls.length).toBe(2);
  expect(services.editFiscalAddress).toHaveBeenLastCalledWith("address-1", {
    name: "Depósito Sur",
    street_address: "Calle Ficticia 123, CABA",
    version: 5,
  });
});
