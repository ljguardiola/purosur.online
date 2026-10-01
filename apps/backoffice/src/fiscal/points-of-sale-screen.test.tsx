import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { FiscalAddress } from "./fiscal-addresses-api";
import { PointsOfSaleScreen } from "./points-of-sale-screen";
import type { PointsOfSaleScreenServices } from "./points-of-sale-services";
import type { RegisterPointOfSale } from "./register-points-of-sale-api";

function createServices(
  overrides: Partial<PointsOfSaleScreenServices> = {},
): PointsOfSaleScreenServices {
  return {
    fetchRegisterPointsOfSale: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    fetchFiscalAddresses: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    configureRegisterPointOfSale: vi.fn(),
    createFiscalAddress: vi.fn(),
    editFiscalAddress: vi.fn(),
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
};

const pendingRegister: RegisterPointOfSale = {
  registerId: "register-2",
  registerName: "Caja 2",
  pointOfSaleNumber: null,
  fiscalAddressId: null,
  version: 0,
};

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function renderScreen(services: PointsOfSaleScreenServices, onSessionEnded: () => void = () => {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <PointsOfSaleScreen services={services} onSessionEnded={onSessionEnded} />
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

test("shows the breadcrumb and the heading", async () => {
  const screen = await renderScreen(createServices());

  await expect.element(screen.getByText("Caja y fiscal · Fiscal")).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Puntos de venta", level: 1 }))
    .toBeVisible();
});

test("shows each register with its point of sale padded to five digits and its fiscal address's name", async () => {
  const screen = await renderScreen(serving([configuredRegister], [depot, shop]));

  await expect.element(screen.getByRole("heading", { name: "Caja 1", level: 2 })).toBeVisible();
  await expect.element(screen.getByText("Punto de venta", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("00012")).toBeVisible();
  await expect.element(screen.getByText("Domicilio fiscal", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Depósito Central").first()).toBeVisible();
});

test("shows Sin configurar for both values of a register without a point of sale", async () => {
  const screen = await renderScreen(serving([pendingRegister], [depot]));

  await expect.element(screen.getByRole("heading", { name: "Caja 2", level: 2 })).toBeVisible();
  await expect.element(screen.getByText("Sin configurar").first()).toBeVisible();
  expect(screen.getByText("Sin configurar").elements()).toHaveLength(2);
});

test("shows the empty state when the branch has no registers", async () => {
  const screen = await renderScreen(serving([], [depot]));

  await expect.element(screen.getByText("Todavía no hay cajas registradoras")).toBeVisible();
  await expect
    .element(screen.getByText("Creá una para configurar su punto de venta."))
    .toBeVisible();
});

test("shows a placeholder while the registers load, with Editar disabled", async () => {
  const pending = deferred<{ kind: "ok"; value: RegisterPointOfSale[] }>();
  const services = createServices({
    fetchRegisterPointsOfSale: vi.fn().mockReturnValue(pending.promise),
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Cargando…").first()).toBeVisible();
  expect(screen.getByRole("button", { name: "Editar" }).query()).toBeNull();
  pending.resolve({ kind: "ok", value: [configuredRegister] });
  await expect.element(screen.getByRole("button", { name: "Editar" })).toBeEnabled();
});

test("shows a load failure for the registers, and Reintentar loads them again", async () => {
  const services = createServices({
    fetchRegisterPointsOfSale: vi
      .fn()
      .mockResolvedValueOnce({ kind: "failed" })
      .mockResolvedValueOnce({ kind: "ok", value: [configuredRegister] }),
    fetchFiscalAddresses: vi.fn().mockResolvedValue({ kind: "ok", value: [depot] }),
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir los puntos de venta")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("00012")).toBeVisible();
});

test("lists the fiscal addresses with their name and street address", async () => {
  const screen = await renderScreen(serving([], [depot, shop]));

  const table = screen.getByRole("table", { name: "Domicilios fiscales" });
  await expect.element(table.getByText("Depósito Central")).toBeVisible();
  await expect.element(table.getByText("Calle Ficticia 123, CABA")).toBeVisible();
  await expect.element(table.getByText("Local Norte")).toBeVisible();
  await expect.element(table.getByText("Avenida Inventada 45, CABA")).toBeVisible();
});

test("shows the table's empty state when there are no fiscal addresses", async () => {
  const screen = await renderScreen(serving([], []));

  await expect.element(screen.getByText("Todavía no hay domicilios fiscales")).toBeVisible();
});

test("shows a load failure for the fiscal addresses, and Reintentar loads them again", async () => {
  const services = createServices({
    fetchFiscalAddresses: vi
      .fn()
      .mockResolvedValueOnce({ kind: "failed" })
      .mockResolvedValueOnce({ kind: "ok", value: [depot] }),
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir los domicilios fiscales")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }).first());

  await expect
    .element(
      screen.getByRole("table", { name: "Domicilios fiscales" }).getByText("Depósito Central"),
    )
    .toBeVisible();
});

test("sends to Mi cuenta when a load comes back forbidden", async () => {
  window.history.pushState(null, "", "/points-of-sale");
  const services = createServices({
    fetchFiscalAddresses: vi.fn().mockResolvedValue({ kind: "forbidden" }),
  });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
  window.history.pushState(null, "", "/");
});

test("ends the session when a load finds it closed", async () => {
  const services = createServices({
    fetchRegisterPointsOfSale: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
  });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("Editar opens the register's modal with its number and fiscal address", async () => {
  const screen = await renderScreen(serving([configuredRegister], [depot, shop]));
  await expect.element(screen.getByText("00012")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Editar" }));

  const dialog = screen.getByRole("dialog", { name: "Caja 1" });
  await expect.element(dialog.getByRole("textbox", { name: /^Punto de venta/ })).toHaveValue("12");
  await expect
    .element(dialog.getByRole("button", { name: /Domicilio fiscal/ }))
    .toHaveTextContent("Depósito Central");
});

test("saving a register's point of sale reads both lists again and announces it", async () => {
  const services = serving([configuredRegister], [depot, shop]);
  vi.mocked(services.fetchRegisterPointsOfSale)
    .mockResolvedValueOnce({ kind: "ok", value: [configuredRegister] })
    .mockResolvedValue({
      kind: "ok",
      value: [{ ...configuredRegister, pointOfSaleNumber: 7, version: 3 }],
    });
  vi.mocked(services.configureRegisterPointOfSale).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
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

test("Nuevo domicilio fiscal opens the creation modal, and creating reads the lists again and announces it", async () => {
  const services = serving([], [depot]);
  vi.mocked(services.fetchFiscalAddresses)
    .mockResolvedValueOnce({ kind: "ok", value: [depot] })
    .mockResolvedValue({ kind: "ok", value: [depot, shop] });
  vi.mocked(services.createFiscalAddress).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: "Nuevo domicilio fiscal" }));
  const dialog = screen.getByRole("dialog", { name: "Nuevo domicilio fiscal" });
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Local Norte");
  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Dirección/ }),
    "Avenida Inventada 45, CABA",
  );

  await userEvent.click(dialog.getByRole("button", { name: "Crear el domicilio fiscal" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect
    .element(screen.getByRole("table", { name: "Domicilios fiscales" }).getByText("Local Norte"))
    .toBeVisible();
  await expect.element(screen.getByText("Domicilio fiscal creado")).toBeVisible();
});

test("Nuevo domicilio fiscal stays available while the data loads", async () => {
  const services = createServices({
    fetchFiscalAddresses: vi.fn().mockReturnValue(new Promise(() => {})),
  });

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("button", { name: "Nuevo domicilio fiscal" }))
    .toBeEnabled();
});

test("a fiscal address's edit action opens its modal, and saving reads the lists again and announces it", async () => {
  const services = serving([], [depot]);
  vi.mocked(services.fetchFiscalAddresses)
    .mockResolvedValueOnce({ kind: "ok", value: [depot] })
    .mockResolvedValue({
      kind: "ok",
      value: [{ ...depot, streetAddress: "Calle Inventada 9", version: 2 }],
    });
  vi.mocked(services.editFiscalAddress).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await userEvent.click(
    screen.getByRole("button", { name: "Editar el domicilio fiscal Depósito Central" }),
  );
  const dialog = screen.getByRole("dialog", { name: "Editar el domicilio fiscal" });
  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Depósito Central");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Dirección/ }), "Calle Inventada 9");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Calle Inventada 9")).toBeVisible();
  await expect.element(screen.getByText("Domicilio fiscal guardado")).toBeVisible();
});

test("has no accessibility violations with registers and fiscal addresses shown", async () => {
  const screen = await renderScreen(serving([configuredRegister, pendingRegister], [depot, shop]));
  await expect.element(screen.getByText("00012")).toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});
