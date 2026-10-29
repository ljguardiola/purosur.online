import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { type Locator, page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  EditRegisterPointOfSaleModal,
  type EditRegisterPointOfSaleModalServices,
} from "./edit-register-point-of-sale-modal";
import type { FiscalAddress } from "./fiscal-addresses-api";
import type { RegisterPointOfSale } from "./register-points-of-sale-api";

function createServices(
  overrides: Partial<EditRegisterPointOfSaleModalServices> = {},
): EditRegisterPointOfSaleModalServices {
  return {
    configureRegisterPointOfSale: vi.fn(),
    createFiscalAddress: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

const depot: FiscalAddress = {
  id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  name: "Depósito Central",
  streetAddress: "Calle Ficticia 123, CABA",
  version: 1,
};

const shop: FiscalAddress = {
  id: "0b2f6a4e-5d1c-4f8a-9a31-6f4b8c2d7e10",
  name: "Local Norte",
  streetAddress: "Avenida Inventada 45, CABA",
  version: 1,
};

const configured: RegisterPointOfSale = {
  registerId: "register-1",
  registerName: "Caja 1",
  pointOfSaleNumber: 12,
  fiscalAddressId: depot.id,
  version: 2,
  offlinePointOfSaleNumber: 13,
  offlineVersion: 4,
};

const neverConfigured: RegisterPointOfSale = {
  ...configured,
  pointOfSaleNumber: null,
  fiscalAddressId: null,
  version: 0,
  offlinePointOfSaleNumber: null,
  offlineVersion: 0,
};

type ModalOptions = {
  target?: RegisterPointOfSale | null;
  fiscalAddresses?: FiscalAddress[];
  services?: EditRegisterPointOfSaleModalServices;
  onClose?: () => void;
  onSaved?: () => void;
  reload?: () => Promise<{ kind: "ok"; value: RegisterPointOfSale[] }>;
  refreshFiscalAddresses?: () => Promise<unknown>;
  onSessionEnded?: () => void;
};

function reloaded(...value: RegisterPointOfSale[]) {
  return Promise.resolve({ kind: "ok", value } as const);
}

function modalElement({
  target = configured,
  fiscalAddresses = [depot, shop],
  services = createServices(),
  onClose = () => {},
  onSaved = () => {},
  reload = () => reloaded(configured),
  refreshFiscalAddresses = () => Promise.resolve(),
  onSessionEnded = () => {},
}: ModalOptions) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <EditRegisterPointOfSaleModal
          target={target}
          fiscalAddresses={fiscalAddresses}
          services={services}
          onClose={onClose}
          onSaved={onSaved}
          reload={reload}
          refreshFiscalAddresses={refreshFiscalAddresses}
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

async function chooseFiscalAddress(
  screen: Awaited<ReturnType<typeof renderModal>>["screen"],
  dialog: Locator,
  name: string,
) {
  await userEvent.click(dialog.getByRole("combobox", { name: /Domicilio fiscal/ }));
  await userEvent.click(screen.getByRole("option", { name }));
}

test("names the register under a Punto de venta eyebrow and prefills the number and the address", async () => {
  const { dialog } = await renderModal();

  await expect.element(dialog.getByText("Punto de venta", { exact: true }).first()).toBeVisible();
  await expect.element(dialog.getByRole("textbox", { name: /^Punto de venta/ })).toHaveValue("12");
  await expect
    .element(dialog.getByRole("combobox", { name: /Domicilio fiscal/ }))
    .toHaveValue("Depósito Central");
  await expect
    .element(
      dialog
        .getByText(
          "Tiene que ser un punto de venta dado de alta en ARCA solo para esta caja y que no se use en ningún otro sistema.",
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
  expect(services.configureRegisterPointOfSale).not.toHaveBeenCalled();
});

test("requires the number and the fiscal address of a register never configured, without calling the cloud", async () => {
  const services = createServices();
  const { dialog } = await renderModal({ target: neverConfigured, services });

  await save(dialog);

  await expect.element(dialog.getByText("Ingresá el punto de venta.")).toBeVisible();
  await expect.element(dialog.getByText("Elegí el domicilio fiscal.")).toBeVisible();
  expect(services.configureRegisterPointOfSale).not.toHaveBeenCalled();
});

test("asks to review a number that is not a point of sale, without calling the cloud", async () => {
  const services = createServices();
  const { dialog } = await renderModal({ services });
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Punto de venta/ }), "doce");

  await save(dialog);

  await expect.element(dialog.getByText("Revisá el punto de venta.")).toBeVisible();
  expect(services.configureRegisterPointOfSale).not.toHaveBeenCalled();
});

test("saves the typed number and the chosen address with the version loaded, reads the data again and reports it saved", async () => {
  const services = createServices();
  vi.mocked(services.configureRegisterPointOfSale).mockResolvedValue({ kind: "ok" });
  const reload = vi.fn(() => reloaded(configured));
  const onSaved = vi.fn();
  const { screen, dialog } = await renderModal({ services, reload, onSaved });
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Punto de venta/ }), "7");
  await chooseFiscalAddress(screen, dialog, "Local Norte");

  await save(dialog);

  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
  expect(services.configureRegisterPointOfSale).toHaveBeenCalledWith("register-1", {
    point_of_sale_number: 7,
    fiscal_address_id: shop.id,
    version: 2,
  });
  expect(reload).toHaveBeenCalledTimes(1);
});

test("opens the authorization modal on authorization_required, then authorizes and retries the save", async () => {
  const services = createServices();
  vi.mocked(services.configureRegisterPointOfSale).mockResolvedValueOnce({
    kind: "authorization_required",
  });
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: { challenge: "session-auth" } as never,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue({ id: "existing-cred" } as never);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
  vi.mocked(services.configureRegisterPointOfSale).mockResolvedValueOnce({ kind: "ok" });
  const onSaved = vi.fn();
  const { screen, dialog } = await renderModal({ services, onSaved });

  await save(dialog);
  await expect.element(screen.getByRole("heading", { name: "Autorizá este cambio" })).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
  expect(services.configureRegisterPointOfSale).toHaveBeenCalledTimes(2);
});

test("says the number is already assigned, on the number's field", async () => {
  const services = createServices();
  vi.mocked(services.configureRegisterPointOfSale).mockResolvedValue({
    kind: "point_of_sale_taken",
  });
  const onSaved = vi.fn();
  const { dialog } = await renderModal({ services, onSaved });

  await save(dialog);

  await expect.element(dialog.getByText("Ese punto de venta ya está asignado.")).toBeVisible();
  expect(onSaved).not.toHaveBeenCalled();
});

test("shows the message of the field the cloud refused", async () => {
  const services = createServices();
  vi.mocked(services.configureRegisterPointOfSale).mockResolvedValue({
    kind: "validation_failed",
    field: "fiscal_address_id",
  });
  const { dialog } = await renderModal({ services });

  await save(dialog);

  await expect.element(dialog.getByText("Elegí el domicilio fiscal.")).toBeVisible();
});

test("shows the attempt-failed notice when the save fails", async () => {
  const services = createServices();
  vi.mocked(services.configureRegisterPointOfSale).mockResolvedValue({ kind: "failed" });
  const { dialog } = await renderModal({ services });

  await save(dialog);

  await expect.element(dialog.getByText("No se pudo guardar el cambio")).toBeVisible();
  await expect.element(dialog.getByText("Probá de nuevo.")).toBeVisible();
});

test("shows the rate-limit notice with the wait", async () => {
  const services = createServices();
  vi.mocked(services.configureRegisterPointOfSale).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 30,
  });
  const { dialog } = await renderModal({ services });

  await save(dialog);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
});

test("ends the session when the cloud says it is over", async () => {
  const services = createServices();
  vi.mocked(services.configureRegisterPointOfSale).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal({ services, onSessionEnded });

  await save(dialog);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("reads the data again when the register is gone", async () => {
  const services = createServices();
  vi.mocked(services.configureRegisterPointOfSale).mockResolvedValue({ kind: "not_found" });
  const reload = vi.fn(() => reloaded());
  const { dialog } = await renderModal({ services, reload });

  await save(dialog);

  await expect.poll(() => reload.mock.calls.length).toBe(1);
});

function ReloadingModal({
  services,
  changed,
}: {
  services: EditRegisterPointOfSaleModalServices;
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

test("shows a stale-version notice, and Recargar reads the data again so the second save sends the new version", async () => {
  const services = createServices();
  vi.mocked(services.configureRegisterPointOfSale).mockResolvedValueOnce({
    kind: "stale_version",
  });
  const changed: RegisterPointOfSale = { ...configured, pointOfSaleNumber: 30, version: 5 };
  const screen = await render(<ReloadingModal services={services} changed={changed} />);
  const dialog = screen.getByRole("dialog", { name: "Caja 1" });
  await save(dialog);
  await expect
    .element(dialog.getByText("El punto de venta cambió mientras lo editabas"))
    .toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect.element(dialog.getByRole("textbox", { name: /^Punto de venta/ })).toHaveValue("30");
  vi.mocked(services.configureRegisterPointOfSale).mockResolvedValueOnce({ kind: "ok" });
  await save(dialog);
  await expect
    .poll(() => vi.mocked(services.configureRegisterPointOfSale).mock.calls.length)
    .toBe(2);
  expect(services.configureRegisterPointOfSale).toHaveBeenLastCalledWith("register-1", {
    point_of_sale_number: 30,
    fiscal_address_id: depot.id,
    version: 5,
  });
});

test("without fiscal addresses it says to load one first and cannot save", async () => {
  const services = createServices();
  const { dialog } = await renderModal({ fiscalAddresses: [], services });

  await expect.element(dialog.getByText("Todavía no hay domicilios fiscales")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Guardar los cambios" })).toBeDisabled();
});

test("typing in the fiscal address offers only the matching addresses", async () => {
  const { dialog } = await renderModal();

  await userEvent.fill(dialog.getByRole("combobox", { name: /Domicilio fiscal/ }), "norte");
  expect(
    page
      .getByRole("option")
      .all()
      .map((option) => option.element().textContent),
  ).toEqual(["Local Norte"]);
});

const southShop: FiscalAddress = {
  id: "5d1c4f8a-0b2f-4a4e-9a31-6f4b8c2d7e11",
  name: "Local Sur",
  streetAddress: "Calle Ficticia 9, CABA",
  version: 1,
};

async function createFiscalAddressFromSelector(
  dialog: Locator,
  services: EditRegisterPointOfSaleModalServices,
) {
  vi.mocked(services.createFiscalAddress).mockResolvedValue({
    kind: "ok",
    fiscalAddress: southShop,
  });
  await userEvent.fill(dialog.getByRole("combobox", { name: /Domicilio fiscal/ }), "Local Sur");
  await userEvent.click(page.getByRole("option", { name: "Crear domicilio fiscal «Local Sur»" }));
  const stacked = page.getByRole("dialog", { name: "Nuevo domicilio fiscal" });
  await expect.element(stacked.getByRole("textbox", { name: /^Nombre/ })).toHaveValue("Local Sur");
  await userEvent.fill(stacked.getByRole("textbox", { name: /^Dirección/ }), "Calle Ficticia 9");
  await userEvent.click(stacked.getByRole("button", { name: "Crear el domicilio fiscal" }));
}

test("typing a fiscal address that does not exist offers to create it, then selects it keeping the number typed", async () => {
  const services = createServices();
  const { dialog } = await renderModal({ services });
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Punto de venta/ }), "15");

  await createFiscalAddressFromSelector(dialog, services);

  await expect
    .element(dialog.getByRole("combobox", { name: /Domicilio fiscal/ }))
    .toHaveValue("Local Sur");
  await expect.element(dialog.getByRole("textbox", { name: /^Punto de venta/ })).toHaveValue("15");
  expect(services.createFiscalAddress).toHaveBeenCalledWith({
    name: "Local Sur",
    street_address: "Calle Ficticia 9",
  });
});

test("reads the fiscal addresses again only once the modal closes after creating one", async () => {
  const services = createServices();
  const refreshFiscalAddresses = vi.fn(() => Promise.resolve());
  const { dialog } = await renderModal({ services, refreshFiscalAddresses });

  await createFiscalAddressFromSelector(dialog, services);
  await expect
    .element(dialog.getByRole("combobox", { name: /Domicilio fiscal/ }))
    .toHaveValue("Local Sur");
  expect(refreshFiscalAddresses).not.toHaveBeenCalled();
  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(refreshFiscalAddresses).toHaveBeenCalledTimes(1);
});

test("typing part of an existing fiscal address offers it and no creation entry", async () => {
  const { dialog } = await renderModal();

  await userEvent.fill(dialog.getByRole("combobox", { name: /Domicilio fiscal/ }), "local");

  await expect.element(page.getByRole("option", { name: "Local Norte" })).toBeVisible();
  expect(page.getByRole("option", { name: /^Crear domicilio fiscal/ }).query()).toBeNull();
});
