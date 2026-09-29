import type { CategorySummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { CategoriesListScreen } from "./categories-list-screen";
import type { CategoriesListScreenServices } from "./categories-list-services";
import { type CategoriesListFilters, categoriesListFilters } from "./routes";

function createServices(
  overrides: Partial<CategoriesListScreenServices> = {},
): CategoriesListScreenServices {
  return {
    fetchCategories: vi.fn(),
    createCategory: vi.fn(),
    editCategory: vi.fn(),
    ...overrides,
  };
}

const groceries: CategorySummary = {
  id: "category-1",
  name: "Almacén",
  version: 1,
  parentId: null,
};
const spreads: CategorySummary = {
  id: "category-2",
  name: "Untables",
  version: 1,
  parentId: "category-1",
};
const jams: CategorySummary = {
  id: "category-3",
  name: "Mermeladas",
  version: 1,
  parentId: "category-2",
};
const drinks: CategorySummary = { id: "category-4", name: "Bebidas", version: 3, parentId: null };

function renderScreen(
  services: CategoriesListScreenServices,
  onSessionEnded: () => void = () => {},
  {
    filters = categoriesListFilters.parse({}),
    onFiltersChange = () => {},
  }: {
    filters?: CategoriesListFilters;
    onFiltersChange?: (filters: CategoriesListFilters) => void;
  } = {},
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <CategoriesListScreen
          services={services}
          onSessionEnded={onSessionEnded}
          filters={filters}
          onFiltersChange={onFiltersChange}
        />
      </main>
    </FieldSizeProvider>,
  );
}

async function openNewCategoryModal(screen: Awaited<ReturnType<typeof renderScreen>>) {
  await userEvent.click(screen.getByRole("button", { name: "Nueva categoría" }));
  return screen.getByRole("dialog");
}

test("shows the breadcrumb, heading, each category's full path label and the category count", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [groceries, spreads, drinks],
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Catálogo")).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Categorías", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Almacén")).toBeVisible();
  await expect.element(screen.getByText("Almacén › Untables")).toBeVisible();
  await expect.element(screen.getByText("Bebidas")).toBeVisible();
  await expect.element(screen.getByText("3 categorías")).toBeVisible();
});

test("lists categories in tree order by default: each parent right before its own descendants", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [drinks, jams, groceries, spreads],
  });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("4 categorías")).toBeVisible();

  function rowNames(): string[] {
    return screen
      .getByRole("row")
      .all()
      .slice(1)
      .map((row) => row.element().textContent ?? "");
  }

  const names = rowNames();
  expect(names[0]).toContain("Almacén");
  expect(names[0]).not.toContain("›");
  expect(names[1]).toContain("Almacén › Untables");
  expect(names[2]).toContain("Almacén › Untables › Mermeladas");
  expect(names[3]).toContain("Bebidas");
});

test("the header toggles the sibling order, still listing each parent before its own descendants", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [groceries, drinks, spreads, jams],
  });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("4 categorías")).toBeVisible();

  function rowNames(): string[] {
    return screen
      .getByRole("row")
      .all()
      .slice(1)
      .map((row) => row.element().textContent ?? "");
  }

  expect(rowNames()[0]).toContain("Almacén");

  await userEvent.click(screen.getByRole("button", { name: "Categoría" }));

  await expect.poll(() => rowNames()[0]).toContain("Bebidas");
  const names = rowNames();
  expect(names[1]).toContain("Almacén");
  expect(names[1]).not.toContain("›");
  expect(names[2]).toContain("Almacén › Untables");
  expect(names[2]).not.toContain("Mermeladas");
  expect(names[3]).toContain("Almacén › Untables › Mermeladas");
});

test("the search field filters the list by the full path label, case-insensitively", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [groceries, spreads, drinks],
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("3 categorías")).toBeVisible();

  await userEvent.fill(screen.getByPlaceholder("Buscar una categoría"), "untables");

  await expect.element(screen.getByText("Bebidas")).not.toBeInTheDocument();
  await expect.element(screen.getByText("Almacén › Untables")).toBeVisible();
});

test("the category count in the footer counts only the categories the search leaves", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [groceries, spreads, drinks],
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("3 categorías")).toBeVisible();

  await userEvent.fill(screen.getByPlaceholder("Buscar una categoría"), "untables");

  await expect.element(screen.getByText("1 categoría")).toBeVisible();
  expect(screen.getByText("3 categorías").query()).toBeNull();
});

test("shows an empty state when there are no categories yet", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Todavía no hay categorías")).toBeVisible();
});

test("shows a filtered empty state when the search matches nothing", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [groceries] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Almacén")).toBeVisible();

  await userEvent.fill(screen.getByPlaceholder("Buscar una categoría"), "zzz");

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
});

test("shows a load error with a retry action when the categories fail to load", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValueOnce({ kind: "failed" });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir las categorías")).toBeVisible();

  vi.mocked(services.fetchCategories).mockResolvedValueOnce({ kind: "ok", value: [groceries] });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("1 categoría")).toBeVisible();
});

test("shows the rate-limited notice with a retry action", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
});

test("navigates to Mi cuenta when the categories request comes back forbidden", async () => {
  window.history.pushState(null, "", "/catalog/categories");
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  window.history.pushState(null, "", "/");
});

test("ends the session when the categories request finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("opens the create modal, and cancel closes it without calling the API", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [groceries] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 categoría")).toBeVisible();

  const dialog = await openNewCategoryModal(screen);

  await expect.element(dialog.getByRole("heading", { name: "Nueva categoría" })).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.createCategory).not.toHaveBeenCalled();
});

test("shows a category created while the list is still loading, even once the earlier load finishes", async () => {
  const services = createServices();
  const newCategory: CategorySummary = {
    id: "category-5",
    name: "Limpieza",
    version: 1,
    parentId: null,
  };
  let finishFirstLoad: (outcome: Awaited<ReturnType<typeof services.fetchCategories>>) => void =
    () => {};
  const firstLoad: ReturnType<typeof services.fetchCategories> = new Promise((resolve) => {
    finishFirstLoad = resolve;
  });
  vi.mocked(services.fetchCategories)
    .mockReturnValueOnce(firstLoad)
    .mockResolvedValueOnce({ kind: "ok", value: [groceries, newCategory] });
  vi.mocked(services.createCategory).mockResolvedValue({ kind: "ok", value: newCategory });
  const screen = await renderScreen(services);
  const dialog = await openNewCategoryModal(screen);

  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }),
    "Limpieza",
  );
  await userEvent.click(dialog.getByRole("button", { name: "Crear la categoría" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Limpieza")).toBeVisible();

  finishFirstLoad({ kind: "ok", value: [groceries] });
  // Awaiting the same promise the screen awaited lets its handling run first; re-rendering then
  // commits whatever state that handling scheduled.
  await firstLoad;
  await screen.rerender(
    <FieldSizeProvider size="backoffice">
      <main>
        <CategoriesListScreen
          services={services}
          onSessionEnded={() => {}}
          filters={categoriesListFilters.parse({})}
          onFiltersChange={() => {}}
        />
      </main>
    </FieldSizeProvider>,
  );

  expect(screen.getByText("2 categorías").query()).not.toBeNull();
  expect(screen.getByText("Limpieza").query()).not.toBeNull();
});

test("shows a category created while the list failed to load", async () => {
  const services = createServices();
  const newCategory: CategorySummary = {
    id: "category-5",
    name: "Limpieza",
    version: 1,
    parentId: null,
  };
  vi.mocked(services.fetchCategories)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: [groceries, newCategory] });
  vi.mocked(services.createCategory).mockResolvedValue({ kind: "ok", value: newCategory });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir las categorías")).toBeVisible();
  const dialog = await openNewCategoryModal(screen);

  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }),
    "Limpieza",
  );
  await userEvent.click(dialog.getByRole("button", { name: "Crear la categoría" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Limpieza")).toBeVisible();
  await expect.element(screen.getByText("2 categorías")).toBeVisible();
});

test("rejects a name longer than 100 characters in the create modal, without calling the API", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Todavía no hay categorías")).toBeVisible();
  const dialog = await openNewCategoryModal(screen);

  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }),
    "a".repeat(101),
  );
  await userEvent.click(dialog.getByRole("button", { name: "Crear la categoría" }));

  await expect
    .element(dialog.getByText("El nombre puede tener hasta 100 caracteres."))
    .toBeVisible();
  expect(services.createCategory).not.toHaveBeenCalled();
});

test("sends the typed name trimmed from the create modal", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.createCategory).mockResolvedValue({
    kind: "ok",
    value: { id: "category-5", name: "Limpieza", version: 1, parentId: null },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Todavía no hay categorías")).toBeVisible();
  const dialog = await openNewCategoryModal(screen);

  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }),
    "  Limpieza  ",
  );
  await userEvent.click(dialog.getByRole("button", { name: "Crear la categoría" }));

  await expect.poll(() => vi.mocked(services.createCategory).mock.calls.length).toBe(1);
  expect(services.createCategory).toHaveBeenCalledWith({ name: "Limpieza", parentId: null });
});

test("requires a name before submitting the create modal, without calling the API", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Todavía no hay categorías")).toBeVisible();
  const dialog = await openNewCategoryModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Crear la categoría" }));

  await expect.element(dialog.getByText("Ingresá el nombre de la categoría.")).toBeVisible();
  expect(services.createCategory).not.toHaveBeenCalled();
});

test("opens the create modal with a parent select offering every category by its path label", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [groceries, spreads],
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 categorías")).toBeVisible();

  const dialog = await openNewCategoryModal(screen);

  await expect.element(dialog.getByRole("heading", { name: "Nueva categoría" })).toBeVisible();
  await expect
    .element(dialog.getByRole("button", { name: /Categoría superior/ }))
    .toHaveTextContent("Ninguna (categoría de primer nivel)");
  await expect
    .element(dialog.getByText("Opcional. Vacío para una categoría de primer nivel."))
    .toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: /Categoría superior/ }));
  await expect.element(dialog.getByRole("option", { name: "Almacén" })).toBeVisible();
  await expect.element(dialog.getByRole("option", { name: "Almacén › Untables" })).toBeVisible();
});

test("creates a top-level category and shows it in the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [groceries] });
  const newCategory: CategorySummary = {
    id: "category-5",
    name: "Limpieza",
    version: 1,
    parentId: null,
  };
  vi.mocked(services.createCategory).mockResolvedValue({ kind: "ok", value: newCategory });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 categoría")).toBeVisible();
  const dialog = await openNewCategoryModal(screen);

  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }),
    "Limpieza",
  );
  await userEvent.click(dialog.getByRole("button", { name: "Crear la categoría" }));

  await expect.poll(() => vi.mocked(services.createCategory).mock.calls.length).toBe(1);
  expect(services.createCategory).toHaveBeenCalledWith({ name: "Limpieza", parentId: null });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Limpieza")).toBeVisible();
  await expect.element(screen.getByText("2 categorías")).toBeVisible();
});

test("creates a subcategory under the chosen parent", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [groceries] });
  const newCategory: CategorySummary = {
    id: "category-5",
    name: "Snacks",
    version: 1,
    parentId: "category-1",
  };
  vi.mocked(services.createCategory).mockResolvedValue({ kind: "ok", value: newCategory });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 categoría")).toBeVisible();
  const dialog = await openNewCategoryModal(screen);

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }), "Snacks");
  await userEvent.click(dialog.getByRole("button", { name: /Categoría superior/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await userEvent.click(dialog.getByRole("button", { name: "Crear la categoría" }));

  await expect.poll(() => vi.mocked(services.createCategory).mock.calls.length).toBe(1);
  expect(services.createCategory).toHaveBeenCalledWith({
    name: "Snacks",
    parentId: "category-1",
  });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Almacén › Snacks")).toBeVisible();
});

test("shows the parent-has-products error on create, naming the chosen parent", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [groceries] });
  vi.mocked(services.createCategory).mockResolvedValue({ kind: "parent_has_products" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 categoría")).toBeVisible();
  const dialog = await openNewCategoryModal(screen);

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }), "Snacks");
  await userEvent.click(dialog.getByRole("button", { name: /Categoría superior/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await userEvent.click(dialog.getByRole("button", { name: "Crear la categoría" }));

  await expect
    .element(
      dialog.getByText(
        '"Almacén" tiene productos asignados. Movelos a otra categoría antes de crear una subcategoría.',
      ),
    )
    .toBeVisible();
});

test("shows the name-taken-under-parent error on create, naming the entered name and the parent", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [groceries] });
  vi.mocked(services.createCategory).mockResolvedValue({ kind: "name_taken" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 categoría")).toBeVisible();
  const dialog = await openNewCategoryModal(screen);

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }), "Snacks");
  await userEvent.click(dialog.getByRole("button", { name: /Categoría superior/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await userEvent.click(dialog.getByRole("button", { name: "Crear la categoría" }));

  await expect
    .element(dialog.getByText('Ya existe una categoría "Snacks" en Almacén.'))
    .toBeVisible();
});

test("shows the plain name-taken error on create when the category is top-level", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [groceries] });
  vi.mocked(services.createCategory).mockResolvedValue({ kind: "name_taken" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 categoría")).toBeVisible();
  const dialog = await openNewCategoryModal(screen);

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }), "Almacén");
  await userEvent.click(dialog.getByRole("button", { name: "Crear la categoría" }));

  await expect.element(dialog.getByText("Ya existe una categoría con este nombre.")).toBeVisible();
});

test("shows a field error under the parent select when the chosen parent has vanished", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [groceries] });
  vi.mocked(services.createCategory).mockResolvedValue({
    kind: "validation_failed",
    field: "parentId",
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 categoría")).toBeVisible();
  const dialog = await openNewCategoryModal(screen);

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }), "Snacks");
  await userEvent.click(dialog.getByRole("button", { name: /Categoría superior/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await userEvent.click(dialog.getByRole("button", { name: "Crear la categoría" }));

  await expect
    .element(dialog.getByText("La categoría superior elegida ya no existe."))
    .toBeVisible();
});

test("the row action opens the edit modal preselecting the category's current parent", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [groceries, spreads],
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Almacén › Untables")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Editar la categoría Untables" }));

  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Untables" })).toBeVisible();
  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }))
    .toHaveValue("Untables");
  await expect
    .element(dialog.getByRole("button", { name: /Categoría superior/ }))
    .toHaveTextContent("Almacén");
});

test("preselects Ninguna in the edit modal for a top-level category", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [groceries] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Almacén")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Editar la categoría Almacén" }));

  const dialog = screen.getByRole("dialog");
  await expect
    .element(dialog.getByRole("button", { name: /Categoría superior/ }))
    .toHaveTextContent("Ninguna (categoría de primer nivel)");
});

test("the edit modal's parent select excludes the category itself and its own descendants", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [groceries, spreads, jams, drinks],
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Almacén")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Editar la categoría Untables" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: /Categoría superior/ }));

  await expect.element(dialog.getByRole("option", { name: "Almacén" })).toBeVisible();
  await expect.element(dialog.getByRole("option", { name: "Bebidas" })).toBeVisible();
  expect(dialog.getByRole("option", { name: "Almacén › Untables" }).query()).toBeNull();
  expect(
    dialog.getByRole("option", { name: "Almacén › Untables › Mermeladas" }).query(),
  ).toBeNull();
});

test("moves a category to a new parent and shows its updated path in the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [groceries, drinks],
  });
  const moved: CategorySummary = { ...drinks, parentId: "category-1", version: 4 };
  vi.mocked(services.editCategory).mockResolvedValue({ kind: "ok", value: moved });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Bebidas")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Editar la categoría Bebidas" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: /Categoría superior/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editCategory).mock.calls.length).toBe(1);
  expect(services.editCategory).toHaveBeenCalledWith("category-4", {
    name: "Bebidas",
    parentId: "category-1",
    version: 3,
  });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Almacén › Bebidas")).toBeVisible();
});

test("rejects a name longer than 100 characters in the edit modal, without calling the API", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [groceries] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Almacén")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Editar la categoría Almacén" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }),
    "a".repeat(101),
  );
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect
    .element(dialog.getByText("El nombre puede tener hasta 100 caracteres."))
    .toBeVisible();
  expect(services.editCategory).not.toHaveBeenCalled();
});

test("sends the typed name trimmed from the edit modal", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [groceries] });
  vi.mocked(services.editCategory).mockResolvedValue({
    kind: "ok",
    value: { ...groceries, name: "Despensa", version: 2 },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Almacén")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Editar la categoría Almacén" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }),
    "  Despensa  ",
  );
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editCategory).mock.calls.length).toBe(1);
  expect(services.editCategory).toHaveBeenCalledWith("category-1", {
    name: "Despensa",
    parentId: null,
    version: 1,
  });
});

test("shows the parent-has-products error on edit, naming the chosen parent", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [groceries, drinks],
  });
  vi.mocked(services.editCategory).mockResolvedValue({ kind: "parent_has_products" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Bebidas")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Editar la categoría Bebidas" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: /Categoría superior/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect
    .element(
      dialog.getByText(
        '"Almacén" tiene productos asignados. Movelos a otra categoría antes de convertirla en categoría superior.',
      ),
    )
    .toBeVisible();
});

test("shows the move-not-allowed error on edit, naming the category and the chosen destination", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [groceries, drinks],
  });
  vi.mocked(services.editCategory).mockResolvedValue({ kind: "move_not_allowed" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Bebidas")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Editar la categoría Bebidas" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: /Categoría superior/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect
    .element(
      dialog.getByText('No se puede mover "Bebidas" bajo "Almacén": es una de sus subcategorías.'),
    )
    .toBeVisible();
});

test("shows the name-taken-under-parent error on rename, naming the entered name and the parent", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [groceries, spreads],
  });
  vi.mocked(services.editCategory).mockResolvedValue({ kind: "name_taken" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Almacén › Untables")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Editar la categoría Untables" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }), "Snacks");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect
    .element(dialog.getByText('Ya existe una categoría "Snacks" en Almacén.'))
    .toBeVisible();
});

test("shows the plain name-taken error on rename when the category stays top-level, and keeps the original name in the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [groceries, drinks],
  });
  vi.mocked(services.editCategory).mockResolvedValue({ kind: "name_taken" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Almacén")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Editar la categoría Almacén" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }), "bebidas");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Ya existe una categoría con este nombre.")).toBeVisible();
  await expect.element(screen.getByRole("cell", { name: "Almacén" })).toBeVisible();
});

test("shows a not-found notice on edit when the category no longer exists", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [groceries] });
  vi.mocked(services.editCategory).mockResolvedValue({ kind: "not_found" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Almacén")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Editar la categoría Almacén" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Esta categoría ya no existe");
});

test("a stale-version reload on edit discards the typed name and saves again over the refreshed version and parent", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [groceries, drinks],
  });
  vi.mocked(services.editCategory).mockResolvedValue({ kind: "stale_version" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Bebidas")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Editar la categoría Bebidas" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }),
    "Bebidas frías",
  );
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect
    .element(dialog.getByText("Esta categoría cambió mientras la editabas"))
    .toBeVisible();

  const freshened: CategorySummary = { ...drinks, parentId: "category-1", version: 4 };
  vi.mocked(services.fetchCategories).mockResolvedValueOnce({
    kind: "ok",
    value: [groceries, freshened],
  });
  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect
    .element(dialog.getByRole("button", { name: /Categoría superior/ }))
    .toHaveTextContent("Almacén");
  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }))
    .toHaveValue("Bebidas");

  vi.mocked(services.editCategory).mockResolvedValue({ kind: "ok", value: freshened });
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editCategory).mock.calls.length).toBe(2);
  expect(services.editCategory).toHaveBeenLastCalledWith("category-4", {
    name: "Bebidas",
    parentId: "category-1",
    version: 4,
  });
});

test("a stale-version reload on edit also retitles the dialog with the fresh name", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [groceries, drinks],
  });
  vi.mocked(services.editCategory).mockResolvedValue({ kind: "stale_version" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Bebidas")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Editar la categoría Bebidas" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect
    .element(dialog.getByText("Esta categoría cambió mientras la editabas"))
    .toBeVisible();

  const renamed: CategorySummary = { ...drinks, name: "Bebidas frías", version: 4 };
  vi.mocked(services.fetchCategories).mockResolvedValueOnce({
    kind: "ok",
    value: [groceries, renamed],
  });
  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect.element(dialog.getByRole("heading", { name: "Bebidas frías" })).toBeVisible();
});

test("a stale-version reload on edit refreshes the categories too, so a parent that only the fresh data has is offered and named", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [groceries, drinks],
  });
  vi.mocked(services.editCategory).mockResolvedValue({ kind: "stale_version" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Bebidas")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Editar la categoría Bebidas" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect
    .element(dialog.getByText("Esta categoría cambió mientras la editabas"))
    .toBeVisible();

  const freshProduce: CategorySummary = {
    id: "category-9",
    name: "Frescos",
    version: 1,
    parentId: null,
  };
  const freshened: CategorySummary = { ...drinks, parentId: freshProduce.id, version: 4 };
  vi.mocked(services.fetchCategories).mockResolvedValueOnce({
    kind: "ok",
    value: [groceries, freshened, freshProduce],
  });
  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect
    .element(dialog.getByRole("button", { name: /Categoría superior/ }))
    .toHaveTextContent("Frescos");
  await expect.element(screen.getByRole("cell", { name: "Frescos › Bebidas" })).toBeVisible();

  vi.mocked(services.editCategory).mockResolvedValue({ kind: "name_taken" });
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect
    .element(dialog.getByText('Ya existe una categoría "Bebidas" en Frescos.'))
    .toBeVisible();
});

test("has no accessibility violations once loaded, and with the create modal open", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [groceries] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 categoría")).toBeVisible();
  await expectNoAccessibilityViolations(document.body);

  await openNewCategoryModal(screen);
  await expectNoAccessibilityViolations(document.body);
});

test("opens with the search and ordering it is given", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [groceries, drinks, spreads, jams],
  });

  const screen = await renderScreen(services, () => {}, {
    filters: { search: "a", sort: "descending" },
  });

  await expect.element(screen.getByPlaceholder("Buscar una categoría")).toHaveValue("a");
  await expect.element(screen.getByText("4 categorías")).toBeVisible();
  const names = screen
    .getByRole("row")
    .all()
    .slice(1)
    .map((row) => row.element().textContent ?? "");
  expect(names[0]).toContain("Bebidas");
});

test("reports every change to its search and ordering, so they can be kept for a reload", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [groceries, drinks] });
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, () => {}, { onFiltersChange });
  await expect.element(screen.getByText("2 categorías")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Categoría" }));
  await userEvent.fill(screen.getByPlaceholder("Buscar una categoría"), "beb");

  expect(onFiltersChange).toHaveBeenLastCalledWith({ search: "beb", sort: "descending" });
});
