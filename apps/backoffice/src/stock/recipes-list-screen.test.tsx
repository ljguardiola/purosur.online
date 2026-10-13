import type { RecipeSummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { RecipesListScreen } from "./recipes-list-screen";
import type { RecipesListScreenServices } from "./recipes-list-services";
import { type RecipesListFilters, recipesListFilters } from "./routes";
import {
  almendras,
  avenaConPasas,
  cajaDeInfusiones,
  mixDeFrutosSecos,
  recipeList,
  teVerde,
} from "./test-support/recipes";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function createServices(
  overrides: Partial<RecipesListScreenServices> = {},
): RecipesListScreenServices {
  return { fetchRecipes: vi.fn(), saveRecipe: vi.fn(), ...overrides };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function screenElement(
  services: RecipesListScreenServices,
  onSessionEnded: () => void = () => {},
  {
    filters = recipesListFilters.parse({}),
    onFiltersChange = () => {},
  }: {
    filters?: RecipesListFilters;
    onFiltersChange?: (filters: RecipesListFilters) => void;
  } = {},
) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <RecipesListScreen
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

async function loaded(services: RecipesListScreenServices, recipes: RecipeSummary[], options = {}) {
  vi.mocked(services.fetchRecipes).mockResolvedValue({ kind: "ok", value: recipeList(recipes) });
  const screen = await renderScreen(services, () => {}, options);
  await expect.element(screen.getByRole("table", { name: "Recetas" })).toBeVisible();
  return screen;
}

test("shows the breadcrumb, the heading and each recipe with its product, components and no batch yet", async () => {
  const services = createServices();
  const screen = await loaded(services, [mixDeFrutosSecos, cajaDeInfusiones]);

  await expect.element(screen.getByText("Stock").first()).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Recetas", level: 1 })).toBeVisible();
  await expect
    .poll(() => rowTexts(screen))
    .toEqual([
      "Caja de infusionesInfusiones · por unidad2 componentesTé verde y Miel pura 1 kgSin tandas",
      "Mix de frutos secosFrutos secos · por peso4 componentesAlmendras, Nueces, Maní y PasasSin tandas",
    ]);
});

test("counts the assembled products under the table", async () => {
  const services = createServices();
  const screen = await loaded(services, [mixDeFrutosSecos, cajaDeInfusiones]);
  await expect.element(screen.getByText("2 productos armados")).toBeVisible();

  await userEvent.fill(screen.getByPlaceholder("Buscar un producto armado"), "mix");

  await expect.element(screen.getByText("1 producto armado")).toBeVisible();
});

test("the search field filters by the assembled product's name, case-insensitively", async () => {
  const services = createServices();
  const screen = await loaded(services, [mixDeFrutosSecos, cajaDeInfusiones]);
  const search = screen.getByPlaceholder("Buscar un producto armado");

  await userEvent.fill(search, "CAJA");
  await expect.poll(() => rowTexts(screen).map((text) => text.slice(0, 4))).toEqual(["Caja"]);

  await userEvent.fill(search, "mix");
  await expect.poll(() => rowTexts(screen).map((text) => text.slice(0, 3))).toEqual(["Mix"]);
});

test("shows the blank empty state when there are no recipes yet", async () => {
  const services = createServices();
  vi.mocked(services.fetchRecipes).mockResolvedValue({ kind: "ok", value: recipeList([]) });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Todavía no hay productos armados")).toBeVisible();
  await expect
    .element(screen.getByText("Una receta dice qué lleva un producto armado, como un mix."))
    .toBeVisible();
});

test("shows a filtered empty state when the search matches nothing", async () => {
  const services = createServices();
  const screen = await loaded(services, [mixDeFrutosSecos]);

  await userEvent.fill(screen.getByPlaceholder("Buscar un producto armado"), "zzz");

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
});

test("shows a load error with a retry action that starts again from the loading placeholder", async () => {
  const services = createServices();
  const retry = deferred<Awaited<ReturnType<typeof services.fetchRecipes>>>();
  vi.mocked(services.fetchRecipes)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir las recetas")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("table", { name: "Recetas" }))
    .toHaveAttribute("aria-busy", "true");
  retry.resolve({ kind: "ok", value: recipeList([mixDeFrutosSecos]) });
  await expect.element(screen.getByText("Mix de frutos secos")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait", async () => {
  const services = createServices();
  vi.mocked(services.fetchRecipes).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("navigates to Mi cuenta when the recipes request comes back forbidden", async () => {
  window.history.pushState(null, "", "/recipes");
  const services = createServices();
  vi.mocked(services.fetchRecipes).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("ends the session when the recipes request finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.fetchRecipes).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("keeps the rows while the list is read again after a change", async () => {
  const services = createServices();
  const reload = deferred<Awaited<ReturnType<typeof services.fetchRecipes>>>();
  vi.mocked(services.saveRecipe).mockResolvedValue({ kind: "ok", recipe: mixDeFrutosSecos });
  const screen = await loaded(services, [mixDeFrutosSecos]);
  vi.mocked(services.fetchRecipes).mockReturnValue(reload.promise);

  await userEvent.click(
    screen.getByRole("button", { name: "Editar la receta de Mix de frutos secos" }),
  );
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Guardar la receta" }),
  );

  await expect
    .element(screen.getByRole("table", { name: "Recetas" }))
    .toHaveAttribute("aria-busy", "true");
  await expect.element(screen.getByText("Mix de frutos secos").first()).toBeVisible();
  reload.resolve({ kind: "ok", value: recipeList([mixDeFrutosSecos]) });
});

test("the create action waits for the products it offers: disabled while loading and after a failure", async () => {
  const services = createServices();
  const firstLoad = deferred<Awaited<ReturnType<typeof services.fetchRecipes>>>();
  vi.mocked(services.fetchRecipes)
    .mockReturnValueOnce(firstLoad.promise)
    .mockResolvedValueOnce({ kind: "ok", value: recipeList([]) });
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: "Nueva receta" })).toBeDisabled();

  firstLoad.resolve({ kind: "failed" });
  await expect.element(screen.getByText("No pudimos abrir las recetas")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Nueva receta" })).toBeDisabled();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  await expect.element(screen.getByRole("button", { name: "Nueva receta" })).toBeEnabled();
});

test("the create action opens the new recipe modal, and the created recipe is listed and confirmed", async () => {
  const services = createServices();
  const created: RecipeSummary = {
    ...mixDeFrutosSecos,
    productId: avenaConPasas.id,
    productName: "Avena con pasas",
    version: 1,
  };
  vi.mocked(services.fetchRecipes)
    .mockResolvedValueOnce({ kind: "ok", value: recipeList([cajaDeInfusiones]) })
    .mockResolvedValueOnce({ kind: "ok", value: recipeList([cajaDeInfusiones, created]) });
  vi.mocked(services.saveRecipe).mockResolvedValue({ kind: "ok", recipe: created });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Caja de infusiones")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Nueva receta" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("combobox", { name: /^Producto armado/ }));
  await expect.element(screen.getByRole("option", { name: "Avena con pasas" })).toBeVisible();
  (screen.getByRole("option", { name: "Avena con pasas" }).element() as HTMLElement).click();
  await userEvent.click(dialog.getByRole("button", { name: "Agregar un componente" }));
  await userEvent.click(dialog.getByRole("combobox", { name: /^Componente/ }));
  await expect.element(screen.getByRole("option", { name: "Almendras" })).toBeVisible();
  (screen.getByRole("option", { name: "Almendras" }).element() as HTMLElement).click();
  await userEvent.fill(dialog.getByRole("textbox", { name: "Cantidad de Almendras" }), "0,4");
  await userEvent.click(dialog.getByRole("button", { name: "Crear la receta" }));

  expect(services.saveRecipe).toHaveBeenCalledWith(avenaConPasas.id, {
    components: [{ componentProductId: almendras.id, quantityPerOutputUnit: 400 }],
    version: null,
  });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Avena con pasas").first()).toBeVisible();
  await expect.element(screen.getByText("Receta creada")).toBeVisible();
  await expect
    .element(screen.getByText("La receta de Avena con pasas ya está lista."))
    .toBeVisible();
});

test("the new recipe modal does not offer a product that already has a recipe", async () => {
  const services = createServices();
  const screen = await loaded(services, [mixDeFrutosSecos]);
  await userEvent.click(screen.getByRole("button", { name: "Nueva receta" }));

  await userEvent.click(
    screen.getByRole("dialog").getByRole("combobox", { name: /^Producto armado/ }),
  );

  await expect.element(screen.getByRole("option", { name: "Avena con pasas" })).toBeVisible();
  expect(screen.getByRole("option", { name: "Mix de frutos secos" }).query()).toBeNull();
});

test("cancel closes the new recipe modal", async () => {
  const services = createServices();
  const screen = await loaded(services, [mixDeFrutosSecos]);
  await userEvent.click(screen.getByRole("button", { name: "Nueva receta" }));

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
});

test("the edit action opens the recipe's modal, and the saved change is listed and confirmed", async () => {
  const services = createServices();
  const changed: RecipeSummary = {
    ...cajaDeInfusiones,
    version: 2,
    components: cajaDeInfusiones.components
      .slice(0, 1)
      .map((component) => ({ ...component, quantityPerOutputUnit: 3000 })),
  };
  vi.mocked(services.saveRecipe).mockResolvedValue({ kind: "ok", recipe: changed });
  const screen = await loaded(services, [cajaDeInfusiones]);

  await userEvent.click(
    screen.getByRole("button", { name: "Editar la receta de Caja de infusiones" }),
  );
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Caja de infusiones" })).toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Quitar Miel pura 1 kg" }));
  await userEvent.fill(dialog.getByRole("textbox", { name: "Cantidad de Té verde" }), "3");
  vi.mocked(services.fetchRecipes).mockResolvedValue({ kind: "ok", value: recipeList([changed]) });
  await userEvent.click(dialog.getByRole("button", { name: "Guardar la receta" }));

  expect(services.saveRecipe).toHaveBeenCalledWith(cajaDeInfusiones.productId, {
    components: [{ componentProductId: teVerde.id, quantityPerOutputUnit: 3000 }],
    version: 1,
  });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("1 componente").first()).toBeVisible();
  await expect.element(screen.getByText("Receta guardada")).toBeVisible();
  await expect
    .element(screen.getByText("Se reemplazó la receta de Caja de infusiones."))
    .toBeVisible();
});

test("the confirmation goes away when dismissed", async () => {
  const services = createServices();
  vi.mocked(services.saveRecipe).mockResolvedValue({ kind: "ok", recipe: mixDeFrutosSecos });
  const screen = await loaded(services, [mixDeFrutosSecos]);
  await userEvent.click(
    screen.getByRole("button", { name: "Editar la receta de Mix de frutos secos" }),
  );
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Guardar la receta" }),
  );
  await expect.element(screen.getByText("Receta guardada")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

  await expect.poll(() => screen.getByText("Receta guardada").query()).toBeNull();
});

test("opens with the filters it is given, and reports every change to them", async () => {
  const services = createServices();
  const onFiltersChange = vi.fn();
  const screen = await loaded(services, [mixDeFrutosSecos, cajaDeInfusiones], {
    filters: { search: "mix" },
    onFiltersChange,
  });

  await expect.element(screen.getByPlaceholder("Buscar un producto armado")).toHaveValue("mix");
  await expect.poll(() => rowTexts(screen)).toHaveLength(1);
  expect(onFiltersChange).not.toHaveBeenCalled();

  await userEvent.fill(screen.getByPlaceholder("Buscar un producto armado"), "caja");
  await expect.poll(() => onFiltersChange.mock.lastCall?.[0]).toEqual({ search: "caja" });
});

test("has no accessibility violations once loaded, and with the create modal open", async () => {
  const services = createServices();
  const screen = await loaded(services, [mixDeFrutosSecos, cajaDeInfusiones]);

  await expectNoAccessibilityViolations(screen.container);
  await userEvent.click(screen.getByRole("button", { name: "Nueva receta" }));
  await expectNoAccessibilityViolations(document.body);
});
