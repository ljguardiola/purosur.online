import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import { CategoriesListScreen, type CategoriesListScreenServices } from "./CategoriesListScreen";
import type { CategorySummary } from "./categoriesApi";

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

const almacen: CategorySummary = { id: "category-1", name: "Almacén", version: 1, parentId: null };
const untables: CategorySummary = {
  id: "category-2",
  name: "Untables",
  version: 1,
  parentId: "category-1",
};
const mermeladas: CategorySummary = {
  id: "category-3",
  name: "Mermeladas",
  version: 1,
  parentId: "category-2",
};
const bebidas: CategorySummary = { id: "category-4", name: "Bebidas", version: 3, parentId: null };

function renderScreen(
  services: CategoriesListScreenServices,
  onSessionEnded: () => void = () => {},
) {
  return render(
    <main>
      <CategoriesListScreen services={services} onSessionEnded={onSessionEnded} />
    </main>,
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
    value: [almacen, untables, bebidas],
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
    value: [bebidas, mermeladas, almacen, untables],
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
    value: [almacen, bebidas, untables, mermeladas],
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

  const names = rowNames();
  expect(names[0]).toContain("Bebidas");
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
    value: [almacen, untables, bebidas],
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("3 categorías")).toBeVisible();

  await userEvent.fill(screen.getByPlaceholder("Buscar una categoría"), "untables");

  await expect.element(screen.getByText("Almacén › Untables")).toBeVisible();
  expect(screen.getByText("Bebidas").query()).toBeNull();
});

test("the category count in the footer counts only the categories the search leaves", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [almacen, untables, bebidas],
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
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [almacen] });
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

  vi.mocked(services.fetchCategories).mockResolvedValueOnce({ kind: "ok", value: [almacen] });
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
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [almacen] });
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
  const nueva: CategorySummary = {
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
    .mockResolvedValueOnce({ kind: "ok", value: [almacen, nueva] });
  vi.mocked(services.createCategory).mockResolvedValue({ kind: "ok", value: nueva });
  const screen = await renderScreen(services);
  const dialog = await openNewCategoryModal(screen);

  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }),
    "Limpieza",
  );
  await userEvent.click(dialog.getByRole("button", { name: "Crear la categoría" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Limpieza")).toBeVisible();

  finishFirstLoad({ kind: "ok", value: [almacen] });
  // The screen awaited this same promise first, so once it settles here the screen has already
  // handled the earlier result; re-rendering then commits any update that handling scheduled.
  await firstLoad;
  await screen.rerender(
    <main>
      <CategoriesListScreen services={services} onSessionEnded={() => {}} />
    </main>,
  );

  expect(screen.getByText("2 categorías").query()).not.toBeNull();
  expect(screen.getByText("Limpieza").query()).not.toBeNull();
});

test("shows a category created while the list failed to load", async () => {
  const services = createServices();
  const nueva: CategorySummary = {
    id: "category-5",
    name: "Limpieza",
    version: 1,
    parentId: null,
  };
  vi.mocked(services.fetchCategories)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: [almacen, nueva] });
  vi.mocked(services.createCategory).mockResolvedValue({ kind: "ok", value: nueva });
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

test("sends a name of exactly 100 characters, once trimmed, from the create modal", async () => {
  const services = createServices();
  const longest = "a".repeat(100);
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.createCategory).mockResolvedValue({
    kind: "ok",
    value: { id: "category-5", name: longest, version: 1, parentId: null },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Todavía no hay categorías")).toBeVisible();
  const dialog = await openNewCategoryModal(screen);

  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }),
    `  ${longest}  `,
  );
  await userEvent.click(dialog.getByRole("button", { name: "Crear la categoría" }));

  await expect.poll(() => vi.mocked(services.createCategory).mock.calls.length).toBe(1);
  expect(services.createCategory).toHaveBeenCalledWith({ name: longest, parentId: null });
});

test("counts each emoji as one character toward the create modal's 100-character limit", async () => {
  const services = createServices();
  const longest = "🌱".repeat(100);
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.createCategory).mockResolvedValue({
    kind: "ok",
    value: { id: "category-5", name: longest, version: 1, parentId: null },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Todavía no hay categorías")).toBeVisible();
  const dialog = await openNewCategoryModal(screen);
  const nameField = dialog.getByRole("textbox", { name: /^Nombre de la categoría/ });
  const submit = dialog.getByRole("button", { name: "Crear la categoría" });

  await userEvent.fill(nameField, `${longest}🌱`);
  await userEvent.click(submit);
  await expect
    .element(dialog.getByText("El nombre puede tener hasta 100 caracteres."))
    .toBeVisible();
  expect(services.createCategory).not.toHaveBeenCalled();

  await userEvent.fill(nameField, longest);
  await userEvent.click(submit);
  await expect.poll(() => vi.mocked(services.createCategory).mock.calls.length).toBe(1);
  expect(services.createCategory).toHaveBeenCalledWith({ name: longest, parentId: null });
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
    value: [almacen, untables],
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
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [almacen] });
  const nueva: CategorySummary = {
    id: "category-5",
    name: "Limpieza",
    version: 1,
    parentId: null,
  };
  vi.mocked(services.createCategory).mockResolvedValue({ kind: "ok", value: nueva });
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
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [almacen] });
  const nueva: CategorySummary = {
    id: "category-5",
    name: "Snacks",
    version: 1,
    parentId: "category-1",
  };
  vi.mocked(services.createCategory).mockResolvedValue({ kind: "ok", value: nueva });
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
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [almacen] });
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
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [almacen] });
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
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [almacen] });
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
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [almacen] });
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
    value: [almacen, untables],
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
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [almacen] });
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
    value: [almacen, untables, mermeladas, bebidas],
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
    value: [almacen, bebidas],
  });
  const moved: CategorySummary = { ...bebidas, parentId: "category-1", version: 4 };
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
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [almacen] });
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

test("sends a name of exactly 100 characters, once trimmed, from the edit modal", async () => {
  const services = createServices();
  const longest = "a".repeat(100);
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [almacen] });
  vi.mocked(services.editCategory).mockResolvedValue({
    kind: "ok",
    value: { ...almacen, name: longest, version: 2 },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Almacén")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Editar la categoría Almacén" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }),
    `  ${longest}  `,
  );
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editCategory).mock.calls.length).toBe(1);
  expect(services.editCategory).toHaveBeenCalledWith("category-1", {
    name: longest,
    parentId: null,
    version: 1,
  });
});

test("counts each emoji as one character toward the edit modal's 100-character limit", async () => {
  const services = createServices();
  const longest = "🌱".repeat(100);
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [almacen] });
  vi.mocked(services.editCategory).mockResolvedValue({
    kind: "ok",
    value: { ...almacen, name: longest, version: 2 },
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Almacén")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Editar la categoría Almacén" }));
  const dialog = screen.getByRole("dialog");
  const nameField = dialog.getByRole("textbox", { name: /^Nombre de la categoría/ });
  const submit = dialog.getByRole("button", { name: "Guardar los cambios" });

  await userEvent.fill(nameField, `${longest}🌱`);
  await userEvent.click(submit);
  await expect
    .element(dialog.getByText("El nombre puede tener hasta 100 caracteres."))
    .toBeVisible();
  expect(services.editCategory).not.toHaveBeenCalled();

  await userEvent.fill(nameField, longest);
  await userEvent.click(submit);
  await expect.poll(() => vi.mocked(services.editCategory).mock.calls.length).toBe(1);
  expect(services.editCategory).toHaveBeenCalledWith("category-1", {
    name: longest,
    parentId: null,
    version: 1,
  });
});

test("shows the parent-has-products error on edit, naming the chosen parent", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [almacen, bebidas],
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
    value: [almacen, bebidas],
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
    value: [almacen, untables],
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
    value: [almacen, bebidas],
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
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [almacen] });
  vi.mocked(services.editCategory).mockResolvedValue({ kind: "not_found" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Almacén")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Editar la categoría Almacén" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Esta categoría ya no existe");
});

test("a stale-version reload on edit also refreshes the preselected parent", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [almacen, bebidas],
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

  const freshened: CategorySummary = { ...bebidas, parentId: "category-1", version: 4 };
  vi.mocked(services.fetchCategories).mockResolvedValueOnce({
    kind: "ok",
    value: [almacen, freshened],
  });
  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect
    .element(dialog.getByRole("button", { name: /Categoría superior/ }))
    .toHaveTextContent("Almacén");
});

test("a stale-version reload on edit also retitles the dialog with the fresh name", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [almacen, bebidas],
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

  const renamed: CategorySummary = { ...bebidas, name: "Bebidas frías", version: 4 };
  vi.mocked(services.fetchCategories).mockResolvedValueOnce({
    kind: "ok",
    value: [almacen, renamed],
  });
  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect.element(dialog.getByRole("heading", { name: "Bebidas frías" })).toBeVisible();
});

test("a stale-version reload on edit refreshes the categories too, so a parent that only the fresh data has is offered and named", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [almacen, bebidas],
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

  const frescos: CategorySummary = {
    id: "category-9",
    name: "Frescos",
    version: 1,
    parentId: null,
  };
  const freshened: CategorySummary = { ...bebidas, parentId: frescos.id, version: 4 };
  vi.mocked(services.fetchCategories).mockResolvedValueOnce({
    kind: "ok",
    value: [almacen, freshened, frescos],
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
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [almacen] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 categoría")).toBeVisible();
  await expectNoAccessibilityViolations(document.body);

  await openNewCategoryModal(screen);
  await expectNoAccessibilityViolations(document.body);
});
