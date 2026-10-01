import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { type Locator, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  NewFiscalAddressModal,
  type NewFiscalAddressModalServices,
} from "./new-fiscal-address-modal";

function createServices(
  overrides: Partial<NewFiscalAddressModalServices> = {},
): NewFiscalAddressModalServices {
  return {
    createFiscalAddress: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

type Handlers = {
  open?: boolean;
  onClose?: () => void;
  onCreated?: () => void;
  onSessionEnded?: () => void;
};

function modalFor(services: NewFiscalAddressModalServices, handlers: Handlers = {}) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <NewFiscalAddressModal
          open={handlers.open ?? true}
          onClose={handlers.onClose ?? (() => {})}
          onCreated={handlers.onCreated ?? (() => {})}
          onSessionEnded={handlers.onSessionEnded ?? (() => {})}
          services={services}
        />
      </main>
    </FieldSizeProvider>
  );
}

async function renderModal(services: NewFiscalAddressModalServices, handlers: Handlers = {}) {
  const screen = await render(modalFor(services, handlers));
  const dialog = screen.getByRole("dialog", { name: "Nuevo domicilio fiscal" });
  await expect.element(dialog).toBeVisible();
  return { screen, dialog };
}

async function fillAndSave(dialog: Locator, name: string, streetAddress: string) {
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), name);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Dirección/ }), streetAddress);
  await userEvent.click(dialog.getByRole("button", { name: "Crear el domicilio fiscal" }));
}

test("opens empty, with the name and the address to fill", async () => {
  const { dialog } = await renderModal(createServices());

  await expect.element(dialog.getByRole("textbox", { name: /^Nombre/ })).toHaveValue("");
  await expect.element(dialog.getByRole("textbox", { name: /^Dirección/ })).toHaveValue("");
  await expectNoAccessibilityViolations(document.body);
});

test("Cancelar asks to close without calling the cloud", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const { dialog } = await renderModal(services, { onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.createFiscalAddress).not.toHaveBeenCalled();
});

test("requires the name and the address, without calling the cloud", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: "Crear el domicilio fiscal" }));

  await expect.element(dialog.getByText("Ingresá el nombre del domicilio fiscal.")).toBeVisible();
  await expect
    .element(dialog.getByText("Ingresá la dirección del domicilio fiscal."))
    .toBeVisible();
  expect(services.createFiscalAddress).not.toHaveBeenCalled();
});

test("refuses a name and an address that are too long, without calling the cloud", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);

  await fillAndSave(dialog, "a".repeat(500), "b".repeat(500));

  await expect.element(dialog.getByText("Ese nombre es demasiado largo.")).toBeVisible();
  await expect.element(dialog.getByText("Esa dirección es demasiado larga.")).toBeVisible();
  expect(services.createFiscalAddress).not.toHaveBeenCalled();
});

test("creates the fiscal address from the trimmed values and reports it created", async () => {
  const services = createServices();
  vi.mocked(services.createFiscalAddress).mockResolvedValue({ kind: "ok" });
  const onCreated = vi.fn();
  const { dialog } = await renderModal(services, { onCreated });

  await fillAndSave(dialog, " Depósito Central ", " Calle Ficticia 123, CABA ");

  await expect.poll(() => onCreated.mock.calls.length).toBe(1);
  expect(services.createFiscalAddress).toHaveBeenCalledWith({
    name: "Depósito Central",
    street_address: "Calle Ficticia 123, CABA",
  });
  expect(onCreated).toHaveBeenCalledWith("Depósito Central");
});

test("opens the authorization modal on authorization_required, then authorizes and retries", async () => {
  const services = createServices();
  vi.mocked(services.createFiscalAddress).mockResolvedValueOnce({ kind: "authorization_required" });
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: { challenge: "session-auth" } as never,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue({ id: "existing-cred" } as never);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
  vi.mocked(services.createFiscalAddress).mockResolvedValueOnce({ kind: "ok" });
  const onCreated = vi.fn();
  const { screen, dialog } = await renderModal(services, { onCreated });

  await fillAndSave(dialog, "Depósito Central", "Calle Ficticia 123, CABA");
  await expect.element(screen.getByRole("heading", { name: "Autorizá este cambio" })).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => onCreated.mock.calls.length).toBe(1);
  expect(services.createFiscalAddress).toHaveBeenCalledTimes(2);
});

test("says the name is taken, on the name's field", async () => {
  const services = createServices();
  vi.mocked(services.createFiscalAddress).mockResolvedValue({ kind: "name_taken" });
  const onCreated = vi.fn();
  const { dialog } = await renderModal(services, { onCreated });

  await fillAndSave(dialog, "Depósito Central", "Calle Ficticia 123, CABA");

  await expect
    .element(dialog.getByText("Ya hay un domicilio fiscal con ese nombre."))
    .toBeVisible();
  expect(onCreated).not.toHaveBeenCalled();
});

test("shows the message of the field the cloud refused", async () => {
  const services = createServices();
  vi.mocked(services.createFiscalAddress).mockResolvedValue({
    kind: "validation_failed",
    field: "street_address",
  });
  const { dialog } = await renderModal(services);

  await fillAndSave(dialog, "Depósito Central", "Calle Ficticia 123, CABA");

  await expect.element(dialog.getByText("Esa dirección es demasiado larga.")).toBeVisible();
});

test("shows the attempt-failed notice when the creation fails", async () => {
  const services = createServices();
  vi.mocked(services.createFiscalAddress).mockResolvedValue({ kind: "failed" });
  const { dialog } = await renderModal(services);

  await fillAndSave(dialog, "Depósito Central", "Calle Ficticia 123, CABA");

  await expect.element(dialog.getByText("No se pudo crear el domicilio fiscal")).toBeVisible();
  await expect.element(dialog.getByText("Probá de nuevo.")).toBeVisible();
});

test("shows the rate-limit notice with the wait", async () => {
  const services = createServices();
  vi.mocked(services.createFiscalAddress).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 30,
  });
  const { dialog } = await renderModal(services);

  await fillAndSave(dialog, "Depósito Central", "Calle Ficticia 123, CABA");

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.createFiscalAddress).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal(services, { onSessionEnded });

  await fillAndSave(dialog, "Depósito Central", "Calle Ficticia 123, CABA");

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("empties the form each time it opens", async () => {
  const services = createServices();
  const { screen, dialog } = await renderModal(services);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Borrador");

  await screen.rerender(modalFor(services, { open: false }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await screen.rerender(modalFor(services, { open: true }));

  await expect
    .element(screen.getByRole("dialog").getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("");
});
