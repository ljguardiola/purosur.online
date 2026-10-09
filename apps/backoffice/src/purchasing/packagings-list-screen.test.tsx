import type { PackagingSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { PackagingsListScreen } from "./packagings-list-screen";
import type { PackagingsListScreenServices } from "./packagings-list-services";
import { type PackagingsListFilters, packagingsListFilters } from "./routes";
import {
  bolsaDeAlmendras,
  bolsaDeAvena,
  cajaDeMiel,
  packagingList,
} from "./test-support/packagings";

afterEach(() => {
  window.history.pushState(null, "", "/");
});

function createServices(
  overrides: Partial<PackagingsListScreenServices> = {},
): PackagingsListScreenServices {
  return {
    fetchPackagings: vi.fn(),
    createPackaging: vi.fn(),
    editPackaging: vi.fn(),
    deactivatePackaging: vi.fn(),
    reactivatePackaging: vi.fn(),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function screenElement(
  services: PackagingsListScreenServices,
  onSessionEnded: () => void = () => {},
  {
    filters = packagingsListFilters.parse({}),
    onFiltersChange = () => {},
  }: {
    filters?: PackagingsListFilters;
    onFiltersChange?: (filters: PackagingsListFilters) => void;
  } = {},
) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <PackagingsListScreen
          services={services}
          onSessionEnded={onSessionEnded}
          filters={filters}
          onFiltersChange={onFiltersChange}
        />
      </main>
    </FieldSizeProvider>
  );
}

function renderScreen(...args: Parameters<typeof screenElement>) {
  return render(screenElement(...args));
}

type Screen = Awaited<ReturnType<typeof renderScreen>>;

function rowTexts(screen: Screen): string[] {
  return screen
    .getByRole("row")
    .all()
    .slice(1)
    .map((row) => row.element().textContent ?? "");
}

async function loaded(
  services: PackagingsListScreenServices,
  packagings: PackagingSummary[],
  options = {},
) {
  vi.mocked(services.fetchPackagings).mockResolvedValue({
    kind: "ok",
    value: packagingList(packagings),
  });
  const screen = await renderScreen(services, () => {}, options);
  await expect
    .element(screen.getByRole("table", { name: "Presentaciones de compra" }))
    .toBeVisible();
  return screen;
}

test("shows the breadcrumb, the heading and each active packaging with its quantity in the product's unit", async () => {
  const services = createServices();
  const screen = await loaded(services, [cajaDeMiel, bolsaDeAvena, bolsaDeAlmendras]);

  await expect.element(screen.getByText("Stock").first()).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Presentaciones de compra", level: 1 }))
    .toBeVisible();
  await expect
    .poll(() => rowTexts(screen))
    .toEqual([
      "Avena arrolladaBolsa de 25 kg25,000 kgActiva",
      "Miel pura de abeja 1 kgCaja x 1212 uActiva",
    ]);
});

test("the state filter shows the inactive packagings, or every packaging", async () => {
  const services = createServices();
  const screen = await loaded(services, [cajaDeMiel, bolsaDeAlmendras]);

  await userEvent.click(screen.getByRole("button", { name: /Estado:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Inactivas" }));
  await expect
    .poll(() => rowTexts(screen))
    .toEqual(["Almendras peladasBolsa de 2,5 kg2,500 kgInactiva"]);

  await userEvent.click(screen.getByRole("button", { name: /Estado:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Todas" }));
  await expect.poll(() => rowTexts(screen)).toHaveLength(2);
});

test("lists packagings by product name, and the header reverses the order", async () => {
  const services = createServices();
  const screen = await loaded(services, [cajaDeMiel, bolsaDeAvena]);
  await expect
    .poll(() => rowTexts(screen).map((text) => text.slice(0, 5)))
    .toEqual(["Avena", "Miel "]);

  await userEvent.click(screen.getByRole("button", { name: "Producto" }));

  await expect
    .poll(() => rowTexts(screen).map((text) => text.slice(0, 5)))
    .toEqual(["Miel ", "Avena"]);
});

test("the search field filters by product or packaging name, case-insensitively", async () => {
  const services = createServices();
  const screen = await loaded(services, [cajaDeMiel, bolsaDeAvena]);
  const search = screen.getByPlaceholder("Buscar una presentación");

  await userEvent.fill(search, "mIEL");
  await expect.poll(() => rowTexts(screen).map((text) => text.slice(0, 4))).toEqual(["Miel"]);

  await userEvent.fill(search, "bolsa");
  await expect.poll(() => rowTexts(screen).map((text) => text.slice(0, 5))).toEqual(["Avena"]);
});

test("shows the blank empty state when there are no packagings yet", async () => {
  const services = createServices();
  vi.mocked(services.fetchPackagings).mockResolvedValue({
    kind: "ok",
    value: packagingList([]),
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Todavía no hay presentaciones de compra")).toBeVisible();
});

test("shows a filtered empty state when the search matches nothing", async () => {
  const services = createServices();
  const screen = await loaded(services, [cajaDeMiel]);

  await userEvent.fill(screen.getByPlaceholder("Buscar una presentación"), "zzz");

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
});

test("shows a filtered empty state when no packaging has the chosen state", async () => {
  const services = createServices();
  const screen = await loaded(services, [cajaDeMiel], {
    filters: packagingsListFilters.parse({ status: "inactive" }),
  });

  await expect.element(screen.getByText("No hay presentaciones inactivas")).toBeVisible();
});

test("shows a load error with a retry action that starts again from the loading placeholder", async () => {
  const services = createServices();
  const retry = deferred<Awaited<ReturnType<typeof services.fetchPackagings>>>();
  vi.mocked(services.fetchPackagings)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir las presentaciones")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("table", { name: "Presentaciones de compra" }))
    .toHaveAttribute("aria-busy", "true");
  retry.resolve({ kind: "ok", value: packagingList([cajaDeMiel]) });
  await expect.element(screen.getByText("Caja x 12")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const services = createServices();
  vi.mocked(services.fetchPackagings).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("navigates to Mi cuenta when the packagings request comes back forbidden", async () => {
  window.history.pushState(null, "", "/purchase-packagings");
  const services = createServices();
  vi.mocked(services.fetchPackagings).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("ends the session when the packagings request finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.fetchPackagings).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("the create action waits for the products it offers: disabled while loading and after a failure", async () => {
  const services = createServices();
  const firstLoad = deferred<Awaited<ReturnType<typeof services.fetchPackagings>>>();
  vi.mocked(services.fetchPackagings)
    .mockReturnValueOnce(firstLoad.promise)
    .mockResolvedValueOnce({ kind: "ok", value: packagingList([]) });
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: "Nueva presentación" })).toBeDisabled();

  firstLoad.resolve({ kind: "failed" });
  await expect.element(screen.getByText("No pudimos abrir las presentaciones")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Nueva presentación" })).toBeDisabled();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  await expect.element(screen.getByRole("button", { name: "Nueva presentación" })).toBeEnabled();
});

test("the create action opens the new packaging modal with the products it was read with, and the created packaging is listed", async () => {
  const services = createServices();
  vi.mocked(services.fetchPackagings)
    .mockResolvedValueOnce({ kind: "ok", value: packagingList([bolsaDeAvena]) })
    .mockResolvedValueOnce({ kind: "ok", value: packagingList([bolsaDeAvena, cajaDeMiel]) });
  vi.mocked(services.createPackaging).mockResolvedValue({ kind: "ok", packaging: cajaDeMiel });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Bolsa de 25 kg")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Nueva presentación" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("combobox", { name: /^Producto/ }));
  await userEvent.click(screen.getByRole("option", { name: "Miel pura de abeja 1 kg" }));
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Caja x 12");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad por presentación/ }), "12");
  await userEvent.click(dialog.getByRole("button", { name: "Crear la presentación" }));

  expect(services.createPackaging).toHaveBeenCalledWith({
    productId: cajaDeMiel.productId,
    name: "Caja x 12",
    quantityPerPackage: 12_000,
  });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Caja x 12")).toBeVisible();
});

test("cancel closes the new packaging modal", async () => {
  const services = createServices();
  const screen = await loaded(services, [cajaDeMiel]);
  await userEvent.click(screen.getByRole("button", { name: "Nueva presentación" }));

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
});

test("the edit action opens the packaging's edit modal, and the saved change is listed", async () => {
  const services = createServices();
  vi.mocked(services.editPackaging).mockResolvedValue({ kind: "ok" });
  const screen = await loaded(services, [bolsaDeAvena]);

  await userEvent.click(
    screen.getByRole("button", { name: "Editar la presentación Bolsa de 25 kg" }),
  );
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Bolsa de 25 kg" })).toBeVisible();
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Bolsa de 20 kg");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cantidad por presentación/ }), "20");
  vi.mocked(services.fetchPackagings).mockResolvedValue({
    kind: "ok",
    value: packagingList([
      { ...bolsaDeAvena, name: "Bolsa de 20 kg", quantityPerPackage: 20_000, version: 3 },
    ]),
  });
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  expect(services.editPackaging).toHaveBeenCalledWith(bolsaDeAvena.id, {
    name: "Bolsa de 20 kg",
    quantityPerPackage: 20_000,
    version: 2,
  });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("20,000 kg")).toBeVisible();
});

test("a stale version's reload refills the edit modal from the list read again", async () => {
  const services = createServices();
  vi.mocked(services.editPackaging).mockResolvedValue({ kind: "stale_version" });
  const screen = await loaded(services, [bolsaDeAvena]);
  await userEvent.click(
    screen.getByRole("button", { name: "Editar la presentación Bolsa de 25 kg" }),
  );
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect
    .element(dialog.getByText("Esta presentación cambió mientras la editabas"))
    .toBeVisible();
  vi.mocked(services.fetchPackagings).mockResolvedValue({
    kind: "ok",
    value: packagingList([{ ...bolsaDeAvena, name: "Bolsa grande", version: 5 }]),
  });

  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Bolsa grande");
});

test("deactivating asks first, then deactivates the packaging and refreshes the list", async () => {
  const services = createServices();
  vi.mocked(services.deactivatePackaging).mockResolvedValue({ kind: "ok" });
  const screen = await loaded(services, [cajaDeMiel]);

  await userEvent.click(
    screen.getByRole("button", { name: "Desactivar la presentación Caja x 12" }),
  );
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: '¿Desactivar la presentación "Caja x 12"?' }))
    .toBeVisible();
  vi.mocked(services.fetchPackagings).mockResolvedValue({
    kind: "ok",
    value: packagingList([{ ...cajaDeMiel, active: false, version: 2 }]),
  });
  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  expect(services.deactivatePackaging).toHaveBeenCalledWith(cajaDeMiel.id);
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("No hay presentaciones activas")).toBeVisible();
});

test("reactivating an inactive packaging asks first, then reactivates it and refreshes the list", async () => {
  const services = createServices();
  vi.mocked(services.reactivatePackaging).mockResolvedValue({ kind: "ok" });
  const screen = await loaded(services, [cajaDeMiel, bolsaDeAlmendras], {
    filters: packagingsListFilters.parse({ status: "all" }),
  });
  expect(
    screen.getByRole("button", { name: "Desactivar la presentación Bolsa de 2,5 kg" }).query(),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "Reactivar la presentación Caja x 12" }).query(),
  ).toBeNull();

  await userEvent.click(
    screen.getByRole("button", { name: "Reactivar la presentación Bolsa de 2,5 kg" }),
  );
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: '¿Reactivar la presentación "Bolsa de 2,5 kg"?' }))
    .toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));

  expect(services.reactivatePackaging).toHaveBeenCalledWith(bolsaDeAlmendras.id);
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchPackagings).mock.calls.length).toBe(2);
});

test("updating the list after a packaging was already deactivated closes the question and reads the list again", async () => {
  const services = createServices();
  vi.mocked(services.deactivatePackaging).mockResolvedValue({ kind: "already_changed" });
  const screen = await loaded(services, [cajaDeMiel]);
  await userEvent.click(
    screen.getByRole("button", { name: "Desactivar la presentación Caja x 12" }),
  );
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchPackagings).mock.calls.length).toBe(2);
});

test("opens with the filters it is given, and reports every change to them", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await loaded(services, [cajaDeMiel, bolsaDeAvena, bolsaDeAlmendras], {
    filters: { search: "avena", status: "all", sort: "descending" },
    onFiltersChange,
  });

  await expect.element(screen.getByPlaceholder("Buscar una presentación")).toHaveValue("avena");
  await expect.poll(() => rowTexts(screen)).toHaveLength(1);
  expect(onFiltersChange).not.toHaveBeenCalled();

  await userEvent.fill(screen.getByPlaceholder("Buscar una presentación"), "");
  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ search: "", status: "all", sort: "descending" });

  await userEvent.click(screen.getByRole("button", { name: "Producto" }));
  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ search: "", status: "all", sort: "ascending" });
});

test("has no accessibility violations once loaded, and with the create modal open", async () => {
  const services = createServices();
  const screen = await loaded(services, [cajaDeMiel, bolsaDeAlmendras], {
    filters: packagingsListFilters.parse({ status: "all" }),
  });

  await expectNoAccessibilityViolations(screen.container);
  await userEvent.click(screen.getByRole("button", { name: "Nueva presentación" }));
  await expectNoAccessibilityViolations(document.body);
});
