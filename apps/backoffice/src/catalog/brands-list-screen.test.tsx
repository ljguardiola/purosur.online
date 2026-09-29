import type { BrandSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { BrandsListScreen } from "./brands-list-screen";
import type { BrandsListScreenServices } from "./brands-list-services";
import { type BrandsListFilters, brandsListFilters } from "./routes";

function createServices(
  overrides: Partial<BrandsListScreenServices> = {},
): BrandsListScreenServices {
  return {
    fetchBrands: vi.fn(),
    createBrand: vi.fn(),
    editBrand: vi.fn(),
    deactivateBrand: vi.fn(),
    reactivateBrand: vi.fn(),
    ...overrides,
  };
}

const granix: BrandSummary = {
  id: "brand-1",
  name: "Granix",
  active: true,
  version: 1,
  productCount: 42,
};
const vitaco: BrandSummary = {
  id: "brand-2",
  name: "Vitaco",
  active: true,
  version: 2,
  productCount: 18,
};
const litoral: BrandSummary = {
  id: "brand-3",
  name: "Yerba del Litoral",
  active: false,
  version: 4,
  productCount: 3,
};
const cabrales: BrandSummary = {
  id: "brand-4",
  name: "Cabrales",
  active: true,
  version: 1,
  productCount: 1,
};

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function screenElement(
  services: BrandsListScreenServices,
  onSessionEnded: () => void = () => {},
  {
    filters = brandsListFilters.parse({}),
    onFiltersChange = () => {},
  }: {
    filters?: BrandsListFilters;
    onFiltersChange?: (filters: BrandsListFilters) => void;
  } = {},
) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <BrandsListScreen
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

async function openNewBrandModal(screen: Screen) {
  await userEvent.click(screen.getByRole("button", { name: "Nueva marca" }));
  return screen.getByRole("dialog");
}

async function loaded(services: BrandsListScreenServices, brands: BrandSummary[], options = {}) {
  vi.mocked(services.fetchBrands).mockResolvedValue({ kind: "ok", value: brands });
  const screen = await renderScreen(services, () => {}, options);
  await expect.element(screen.getByRole("table", { name: "Marcas" })).toBeVisible();
  return screen;
}

test("shows the breadcrumb, heading, each active brand with its product count and state, and the totals", async () => {
  const services = createServices();
  const screen = await loaded(services, [granix, vitaco, litoral]);

  await expect.element(screen.getByText("Catálogo").first()).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Marcas", level: 1 })).toBeVisible();
  await expect.poll(() => rowTexts(screen)).toEqual(["Granix42Activa", "Vitaco18Activa"]);
  await expect.element(screen.getByText("2 marcas · 60 productos")).toBeVisible();
});

test("the state filter shows the inactive brands, or every brand, counting the inactive ones", async () => {
  const services = createServices();
  const screen = await loaded(services, [granix, litoral]);

  await userEvent.click(screen.getByRole("button", { name: /Estado:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Inactivas" }));

  await expect.poll(() => rowTexts(screen)).toEqual(["Yerba del Litoral3Inactiva"]);
  await expect.element(screen.getByText("1 marca · 1 inactiva · 3 productos")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /Estado:/ }));
  await userEvent.click(screen.getByRole("option", { name: "Todas" }));

  await expect.element(screen.getByText("2 marcas · 1 inactiva · 45 productos")).toBeVisible();
});

test("lists brands by name, and the products header orders them by how many products carry them", async () => {
  const services = createServices();
  const screen = await loaded(services, [vitaco, granix, cabrales]);

  await expect
    .poll(() => rowTexts(screen).map((text) => text.split(/\d/)[0]))
    .toEqual(["Cabrales", "Granix", "Vitaco"]);

  await userEvent.click(screen.getByRole("button", { name: "Productos" }));

  await expect
    .poll(() => rowTexts(screen).map((text) => text.split(/\d/)[0]))
    .toEqual(["Granix", "Vitaco", "Cabrales"]);
});

test("the search field filters the brands by name, case-insensitively", async () => {
  const services = createServices();
  const screen = await loaded(services, [granix, vitaco]);

  await userEvent.fill(screen.getByPlaceholder("Buscar una marca"), "gRAN");

  await expect.poll(() => rowTexts(screen).length).toBe(1);
  await expect.element(screen.getByText("1 marca · 42 productos")).toBeVisible();
});

test("shows the blank empty state when there are no brands yet, with no footer", async () => {
  const services = createServices();
  vi.mocked(services.fetchBrands).mockResolvedValue({ kind: "ok", value: [] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Todavía no hay marcas")).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Se cargan para identificar el fabricante o la línea comercial de un producto.",
      ),
    )
    .toBeVisible();
  expect(screen.getByText(/0 marcas/).query()).toBeNull();
});

test("shows a filtered empty state when the search matches nothing", async () => {
  const services = createServices();
  const screen = await loaded(services, [granix]);

  await userEvent.fill(screen.getByPlaceholder("Buscar una marca"), "zzz");

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
});

test("shows a filtered empty state when no brand has the chosen state", async () => {
  const services = createServices();
  const screen = await loaded(services, [granix], {
    filters: brandsListFilters.parse({ status: "inactive" }),
  });

  await expect.element(screen.getByText("No hay marcas inactivas")).toBeVisible();
});

test("shows a load error with a retry action that starts again from the loading placeholder", async () => {
  const services = createServices();
  const retry = deferred<Awaited<ReturnType<typeof services.fetchBrands>>>();
  vi.mocked(services.fetchBrands)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir las marcas")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("table", { name: "Marcas" }))
    .toHaveAttribute("aria-busy", "true");
  retry.resolve({ kind: "ok", value: [granix] });
  await expect.element(screen.getByText("Granix")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const services = createServices();
  vi.mocked(services.fetchBrands).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("navigates to Mi cuenta when the brands request comes back forbidden", async () => {
  window.history.pushState(null, "", "/catalog/brands");
  const services = createServices();
  vi.mocked(services.fetchBrands).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  window.history.pushState(null, "", "/");
});

test("ends the session when the brands request finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.fetchBrands).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("the create action stays available while the brands load, and after they fail to load", async () => {
  const services = createServices();
  const firstLoad = deferred<Awaited<ReturnType<typeof services.fetchBrands>>>();
  vi.mocked(services.fetchBrands).mockReturnValueOnce(firstLoad.promise);
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: "Nueva marca" })).toBeEnabled();

  firstLoad.resolve({ kind: "failed" });
  await expect.element(screen.getByText("No pudimos abrir las marcas")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Nueva marca" })).toBeEnabled();
});

test("creates a brand from the create modal, sending the name trimmed, and lists it", async () => {
  const services = createServices();
  const dulcor: BrandSummary = { ...cabrales, id: "brand-9", name: "Dulcor", productCount: 0 };
  vi.mocked(services.fetchBrands)
    .mockResolvedValueOnce({ kind: "ok", value: [granix] })
    .mockResolvedValueOnce({ kind: "ok", value: [granix, dulcor] });
  vi.mocked(services.createBrand).mockResolvedValue({ kind: "ok", brand: dulcor });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Granix")).toBeVisible();
  const dialog = await openNewBrandModal(screen);

  await expect.element(dialog.getByText("Catálogo", { exact: true })).toBeVisible();
  await expect.element(dialog.getByRole("heading", { name: "Nueva marca" })).toBeVisible();
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "  Dulcor  ");
  await userEvent.click(dialog.getByRole("button", { name: "Crear la marca" }));

  expect(services.createBrand).toHaveBeenCalledWith({ name: "Dulcor" });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Dulcor")).toBeVisible();
});

test("cancel closes the create modal without calling the API", async () => {
  const services = createServices();
  const screen = await loaded(services, [granix]);
  const dialog = await openNewBrandModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.createBrand).not.toHaveBeenCalled();
});

test("requires a name, and refuses one longer than 100 characters, without calling the API", async () => {
  const services = createServices();
  const screen = await loaded(services, [granix]);
  const dialog = await openNewBrandModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Crear la marca" }));
  await expect.element(dialog.getByText("Ingresá el nombre de la marca.")).toBeVisible();

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "a".repeat(101));
  await userEvent.click(dialog.getByRole("button", { name: "Crear la marca" }));
  await expect
    .element(dialog.getByText("El nombre puede tener hasta 100 caracteres."))
    .toBeVisible();
  expect(services.createBrand).not.toHaveBeenCalled();
});

test("shows that a brand with that name already exists, keeping the modal open", async () => {
  const services = createServices();
  vi.mocked(services.createBrand).mockResolvedValue({ kind: "name_taken" });
  const screen = await loaded(services, [vitaco]);
  const dialog = await openNewBrandModal(screen);

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "vitaco");
  await userEvent.click(dialog.getByRole("button", { name: "Crear la marca" }));

  await expect.element(dialog.getByText("Ya existe una marca con este nombre.")).toBeVisible();
  await expect.element(dialog.getByRole("textbox", { name: /^Nombre/ })).toHaveValue("vitaco");
});

test("shows the failure notice on create, keeping the typed name", async () => {
  const services = createServices();
  vi.mocked(services.createBrand).mockResolvedValue({ kind: "failed" });
  const screen = await loaded(services, [granix]);
  const dialog = await openNewBrandModal(screen);

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Dulcor");
  await userEvent.click(dialog.getByRole("button", { name: "Crear la marca" }));

  await expect.element(dialog.getByText("No se guardó la marca")).toBeVisible();
  await expect.element(dialog.getByText("Volvé a intentarlo.")).toBeVisible();
  await expect.element(dialog.getByRole("textbox", { name: /^Nombre/ })).toHaveValue("Dulcor");
});

test("shows the rate-limited notice on create", async () => {
  const services = createServices();
  vi.mocked(services.createBrand).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 60,
  });
  const screen = await loaded(services, [granix]);
  const dialog = await openNewBrandModal(screen);

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Dulcor");
  await userEvent.click(dialog.getByRole("button", { name: "Crear la marca" }));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("ends the session when creating finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.fetchBrands).mockResolvedValue({ kind: "ok", value: [granix] });
  vi.mocked(services.createBrand).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  await expect.element(screen.getByText("Granix")).toBeVisible();
  const dialog = await openNewBrandModal(screen);

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Dulcor");
  await userEvent.click(dialog.getByRole("button", { name: "Crear la marca" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("the edit action opens the brand's name, saying how many products show it, and saves the rename", async () => {
  const services = createServices();
  vi.mocked(services.editBrand).mockResolvedValue({ kind: "ok" });
  const screen = await loaded(services, [granix]);

  await userEvent.click(screen.getByRole("button", { name: "Editar la marca Granix" }));
  const dialog = screen.getByRole("dialog");

  await expect.element(dialog.getByText("Catálogo · Marcas")).toBeVisible();
  await expect.element(dialog.getByRole("heading", { name: "Granix" })).toBeVisible();
  await expect.element(dialog.getByRole("textbox", { name: /^Nombre/ })).toHaveValue("Granix");
  await expect
    .element(dialog.getByText("El nombre nuevo se ve en sus 42 productos."))
    .toBeVisible();

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), " Granix Pro ");
  vi.mocked(services.fetchBrands).mockResolvedValue({
    kind: "ok",
    value: [{ ...granix, name: "Granix Pro", version: 2 }],
  });
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  expect(services.editBrand).toHaveBeenCalledWith("brand-1", { name: "Granix Pro", version: 1 });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Granix Pro")).toBeVisible();
});

test("the edit modal names the one product a brand is on, and says nothing about products for a brand on none", async () => {
  const services = createServices();
  const screen = await loaded(services, [cabrales, { ...vitaco, productCount: 0 }]);

  await userEvent.click(screen.getByRole("button", { name: "Editar la marca Cabrales" }));
  await expect
    .element(screen.getByRole("dialog").getByText("El nombre nuevo se ve en su producto."))
    .toBeVisible();
  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();

  await userEvent.click(screen.getByRole("button", { name: "Editar la marca Vitaco" }));
  await expect.element(screen.getByRole("dialog").getByRole("textbox")).toHaveValue("Vitaco");
  expect(
    screen
      .getByRole("dialog")
      .getByText(/El nombre nuevo/)
      .query(),
  ).toBeNull();
});

test("a rename to a name another brand has shows the error in place of the products line", async () => {
  const services = createServices();
  vi.mocked(services.editBrand).mockResolvedValue({ kind: "name_taken" });
  const screen = await loaded(services, [granix, vitaco]);
  await userEvent.click(screen.getByRole("button", { name: "Editar la marca Granix" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Vitaco");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Ya existe una marca con este nombre.")).toBeVisible();
  expect(dialog.getByText("El nombre nuevo se ve en sus 42 productos.").query()).toBeNull();
});

test("a stale-version reload on edit refills the form from the fresh brand and saves over its version", async () => {
  const services = createServices();
  vi.mocked(services.editBrand)
    .mockResolvedValueOnce({ kind: "stale_version" })
    .mockResolvedValueOnce({ kind: "ok" });
  const screen = await loaded(services, [granix]);
  await userEvent.click(screen.getByRole("button", { name: "Editar la marca Granix" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Granix Pro");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Esta marca cambió mientras la editabas")).toBeVisible();
  vi.mocked(services.fetchBrands).mockResolvedValue({
    kind: "ok",
    value: [{ ...granix, name: "Granix Clásica", version: 5 }],
  });
  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Granix Clásica");
  await expect.element(dialog.getByRole("heading", { name: "Granix Clásica" })).toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  expect(services.editBrand).toHaveBeenLastCalledWith("brand-1", {
    name: "Granix Clásica",
    version: 5,
  });
});

test("shows a not-found notice on edit when the brand no longer exists", async () => {
  const services = createServices();
  vi.mocked(services.editBrand).mockResolvedValue({ kind: "not_found" });
  const screen = await loaded(services, [granix]);
  await userEvent.click(screen.getByRole("button", { name: "Editar la marca Granix" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Esta marca ya no existe");
});

test("shows the failure notice on edit", async () => {
  const services = createServices();
  vi.mocked(services.editBrand).mockResolvedValue({ kind: "failed" });
  const screen = await loaded(services, [granix]);
  await userEvent.click(screen.getByRole("button", { name: "Editar la marca Granix" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("No se guardó la marca")).toBeVisible();
});

test("deactivating asks first, then deactivates the brand and refreshes the list", async () => {
  const services = createServices();
  vi.mocked(services.deactivateBrand).mockResolvedValue({ kind: "ok" });
  const screen = await loaded(services, [granix, litoral]);

  await userEvent.click(screen.getByRole("button", { name: "Desactivar la marca Granix" }));
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: '¿Desactivar la marca "Granix"?' }))
    .toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "Deja de ofrecerse para asignar a un producto nuevo. Los productos que ya la tienen la conservan.",
      ),
    )
    .toBeVisible();
  vi.mocked(services.fetchBrands).mockResolvedValue({
    kind: "ok",
    value: [{ ...granix, active: false, version: 2 }, litoral],
  });
  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  expect(services.deactivateBrand).toHaveBeenCalledWith("brand-1");
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Todavía no hay marcas")).not.toBeInTheDocument();
  await expect.element(screen.getByText("No hay marcas activas")).toBeVisible();
});

test("cancel closes the deactivation question without calling the API", async () => {
  const services = createServices();
  const screen = await loaded(services, [granix]);
  await userEvent.click(screen.getByRole("button", { name: "Desactivar la marca Granix" }));

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.deactivateBrand).not.toHaveBeenCalled();
});

test("reactivating an inactive brand asks first, then reactivates it", async () => {
  const services = createServices();
  vi.mocked(services.reactivateBrand).mockResolvedValue({ kind: "ok" });
  const screen = await loaded(services, [granix, litoral], {
    filters: brandsListFilters.parse({ status: "all" }),
  });
  expect(
    screen.getByRole("button", { name: "Desactivar la marca Yerba del Litoral" }).query(),
  ).toBeNull();

  await userEvent.click(
    screen.getByRole("button", { name: "Reactivar la marca Yerba del Litoral" }),
  );
  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: '¿Reactivar la marca "Yerba del Litoral"?' }))
    .toBeVisible();
  await expect
    .element(dialog.getByText("Vuelve a ofrecerse para asignarla a productos nuevos."))
    .toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));

  expect(services.reactivateBrand).toHaveBeenCalledWith("brand-3");
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
});

test("tells when the brand was already deactivated, and updating the list closes the question", async () => {
  const services = createServices();
  vi.mocked(services.deactivateBrand).mockResolvedValue({ kind: "already_changed" });
  const screen = await loaded(services, [granix]);
  await userEvent.click(screen.getByRole("button", { name: "Desactivar la marca Granix" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Ya estaba desactivada");
  await userEvent.click(dialog.getByRole("button", { name: "Actualizar la lista" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchBrands).mock.calls.length).toBe(2);
});

test("tells when the brand was already reactivated", async () => {
  const services = createServices();
  vi.mocked(services.reactivateBrand).mockResolvedValue({ kind: "already_changed" });
  const screen = await loaded(services, [litoral], {
    filters: brandsListFilters.parse({ status: "inactive" }),
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Reactivar la marca Yerba del Litoral" }),
  );
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Ya estaba activa");
});

test("tells when the brand no longer exists on deactivation", async () => {
  const services = createServices();
  vi.mocked(services.deactivateBrand).mockResolvedValue({ kind: "not_found" });
  const screen = await loaded(services, [granix]);
  await userEvent.click(screen.getByRole("button", { name: "Desactivar la marca Granix" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Esta marca ya no existe");
});

test("shows the failure and rate-limited notices on deactivation", async () => {
  const services = createServices();
  vi.mocked(services.deactivateBrand)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "rate_limited", retryAfterSeconds: 60 });
  const screen = await loaded(services, [granix]);
  await userEvent.click(screen.getByRole("button", { name: "Desactivar la marca Granix" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));
  await expect.element(dialog.getByText("No se desactivó la marca")).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));
  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
});

test("ends the session when reactivating finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.fetchBrands).mockResolvedValue({ kind: "ok", value: [litoral] });
  vi.mocked(services.reactivateBrand).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded, {
    filters: brandsListFilters.parse({ status: "inactive" }),
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Reactivar la marca Yerba del Litoral" }),
  );

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Reactivar" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("opens with the filters it is given, and reports every change to them", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await loaded(services, [granix, vitaco, litoral], {
    filters: { search: "vit", status: "all", sortBy: "products", sort: "descending" },
    onFiltersChange,
  });

  await expect.element(screen.getByPlaceholder("Buscar una marca")).toHaveValue("vit");
  await expect.poll(() => rowTexts(screen)).toHaveLength(1);
  expect(onFiltersChange).not.toHaveBeenCalled();

  await userEvent.fill(screen.getByPlaceholder("Buscar una marca"), "");
  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ search: "", status: "all", sortBy: "products", sort: "descending" });

  await userEvent.click(screen.getByRole("button", { name: "Marca" }));
  await expect
    .poll(() => onFiltersChange.mock.lastCall?.[0])
    .toEqual({ search: "", status: "all", sortBy: "brand", sort: "ascending" });
});

test("has no accessibility violations once loaded, and with the create modal open", async () => {
  const services = createServices();
  const screen = await loaded(services, [granix, litoral], {
    filters: brandsListFilters.parse({ status: "all" }),
  });

  await expectNoAccessibilityViolations(screen.container);
  await openNewBrandModal(screen);
  await expectNoAccessibilityViolations(document.body);
});
