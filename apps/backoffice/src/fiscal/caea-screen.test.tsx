import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { ADMINISTRATOR_ACCESS, accessWith } from "../shell/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import { CaeaScreen } from "./caea-screen";
import type { CaeaScreenServices } from "./caea-services";
import { exceptionalityFilters } from "./exceptionality-filters";
import type { FiscalAddress } from "./fiscal-addresses-api";
import type { OfflinePointOfSale } from "./offline-points-of-sale-api";
import type { RegisterPointOfSale } from "./register-points-of-sale-api";
import { exceptionShareOf2026, fiscalAddresses } from "./test-support/exception-share-fixtures";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function createServices(overrides: Partial<CaeaScreenServices> = {}): CaeaScreenServices {
  return {
    fetchRegisterPointsOfSale: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    fetchFiscalAddresses: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    fetchFortnightPresentations: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    fetchOfflinePointsOfSale: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    fetchExceptionShareYear: vi.fn().mockResolvedValue({ kind: "ok", value: exceptionShareOf2026 }),
    retireOfflinePointOfSale: vi.fn(),
    remedyRejectedDocument: vi.fn(),
    confirmRevokedInstallation: vi.fn(),
    fetchBuyerTaxStatuses: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
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

function renderScreen(
  services: CaeaScreenServices,
  onSessionEnded: () => void = () => {},
  {
    access = ADMINISTRATOR_ACCESS,
    onRescue = () => {},
  }: { access?: BackofficeAccess; onRescue?: () => void } = {},
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <CaeaScreen
          access={access}
          filters={exceptionalityFilters.parse({})}
          onFiltersChange={() => {}}
          onRescue={onRescue}
          services={services}
          onSessionEnded={onSessionEnded}
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

test("shows the sections in order, with no title of its own", async () => {
  const screen = await renderScreen(createServices());

  const headings = screen.getByRole("heading", { level: 2 });
  await expect.element(headings.first()).toBeVisible();
  const titles = headings
    .elements()
    .map((heading) => heading.textContent)
    .filter((title) =>
      ["Excepcionalidad", "Informes quincenales", "Puntos de venta"].includes(title ?? ""),
    );
  expect(titles).toEqual(["Excepcionalidad", "Informes quincenales", "Puntos de venta"]);
  expect(screen.getByRole("heading", { level: 1 }).query()).toBeNull();
});

test("gives the points of sale section an anchor", async () => {
  const screen = await renderScreen(createServices());

  await expect
    .element(screen.getByRole("region", { name: "Puntos de venta" }))
    .toHaveAttribute("id", "points-of-sale");
});

test("shows the exceptionality of the fiscal address, with its months", async () => {
  const screen = await renderScreen(
    createServices({
      fetchFiscalAddresses: vi.fn().mockResolvedValue({ kind: "ok", value: fiscalAddresses }),
    }),
  );

  await expect.element(screen.getByText("Enero 2026")).toBeVisible();
});

test("shows only the exceptionality to a person with fiscal information alone, reading nothing else", async () => {
  const services = createServices({
    fetchFiscalAddresses: vi.fn().mockResolvedValue({ kind: "ok", value: fiscalAddresses }),
  });

  const screen = await renderScreen(services, () => {}, {
    access: accessWith("fiscal_information"),
  });

  await expect.element(screen.getByText("Enero 2026")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Informes quincenales" }).query()).toBeNull();
  expect(screen.getByRole("heading", { name: "Puntos de venta" }).query()).toBeNull();
  expect(
    screen.getByRole("button", { name: "Rescatar tickets de contingencia" }).query(),
  ).toBeNull();
  expect(services.fetchRegisterPointsOfSale).not.toHaveBeenCalled();
  expect(services.fetchFortnightPresentations).not.toHaveBeenCalled();
  expect(services.fetchOfflinePointsOfSale).not.toHaveBeenCalled();
});

test("shows the reports and the points of sale to a person with fiscal configuration alone, reading no exceptionality", async () => {
  const services = createServices();

  const screen = await renderScreen(services, () => {}, {
    access: accessWith("fiscal_configuration_area"),
  });

  await expect.element(screen.getByRole("heading", { name: "Informes quincenales" })).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Puntos de venta" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Excepcionalidad" }).query()).toBeNull();
  expect(services.fetchExceptionShareYear).not.toHaveBeenCalled();
});

test("shows only Rescatar tickets de contingencia to a person with the rescue alone, and it asks to open the assistant", async () => {
  const onRescue = vi.fn();
  const services = createServices();

  const screen = await renderScreen(services, () => {}, {
    access: accessWith("contingency_ticket_rescue"),
    onRescue,
  });
  await userEvent.click(screen.getByRole("button", { name: "Rescatar tickets de contingencia" }));

  expect(onRescue).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("heading", { level: 2 }).query()).toBeNull();
  expect(services.fetchFiscalAddresses).not.toHaveBeenCalled();
  expect(services.fetchRegisterPointsOfSale).not.toHaveBeenCalled();
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

test("shows a placeholder while the registers load, without edit actions", async () => {
  const pending = deferred<{ kind: "ok"; value: RegisterPointOfSale[] }>();
  const services = createServices({
    fetchRegisterPointsOfSale: vi.fn().mockReturnValue(pending.promise),
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Cargando…").first()).toBeVisible();
  pending.resolve({ kind: "ok", value: [configuredRegister] });
  await expect.element(screen.getByText("00012")).toBeVisible();
});

test("shows each register's point of sale read-only, with no Editar nor Editar CAEA", async () => {
  const screen = await renderScreen(serving([configuredRegister, pendingRegister], [depot]));
  await expect.element(screen.getByText("00012")).toBeVisible();

  expect(screen.getByRole("button", { name: "Editar", exact: true }).query()).toBeNull();
  expect(screen.getByRole("button", { name: "Editar CAEA" }).query()).toBeNull();
});

test("links each register to its Fiscal y cobros in Cajas with Se edita en Cajas", async () => {
  const screen = await renderScreen(serving([configuredRegister, pendingRegister], [depot]));
  await expect.element(screen.getByText("00012")).toBeVisible();

  const links = screen.getByRole("link", { name: "Se edita en Cajas" });
  expect(links.elements()).toHaveLength(2);
  await expect
    .element(links.first())
    .toHaveAttribute("href", "/registers?register=register-1&tab=fiscal");
  await expect
    .element(links.nth(1))
    .toHaveAttribute("href", "/registers?register=register-2&tab=fiscal");
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

test("sends to Mi cuenta when a load comes back forbidden", async () => {
  window.history.pushState(null, "", "/fiscal/caea");
  const services = createServices({
    fetchRegisterPointsOfSale: vi.fn().mockResolvedValue({ kind: "forbidden" }),
  });

  await renderScreen(services);

  await expect
    .poll(() => window.location.pathname + window.location.search)
    .toBe("/?account=credentials");
});

test("ends the session when a load finds it closed", async () => {
  const services = createServices({
    fetchRegisterPointsOfSale: vi.fn().mockResolvedValue({ kind: "unauthenticated" }),
  });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBeGreaterThan(0);
});

test("has no accessibility violations with the registers shown", async () => {
  const screen = await renderScreen(serving([configuredRegister, pendingRegister], [depot, shop]));
  await expect.element(screen.getByText("00012")).toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});

test("lists the fortnight reports of each offline point of sale before the points of sale, naming the register a blocked one waits for", async () => {
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
        owed: false,
        revokedInstallations: [],
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
  expect(text.indexOf("Informes quincenales")).toBeLessThan(text.indexOf("Puntos de venta"));
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

test("lists the offline points of sale left without a register after the registers", async () => {
  const screen = await renderScreen(withFreeOfflinePointOfSale());

  const table = screen.getByRole("table", { name: "Puntos de venta CAEA sin caja" });
  await expect.element(table.getByText("Caja 9", { exact: true })).toBeVisible();
  const text = document.body.textContent ?? "";
  expect(text.indexOf("Caja 1")).toBeLessThan(text.indexOf("Usado por"));
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
    remedies: ["report", "printed"],
  },
  movement: "documents",
  refusal: "partial",
  state: "refused",
  owed: false,
  revokedInstallations: [],
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
            remedies: ["report", "printed"],
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

const blockedByRevokedInstallation = {
  registerId: configuredRegister.registerId,
  pointOfSaleNumber: 13,
  fortnight: { start: "2026-09-01", end: "2026-09-15" },
  deadline: "2026-09-23",
  documentType: "factura_c",
  documentCount: 20,
  rejectedDocument: null,
  movement: "documents",
  refusal: null,
  state: "blocked",
  owed: false,
  revokedInstallations: [{ installationId: "inst-1", revokedAt: "2026-09-10T15:30:00.000Z" }],
};

const confirmRevokedButton =
  "Confirmar la instalación revocada de Caja 1 del informe del 1 al 15 de septiembre del punto de venta 00013";

function withRevokedInstallation() {
  const services = serving([configuredRegister], [depot]);
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: { challenge: "session-auth" } as never,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue({ id: "existing-cred" } as never);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
  vi.mocked(services.fetchFortnightPresentations).mockResolvedValue({
    kind: "ok",
    value: [blockedByRevokedInstallation] as never,
  });
  return services;
}

test("the row of a report held back by a revoked installation opens its confirmation naming the register and the revocation", async () => {
  const screen = await renderScreen(withRevokedInstallation());

  await userEvent.click(screen.getByRole("button", { name: confirmRevokedButton }));

  const dialog = screen.getByRole("dialog", { name: "Confirmar la instalación revocada" });
  await expect
    .element(dialog.getByText(/La instalación de Caja 1 se revocó el 10\/09\/2026 · 12:30/))
    .toBeVisible();
});

test("confirming the installation reads the presentations again and announces it", async () => {
  const services = withRevokedInstallation();
  vi.mocked(services.fetchFortnightPresentations)
    .mockResolvedValueOnce({ kind: "ok", value: [blockedByRevokedInstallation] as never })
    .mockResolvedValue({
      kind: "ok",
      value: [
        { ...blockedByRevokedInstallation, revokedInstallations: [], state: "accepted" },
      ] as never,
    });
  vi.mocked(services.confirmRevokedInstallation).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: confirmRevokedButton }));
  const dialog = screen.getByRole("dialog", { name: "Confirmar la instalación revocada" });

  await userEvent.click(dialog.getByRole("button", { name: "Confirmar", exact: true }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Instalación confirmada")).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Caja 1, revocada el 10/09/2026 · 12:30, para el informe del 1 al 15 de septiembre del punto de venta 00013.",
      ),
    )
    .toBeVisible();
  await expect.element(screen.getByText("Aceptado")).toBeVisible();
  expect(services.confirmRevokedInstallation).toHaveBeenCalledWith({
    point_of_sale_number: 13,
    fortnight_start: "2026-09-01",
    installation_id: "inst-1",
  });
});

test("an installation that no longer holds the report back reads the presentations again and keeps the confirmation open", async () => {
  const services = withRevokedInstallation();
  vi.mocked(services.fetchFortnightPresentations)
    .mockResolvedValueOnce({ kind: "ok", value: [blockedByRevokedInstallation] as never })
    .mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.confirmRevokedInstallation).mockResolvedValue({ kind: "not_holding_back" });
  const screen = await renderScreen(services);
  await userEvent.click(screen.getByRole("button", { name: confirmRevokedButton }));
  const dialog = screen.getByRole("dialog", { name: "Confirmar la instalación revocada" });

  await userEvent.click(dialog.getByRole("button", { name: "Confirmar", exact: true }));

  await expect
    .poll(() => vi.mocked(services.fetchFortnightPresentations).mock.calls.length)
    .toBe(2);
  await expect
    .element(dialog.getByText("Esta instalación ya no frena el informe.").first())
    .toBeVisible();
});
