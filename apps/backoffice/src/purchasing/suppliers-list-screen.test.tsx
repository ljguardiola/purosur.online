import type { SupplierSummary } from "@purosur/contracts";
import { FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { type SuppliersListFilters, suppliersListFilters } from "./routes";
import { SuppliersListScreen } from "./suppliers-list-screen";
import type { SuppliersListScreenServices } from "./suppliers-list-services";
import { andina, cerealera, granos } from "./test-support/suppliers";

afterEach(() => {
  window.history.pushState(null, "", "/");
});

function createServices(
  overrides: Partial<SuppliersListScreenServices> = {},
): SuppliersListScreenServices {
  return {
    fetchSuppliers: vi.fn(),
    createSupplier: vi.fn(),
    editSupplier: vi.fn(),
    deactivateSupplier: vi.fn(),
    reactivateSupplier: vi.fn(),
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
  services: SuppliersListScreenServices,
  onSessionEnded: () => void = () => {},
  {
    filters = suppliersListFilters.parse({}),
    onFiltersChange = () => {},
  }: {
    filters?: SuppliersListFilters;
    onFiltersChange?: (filters: SuppliersListFilters) => void;
  } = {},
) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <SuppliersListScreen
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
  services: SuppliersListScreenServices,
  suppliers: SupplierSummary[],
  options = {},
) {
  vi.mocked(services.fetchSuppliers).mockResolvedValue({ kind: "ok", value: suppliers });
  const screen = await renderScreen(services, () => {}, options);
  await expect.element(screen.getByRole("table", { name: "Proveedores" })).toBeVisible();
  return screen;
}

test("shows the breadcrumb, the heading and each active supplier with its CUIT, contact, note and state", async () => {
  const services = createServices();
  const screen = await loaded(services, [andina, granos, cerealera]);

  await expect.element(screen.getByText("Stock").first()).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Proveedores", level: 1 }))
    .toBeVisible();
  await expect
    .poll(() => rowTexts(screen))
    .toEqual([
      `Distribuidora Andina${FICTIONAL_CUIT}Marta Pérez · 11 5555-0100Entrega los martesActivo`,
      "Granos del Valle———Activo",
    ]);
});

test("the state filter shows the inactive suppliers, or every supplier", async () => {
  const services = createServices();
  const screen = await loaded(services, [andina, cerealera]);

  await userEvent.click(screen.getByRole("button", { name: /Estado:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Inactivos" }));
  await expect
    .poll(() => rowTexts(screen).map((text) => text.slice(0, 19)))
    .toEqual(["Cerealera del Norte"]);

  await userEvent.click(screen.getByRole("button", { name: /Estado:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Todos" }));
  await expect.poll(() => rowTexts(screen)).toHaveLength(2);
});

test("lists suppliers by name, and the header reverses the order", async () => {
  const services = createServices();
  const screen = await loaded(services, [granos, andina], {
    filters: suppliersListFilters.parse({ status: "all" }),
  });
  await expect
    .poll(() => rowTexts(screen).map((text) => text.slice(0, 4)))
    .toEqual(["Dist", "Gran"]);

  await userEvent.click(screen.getByRole("button", { name: "Proveedor" }));

  await expect
    .poll(() => rowTexts(screen).map((text) => text.slice(0, 4)))
    .toEqual(["Gran", "Dist"]);
});

test("the search field filters by name, CUIT or contact, case-insensitively", async () => {
  const services = createServices();
  const screen = await loaded(services, [andina, granos]);
  const search = screen.getByPlaceholder("Buscar un proveedor");

  await userEvent.fill(search, "gRAN");
  await expect.poll(() => rowTexts(screen)).toHaveLength(1);

  await userEvent.fill(search, FICTIONAL_CUIT);
  await expect.poll(() => rowTexts(screen).map((text) => text.slice(0, 4))).toEqual(["Dist"]);

  await userEvent.fill(search, "marta");
  await expect.poll(() => rowTexts(screen).map((text) => text.slice(0, 4))).toEqual(["Dist"]);
});

test("shows the blank empty state when there are no suppliers yet", async () => {
  const services = createServices();
  vi.mocked(services.fetchSuppliers).mockResolvedValue({ kind: "ok", value: [] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Todavía no hay proveedores")).toBeVisible();
});

test("shows a filtered empty state when the search matches nothing", async () => {
  const services = createServices();
  const screen = await loaded(services, [andina]);

  await userEvent.fill(screen.getByPlaceholder("Buscar un proveedor"), "zzz");

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
});

test("shows a filtered empty state when no supplier has the chosen state", async () => {
  const services = createServices();
  const screen = await loaded(services, [andina], {
    filters: suppliersListFilters.parse({ status: "inactive" }),
  });

  await expect.element(screen.getByText("No hay proveedores inactivos")).toBeVisible();
});

test("shows a load error with a retry action that starts again from the loading placeholder", async () => {
  const services = createServices();
  const retry = deferred<Awaited<ReturnType<typeof services.fetchSuppliers>>>();
  vi.mocked(services.fetchSuppliers)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir los proveedores")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("table", { name: "Proveedores" }))
    .toHaveAttribute("aria-busy", "true");
  retry.resolve({ kind: "ok", value: [andina] });
  await expect.element(screen.getByText("Distribuidora Andina")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const services = createServices();
  vi.mocked(services.fetchSuppliers).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("navigates to Mi cuenta when the suppliers request comes back forbidden", async () => {
  window.history.pushState(null, "", "/suppliers");
  const services = createServices();
  vi.mocked(services.fetchSuppliers).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("ends the session when the suppliers request finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.fetchSuppliers).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("the create action stays available while the suppliers load, and after they fail to load", async () => {
  const services = createServices();
  const firstLoad = deferred<Awaited<ReturnType<typeof services.fetchSuppliers>>>();
  vi.mocked(services.fetchSuppliers).mockReturnValueOnce(firstLoad.promise);
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: "Nuevo proveedor" })).toBeEnabled();

  firstLoad.resolve({ kind: "failed" });
  await expect.element(screen.getByText("No pudimos abrir los proveedores")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Nuevo proveedor" })).toBeEnabled();
});

test("the create action opens the new supplier modal, and the created supplier is listed", async () => {
  const services = createServices();
  vi.mocked(services.fetchSuppliers)
    .mockResolvedValueOnce({ kind: "ok", value: [andina] })
    .mockResolvedValueOnce({ kind: "ok", value: [andina, granos] });
  vi.mocked(services.createSupplier).mockResolvedValue({ kind: "ok", supplier: granos });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Distribuidora Andina")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Nuevo proveedor" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Granos del Valle");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el proveedor" }));

  expect(services.createSupplier).toHaveBeenCalledWith({
    name: "Granos del Valle",
    cuit: "",
    contact: "",
    note: "",
  });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Granos del Valle")).toBeVisible();
});

test("cancel closes the new supplier modal", async () => {
  const services = createServices();
  const screen = await loaded(services, [andina]);
  await userEvent.click(screen.getByRole("button", { name: "Nuevo proveedor" }));

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
});

test("the edit action opens the supplier's edit modal, and the saved change is listed", async () => {
  const services = createServices();
  vi.mocked(services.editSupplier).mockResolvedValue({ kind: "ok" });
  const screen = await loaded(services, [andina]);

  await userEvent.click(
    screen.getByRole("button", { name: "Editar el proveedor Distribuidora Andina" }),
  );
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Distribuidora Andina" })).toBeVisible();
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Andina Mayorista");
  vi.mocked(services.fetchSuppliers).mockResolvedValue({
    kind: "ok",
    value: [{ ...andina, name: "Andina Mayorista", version: 2 }],
  });
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  expect(services.editSupplier).toHaveBeenCalledWith(
    andina.id,
    expect.objectContaining({ name: "Andina Mayorista", version: 1 }),
  );
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Andina Mayorista")).toBeVisible();
});

test("a stale version's reload refills the edit modal from the list read again", async () => {
  const services = createServices();
  vi.mocked(services.editSupplier).mockResolvedValue({ kind: "stale_version" });
  const screen = await loaded(services, [andina]);
  await userEvent.click(
    screen.getByRole("button", { name: "Editar el proveedor Distribuidora Andina" }),
  );
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect
    .element(dialog.getByText("Este proveedor cambió mientras lo editabas"))
    .toBeVisible();
  vi.mocked(services.fetchSuppliers).mockResolvedValue({
    kind: "ok",
    value: [{ ...andina, name: "Andina Mayorista", version: 5 }],
  });

  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Andina Mayorista");
});

test("deactivating asks first, then deactivates the supplier and refreshes the list", async () => {
  const services = createServices();
  vi.mocked(services.deactivateSupplier).mockResolvedValue({ kind: "ok" });
  const screen = await loaded(services, [andina]);

  await userEvent.click(
    screen.getByRole("button", { name: "Desactivar el proveedor Distribuidora Andina" }),
  );
  const dialog = screen.getByRole("dialog");
  await expect
    .element(
      dialog.getByRole("heading", { name: '¿Desactivar el proveedor "Distribuidora Andina"?' }),
    )
    .toBeVisible();
  vi.mocked(services.fetchSuppliers).mockResolvedValue({
    kind: "ok",
    value: [{ ...andina, active: false, version: 2 }],
  });
  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  expect(services.deactivateSupplier).toHaveBeenCalledWith(andina.id);
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("No hay proveedores activos")).toBeVisible();
});

test("reactivating an inactive supplier asks first, then reactivates it and refreshes the list", async () => {
  const services = createServices();
  vi.mocked(services.reactivateSupplier).mockResolvedValue({ kind: "ok" });
  const screen = await loaded(services, [andina, cerealera], {
    filters: suppliersListFilters.parse({ status: "all" }),
  });
  expect(
    screen.getByRole("button", { name: "Desactivar el proveedor Cerealera del Norte" }).query(),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "Reactivar el proveedor Distribuidora Andina" }).query(),
  ).toBeNull();

  await userEvent.click(
    screen.getByRole("button", { name: "Reactivar el proveedor Cerealera del Norte" }),
  );
  const dialog = screen.getByRole("dialog");
  await expect
    .element(
      dialog.getByRole("heading", { name: '¿Reactivar el proveedor "Cerealera del Norte"?' }),
    )
    .toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));

  expect(services.reactivateSupplier).toHaveBeenCalledWith(cerealera.id);
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchSuppliers).mock.calls.length).toBe(2);
});

test("updating the list after a supplier was already deactivated closes the question and reads the list again", async () => {
  const services = createServices();
  vi.mocked(services.deactivateSupplier).mockResolvedValue({ kind: "already_changed" });
  const screen = await loaded(services, [andina]);
  await userEvent.click(
    screen.getByRole("button", { name: "Desactivar el proveedor Distribuidora Andina" }),
  );
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchSuppliers).mock.calls.length).toBe(2);
});

test("opens with the filters it is given, and reports every change to them", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await loaded(services, [andina, granos, cerealera], {
    filters: { search: "gra", status: "all", sort: "descending" },
    onFiltersChange,
  });

  await expect.element(screen.getByPlaceholder("Buscar un proveedor")).toHaveValue("gra");
  await expect.poll(() => rowTexts(screen)).toHaveLength(1);
  expect(onFiltersChange).not.toHaveBeenCalled();

  await userEvent.fill(screen.getByPlaceholder("Buscar un proveedor"), "");
  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ search: "", status: "all", sort: "descending" });

  await userEvent.click(screen.getByRole("button", { name: "Proveedor" }));
  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ search: "", status: "all", sort: "ascending" });
});

test("has no accessibility violations once loaded, and with the create modal open", async () => {
  const services = createServices();
  const screen = await loaded(services, [andina, cerealera], {
    filters: suppliersListFilters.parse({ status: "all" }),
  });

  await expectNoAccessibilityViolations(screen.container);
  await userEvent.click(screen.getByRole("button", { name: "Nuevo proveedor" }));
  await expectNoAccessibilityViolations(document.body);
});
