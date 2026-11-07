import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { FiscalAddress } from "./fiscal-addresses-api";
import type { RegisterPointOfSalePanelSectionServices } from "./register-point-of-sale-panel-section";
import { RegisterPointOfSalePanelSection } from "./register-point-of-sale-panel-section";
import type { RegisterPointOfSale } from "./register-points-of-sale-api";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function createServices(
  overrides: Partial<RegisterPointOfSalePanelSectionServices> = {},
): RegisterPointOfSalePanelSectionServices {
  return {
    fetchRegisterPointsOfSale: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    fetchFiscalAddresses: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    configureRegisterPointOfSale: vi.fn(),
    configureRegisterOfflinePointOfSale: vi.fn(),
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
  version: 4,
};

const configuredRegister: RegisterPointOfSale = {
  registerId: "register-1",
  registerName: "Caja 1",
  pointOfSaleNumber: 12,
  fiscalAddressId: depot.id,
  version: 2,
  offlinePointOfSaleNumber: 13,
  offlineVersion: 4,
};

const pendingRegister: RegisterPointOfSale = {
  registerId: "register-2",
  registerName: "Caja 2",
  pointOfSaleNumber: null,
  fiscalAddressId: null,
  version: 0,
  offlinePointOfSaleNumber: null,
  offlineVersion: 0,
};

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function renderSection(
  services: RegisterPointOfSalePanelSectionServices,
  { registerId = "register-1", onSessionEnded = () => {} } = {},
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <RegisterPointOfSalePanelSection
          registerId={registerId}
          onSessionEnded={onSessionEnded}
          services={services}
        />
      </main>
    </FieldSizeProvider>,
  );
}

function serving(registers: RegisterPointOfSale[], addresses: FiscalAddress[]) {
  return createServices({
    fetchRegisterPointsOfSale: vi.fn().mockResolvedValue({ kind: "ok", value: registers }),
    fetchFiscalAddresses: vi.fn().mockResolvedValue({ kind: "ok", value: addresses }),
  });
}

test("shows the point of sale padded to five digits, its fiscal address's name and the CAEA point of sale of that register only", async () => {
  const screen = await renderSection(serving([pendingRegister, configuredRegister], [depot, shop]));

  await expect.element(screen.getByText("Punto de venta", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("00012")).toBeVisible();
  await expect.element(screen.getByText("Domicilio fiscal", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Depósito Central")).toBeVisible();
  await expect.element(screen.getByText("Punto de venta CAEA", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("00013")).toBeVisible();
  expect(screen.getByText("Sin configurar").query()).toBeNull();
});

test("shows Sin configurar for the three values of a register without a point of sale", async () => {
  const screen = await renderSection(serving([pendingRegister], [depot]), {
    registerId: "register-2",
  });

  await expect.element(screen.getByText("Sin configurar").first()).toBeVisible();
  expect(screen.getByText("Sin configurar").elements()).toHaveLength(3);
});

test("shows a placeholder while the data loads, with Editar and Editar CAEA disabled", async () => {
  const pending = deferred<{ kind: "ok"; value: RegisterPointOfSale[] }>();
  const services = createServices({
    fetchRegisterPointsOfSale: vi.fn().mockReturnValue(pending.promise),
  });

  const screen = await renderSection(services);

  await expect.element(screen.getByText("Cargando…").first()).toBeVisible();
  expect(screen.getByRole("button", { name: "Editar", exact: true }).query()).toBeNull();
  pending.resolve({ kind: "ok", value: [configuredRegister] });
  await expect.element(screen.getByRole("button", { name: "Editar", exact: true })).toBeEnabled();
  await expect.element(screen.getByRole("button", { name: "Editar CAEA" })).toBeEnabled();
});

test("shows a load failure, and Reintentar loads the data again", async () => {
  const services = createServices({
    fetchRegisterPointsOfSale: vi
      .fn()
      .mockResolvedValueOnce({ kind: "failed" })
      .mockResolvedValueOnce({ kind: "ok", value: [configuredRegister] }),
    fetchFiscalAddresses: vi.fn().mockResolvedValue({ kind: "ok", value: [depot] }),
  });
  const screen = await renderSection(services);
  await expect.element(screen.getByText("No pudimos abrir el punto de venta")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }).first());

  await expect.element(screen.getByText("00012")).toBeVisible();
});

test("says the register has no point of sale record when the cloud does not list it", async () => {
  const screen = await renderSection(serving([configuredRegister], [depot]), {
    registerId: "register-9",
  });

  await expect
    .element(screen.getByText("No encontramos el punto de venta de esta caja"))
    .toBeVisible();
  expect(screen.getByRole("button", { name: "Editar", exact: true }).query()).toBeNull();
});

test("sends to Mi cuenta when a load comes back forbidden", async () => {
  window.history.pushState(null, "", "/registers");
  const services = createServices({
    fetchFiscalAddresses: vi.fn().mockResolvedValue({ kind: "forbidden" }),
  });

  await renderSection(services);

  await expect
    .poll(() => window.location.pathname + window.location.search)
    .toBe("/?account=credentials");
});

test("ends the session when a load finds it closed", async () => {
  const services = createServices({
    fetchRegisterPointsOfSale: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
  });
  const onSessionEnded = vi.fn();

  await renderSection(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("Editar opens the register's modal with its number and fiscal address", async () => {
  const screen = await renderSection(serving([configuredRegister], [depot, shop]));
  await expect.element(screen.getByText("00012")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Editar", exact: true }));

  const dialog = screen.getByRole("dialog", { name: "Caja 1" });
  await expect.element(dialog.getByRole("textbox", { name: /^Punto de venta/ })).toHaveValue("12");
  await expect
    .element(dialog.getByRole("combobox", { name: /Domicilio fiscal/ }))
    .toHaveValue("Depósito Central");
});

test("Editar CAEA opens the register's offline point of sale modal, and saving reads the data again and announces it", async () => {
  const services = serving([configuredRegister], [depot]);
  vi.mocked(services.fetchRegisterPointsOfSale)
    .mockResolvedValueOnce({ kind: "ok", value: [configuredRegister] })
    .mockResolvedValue({
      kind: "ok",
      value: [{ ...configuredRegister, offlinePointOfSaleNumber: 8, offlineVersion: 5 }],
    });
  vi.mocked(services.configureRegisterOfflinePointOfSale).mockResolvedValue({ kind: "ok" });
  const screen = await renderSection(services);
  await userEvent.click(screen.getByRole("button", { name: "Editar CAEA" }));
  const dialog = screen.getByRole("dialog", { name: "Caja 1" });
  await expect
    .element(dialog.getByRole("textbox", { name: /^Punto de venta CAEA/ }))
    .toHaveValue("13");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Punto de venta CAEA/ }), "8");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  expect(services.configureRegisterOfflinePointOfSale).toHaveBeenCalledWith("register-1", {
    point_of_sale_number: 8,
    version: 4,
  });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("00008")).toBeVisible();
  await expect.element(screen.getByText("Punto de venta CAEA guardado")).toBeVisible();
});

test("saving the point of sale reads both lists again and announces it", async () => {
  const services = serving([configuredRegister], [depot, shop]);
  vi.mocked(services.fetchRegisterPointsOfSale)
    .mockResolvedValueOnce({ kind: "ok", value: [configuredRegister] })
    .mockResolvedValue({
      kind: "ok",
      value: [{ ...configuredRegister, pointOfSaleNumber: 7, version: 3 }],
    });
  vi.mocked(services.configureRegisterPointOfSale).mockResolvedValue({ kind: "ok" });
  const screen = await renderSection(services);
  await userEvent.click(screen.getByRole("button", { name: "Editar", exact: true }));
  const dialog = screen.getByRole("dialog", { name: "Caja 1" });
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Punto de venta/ }), "7");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  expect(services.configureRegisterPointOfSale).toHaveBeenCalledWith("register-1", {
    point_of_sale_number: 7,
    fiscal_address_id: depot.id,
    version: 2,
  });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("00007")).toBeVisible();
  await expect.element(screen.getByText("Punto de venta guardado")).toBeVisible();
  await expect.element(screen.getByText("Caja 1.")).toBeVisible();
  expect(services.fetchFiscalAddresses).toHaveBeenCalledTimes(2);
});

test("has no accessibility violations with the point of sale shown", async () => {
  const screen = await renderSection(serving([configuredRegister], [depot, shop]));
  await expect.element(screen.getByText("00012")).toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});
