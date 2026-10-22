import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { FiscalAddress } from "./fiscal-addresses-api";
import type { OfflinePointOfSale } from "./offline-points-of-sale-api";
import { PointsOfSaleScreen } from "./points-of-sale-screen";
import type { PointsOfSaleScreenServices } from "./points-of-sale-services";
import type { RegisterPointOfSale } from "./register-points-of-sale-api";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function createServices(
  overrides: Partial<PointsOfSaleScreenServices> = {},
): PointsOfSaleScreenServices {
  return {
    fetchRegisterPointsOfSale: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    fetchFiscalAddresses: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    fetchFortnightPresentations: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    fetchOfflinePointsOfSale: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    retireOfflinePointOfSale: vi.fn(),
    remedyRejectedDocument: vi.fn(),
    fetchBuyerTaxStatuses: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    configureRegisterPointOfSale: vi.fn(),
    configureRegisterOfflinePointOfSale: vi.fn(),
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
  await expect.element(screen.getByText("Punto de venta", { exact: true }).first()).toBeVisible();
  await expect.element(screen.getByText("00012")).toBeVisible();
  await expect.element(screen.getByText("Punto de venta CAEA", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("00013")).toBeVisible();
  await expect.element(screen.getByText("Domicilio fiscal", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Depósito Central").first()).toBeVisible();
});

test("shows Sin configurar for the three values of a register without a point of sale", async () => {
  const screen = await renderScreen(serving([pendingRegister], [depot]));

  await expect.element(screen.getByRole("heading", { name: "Caja 2", level: 2 })).toBeVisible();
  await expect.element(screen.getByText("Sin configurar").first()).toBeVisible();
  expect(screen.getByText("Sin configurar").elements()).toHaveLength(3);
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
  expect(screen.getByRole("button", { name: "Editar", exact: true }).query()).toBeNull();
  pending.resolve({ kind: "ok", value: [configuredRegister] });
  await expect.element(screen.getByRole("button", { name: "Editar", exact: true })).toBeEnabled();
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

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }).first());

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

  await userEvent.click(screen.getByRole("button", { name: "Editar", exact: true }));

  const dialog = screen.getByRole("dialog", { name: "Caja 1" });
  await expect.element(dialog.getByRole("textbox", { name: /^Punto de venta/ })).toHaveValue("12");
  await expect
    .element(dialog.getByRole("button", { name: /Domicilio fiscal/ }))
    .toHaveTextContent("Depósito Central");
});

test("Editar CAEA opens the register's offline point of sale modal, and saving reads the lists again and announces it", async () => {
  const services = serving([configuredRegister], [depot]);
  vi.mocked(services.fetchRegisterPointsOfSale)
    .mockResolvedValueOnce({ kind: "ok", value: [configuredRegister] })
    .mockResolvedValue({
      kind: "ok",
      value: [{ ...configuredRegister, offlinePointOfSaleNumber: 8, offlineVersion: 5 }],
    });
  vi.mocked(services.configureRegisterOfflinePointOfSale).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
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

test("lists the fortnight reports of each offline point of sale between the registers and the fiscal addresses, naming the register a blocked one waits for", async () => {
  const services = serving([configuredRegister], [depot]);
  services.fetchFortnightPresentations = vi.fn().mockResolvedValue({
    kind: "ok",
    value: [
      {
        registerId: configuredRegister.registerId,
        pointOfSaleNumber: 13,
        fortnight: { start: "2026-09-01", end: "2026-09-15" },
        deadline: "2026-09-23",
        documentType: null,
        documentCount: 0,
        rejectedDocument: null,
        movement: null,
        refusal: null,
        state: "blocked",
      },
    ],
  });

  const screen = await renderScreen(services);

  const reports = screen.getByRole("table", { name: "Informes quincenales" });
  await expect.element(reports.getByText("Bloqueado")).toBeVisible();
  await expect
    .element(screen.getByText("Caja 1 todavía no terminó de sincronizar", { exact: true }))
    .toBeVisible();
  const text = document.body.textContent ?? "";
  expect(text.indexOf("Caja 1")).toBeLessThan(text.indexOf("Quincena"));
  expect(text.indexOf("Quincena")).toBeLessThan(text.indexOf("Domicilios fiscales"));
});

test("keeps the registers on screen when the fortnight reports fail to load, and Reintentar loads them again", async () => {
  const services = serving([configuredRegister], [depot]);
  services.fetchFortnightPresentations = vi
    .fn()
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: [] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir los informes quincenales")).toBeVisible();
  await expect.element(screen.getByText("00012")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Todavía no hay informes quincenales")).toBeVisible();
});

const freeOfflinePointOfSale: OfflinePointOfSale = {
  pointOfSaleNumber: 6,
  registerId: "register-9",
  registerName: "Caja 9",
  retirable: true,
  retiredAt: null,
};

function withFreeOfflinePointOfSale(items: OfflinePointOfSale[] = [freeOfflinePointOfSale]) {
  const services = serving([configuredRegister], [depot]);
  services.fetchOfflinePointsOfSale = vi.fn().mockResolvedValue({ kind: "ok", value: items });
  return services;
}

test("lists the offline points of sale left without a register between the registers and the fortnight reports", async () => {
  const screen = await renderScreen(withFreeOfflinePointOfSale());

  const table = screen.getByRole("table", { name: "Puntos de venta CAEA sin caja" });
  await expect.element(table.getByText("Caja 9", { exact: true })).toBeVisible();
  const text = document.body.textContent ?? "";
  expect(text.indexOf("Caja 1")).toBeLessThan(text.indexOf("Usado por"));
  expect(text.indexOf("Usado por")).toBeLessThan(text.indexOf("Quincena"));
});

test("keeps the registers on screen when the offline points of sale fail to load, and Reintentar loads them again", async () => {
  const services = withFreeOfflinePointOfSale();
  services.fetchOfflinePointsOfSale = vi
    .fn()
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: [] });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByText("No pudimos abrir los puntos de venta CAEA sin caja"))
    .toBeVisible();
  await expect.element(screen.getByText("00012")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByText("Ningún punto de venta CAEA quedó sin caja."))
    .toBeVisible();
});

test("retiring an offline point of sale reads the list and the fortnight reports again and announces it", async () => {
  const services = withFreeOfflinePointOfSale();
  vi.mocked(services.fetchOfflinePointsOfSale)
    .mockResolvedValueOnce({ kind: "ok", value: [freeOfflinePointOfSale] })
    .mockResolvedValue({
      kind: "ok",
      value: [
        { ...freeOfflinePointOfSale, retirable: false, retiredAt: "2026-10-20T12:00:00.000Z" },
      ],
    });
  vi.mocked(services.retireOfflinePointOfSale).mockResolvedValue({
    kind: "retired",
    value: { pointOfSaleNumber: 6, retiredAt: "2026-10-20T12:00:00.000Z" },
  });
  const screen = await renderScreen(services);
  await userEvent.click(
    screen.getByRole("button", { name: "Dar de baja el punto de venta 00006" }),
  );
  const dialog = screen.getByRole("dialog", { name: "¿Dar de baja el punto de venta 00006?" });

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  expect(services.retireOfflinePointOfSale).toHaveBeenCalledWith(6);
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Dado de baja", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("Punto de venta dado de baja")).toBeVisible();
  await expect.element(screen.getByText("00006.", { exact: true })).toBeVisible();
  expect(services.fetchFortnightPresentations).toHaveBeenCalledTimes(2);
});

test("a refused retirement reads the offline points of sale again", async () => {
  const services = withFreeOfflinePointOfSale();
  vi.mocked(services.fetchOfflinePointsOfSale)
    .mockResolvedValueOnce({ kind: "ok", value: [freeOfflinePointOfSale] })
    .mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.retireOfflinePointOfSale).mockResolvedValue({ kind: "assigned" });
  const screen = await renderScreen(services);
  await userEvent.click(
    screen.getByRole("button", { name: "Dar de baja el punto de venta 00006" }),
  );
  const dialog = screen.getByRole("dialog", { name: "¿Dar de baja el punto de venta 00006?" });

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect.poll(() => vi.mocked(services.fetchOfflinePointsOfSale).mock.calls.length).toBe(2);
  expect(
    screen
      .getByRole("table", { name: "Puntos de venta CAEA sin caja" })
      .getByText("Caja 9")
      .query(),
  ).toBeNull();
});

const partlyRejectedPresentation = {
  registerId: configuredRegister.registerId,
  pointOfSaleNumber: 13,
  fortnight: { start: "2026-09-01", end: "2026-09-15" },
  deadline: "2026-09-23",
  documentType: "factura_c",
  documentCount: 20,
  rejectedDocument: {
    number: 298,
    unprocessed: 12,
    issuedOn: "2026-09-09",
    total: 1_845_000,
    buyer: { kind: "final_consumer" },
    buyerTaxStatusCode: 5,
    rejections: [{ code: 10016, message: "El importe total no coincide con la suma." }],
    remedy: "awaiting_remedy",
  },
  movement: "documents",
  refusal: "partial",
  state: "refused",
};

const reviewRejectionButton =
  "Revisar el rechazo del informe del 1 al 15 de septiembre del punto de venta 00013";

function withRejectedDocument() {
  const services = serving([configuredRegister], [depot]);
  services.fetchFortnightPresentations = vi
    .fn()
    .mockResolvedValue({ kind: "ok", value: [partlyRejectedPresentation] });
  return services;
}

test("the row of a rejected document opens its review, with the rejected document and what ARCA reported", async () => {
  const screen = await renderScreen(withRejectedDocument());

  await userEvent.click(screen.getByRole("button", { name: reviewRejectionButton }));

  const dialog = screen.getByRole("dialog", { name: "Revisar el rechazo" });
  await expect.element(dialog.getByText("Nº 00000298")).toBeVisible();
  await expect.element(dialog.getByText("El importe total no coincide con la suma.")).toBeVisible();
});

test("correcting the report reads the presentations again and announces it", async () => {
  const services = withRejectedDocument();
  vi.mocked(services.fetchFortnightPresentations)
    .mockResolvedValueOnce({ kind: "ok", value: [partlyRejectedPresentation] as never })
    .mockResolvedValue({
      kind: "ok",
      value: [
        {
          ...partlyRejectedPresentation,
          rejectedDocument: {
            ...partlyRejectedPresentation.rejectedDocument,
            remedy: "awaiting_resend",
          },
        },
      ] as never,
    });
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: { challenge: "session-auth" } as never,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue({ id: "existing-cred" } as never);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
  vi.mocked(services.remedyRejectedDocument).mockResolvedValue({
    kind: "ok",
  });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: reviewRejectionButton }));
  const dialog = screen.getByRole("dialog", { name: "Revisar el rechazo" });

  await userEvent.click(dialog.getByRole("button", { name: "Corregir el informe" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Informe corregido")).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Nº 00000298 del punto de venta 00013: se vuelve a presentar con el mismo número.",
      ),
    )
    .toBeVisible();
  await expect.element(screen.getByText("Corregido, por reenviar")).toBeVisible();
  expect(services.remedyRejectedDocument).toHaveBeenCalledWith({
    point_of_sale_number: 13,
    fortnight_start: "2026-09-01",
    document_type: "factura_c",
    number: 298,
    remedy: { kind: "report" },
  });
});

test("a document that is no longer rejected reads the presentations again and keeps the review open", async () => {
  const services = withRejectedDocument();
  vi.mocked(services.fetchFortnightPresentations)
    .mockResolvedValueOnce({ kind: "ok", value: [partlyRejectedPresentation] as never })
    .mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: { challenge: "session-auth" } as never,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue({ id: "existing-cred" } as never);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
  vi.mocked(services.remedyRejectedDocument).mockResolvedValue({ kind: "not_rejected" });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: reviewRejectionButton }));
  const dialog = screen.getByRole("dialog", { name: "Revisar el rechazo" });

  await userEvent.click(dialog.getByRole("button", { name: "Corregir el informe" }));

  await expect
    .poll(() => vi.mocked(services.fetchFortnightPresentations).mock.calls.length)
    .toBe(2);
  await expect
    .element(dialog.getByText("ARCA ya no tiene rechazado este comprobante.").first())
    .toBeVisible();
});
