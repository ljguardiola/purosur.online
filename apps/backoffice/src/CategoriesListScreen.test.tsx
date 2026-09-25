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

const semillas: CategorySummary = { id: "category-1", name: "Semillas", version: 1 };
const bebidas: CategorySummary = { id: "category-2", name: "Bebidas", version: 3 };

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

test("shows the breadcrumb, heading, each category's name and the category count", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [semillas, bebidas],
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Catálogo")).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Categorías", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Semillas")).toBeVisible();
  await expect.element(screen.getByText("Bebidas")).toBeVisible();
  await expect.element(screen.getByText("2 categorías")).toBeVisible();
});

test("lists categories sorted by name, and the header toggles the order", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [semillas, bebidas],
  });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 categorías")).toBeVisible();

  function rowNames(): string[] {
    return screen
      .getByRole("row")
      .all()
      .slice(1)
      .map((row) => row.element().textContent ?? "");
  }

  expect(rowNames().join("|")).toContain("Bebidas");
  expect(rowNames()[0]).toContain("Bebidas");

  await userEvent.click(screen.getByRole("button", { name: "Categoría" }));

  expect(rowNames()[0]).toContain("Semillas");
});

test("the search field filters the list by name, case-insensitively", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [semillas, bebidas],
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 categorías")).toBeVisible();

  await userEvent.fill(screen.getByPlaceholder("Buscar una categoría"), "semi");

  await expect.element(screen.getByText("Semillas")).toBeVisible();
  expect(screen.getByText("Bebidas").query()).toBeNull();
});

test("the category count in the footer counts only the categories the search leaves", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [semillas, bebidas],
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 categorías")).toBeVisible();

  await userEvent.fill(screen.getByPlaceholder("Buscar una categoría"), "semi");

  await expect.element(screen.getByText("1 categoría")).toBeVisible();
  expect(screen.getByText("2 categorías").query()).toBeNull();
});

test("shows an empty state when there are no categories yet", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Todavía no hay categorías")).toBeVisible();
});

test("shows a filtered empty state when the search matches nothing", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [semillas] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Semillas")).toBeVisible();

  await userEvent.fill(screen.getByPlaceholder("Buscar una categoría"), "zzz");

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
});

test("shows a load error with a retry action when the categories fail to load", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValueOnce({ kind: "failed" });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir las categorías")).toBeVisible();

  vi.mocked(services.fetchCategories).mockResolvedValueOnce({ kind: "ok", value: [semillas] });
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

async function openNewCategoryModal(screen: Awaited<ReturnType<typeof renderScreen>>) {
  await userEvent.click(screen.getByRole("button", { name: "Nueva categoría" }));
  return screen.getByRole("dialog");
}

test("opens the create modal, and cancel closes it without calling the API", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [semillas] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 categoría")).toBeVisible();

  const dialog = await openNewCategoryModal(screen);

  await expect.element(dialog.getByRole("heading", { name: "Nueva categoría" })).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.createCategory).not.toHaveBeenCalled();
});

test("creates a category and shows it in the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [semillas] });
  const nueva: CategorySummary = { id: "category-3", name: "Limpieza", version: 1 };
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
  expect(services.createCategory).toHaveBeenCalledWith({ name: "Limpieza" });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Limpieza")).toBeVisible();
  await expect.element(screen.getByText("2 categorías")).toBeVisible();
});

test("shows a category created while the list is still loading, even once the earlier load finishes", async () => {
  const services = createServices();
  const nueva: CategorySummary = { id: "category-3", name: "Limpieza", version: 1 };
  let finishFirstLoad: (outcome: Awaited<ReturnType<typeof services.fetchCategories>>) => void =
    () => {};
  vi.mocked(services.fetchCategories)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finishFirstLoad = resolve;
      }),
    )
    .mockResolvedValueOnce({ kind: "ok", value: [semillas, nueva] });
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

  finishFirstLoad({ kind: "ok", value: [semillas] });
  // Let the earlier load's result settle before checking it did not replace the newer list.
  await new Promise((resolve) => setTimeout(resolve, 50));

  expect(screen.getByText("2 categorías").query()).not.toBeNull();
  expect(screen.getByText("Limpieza").query()).not.toBeNull();
});

test("shows a category created while the list failed to load", async () => {
  const services = createServices();
  const nueva: CategorySummary = { id: "category-3", name: "Limpieza", version: 1 };
  vi.mocked(services.fetchCategories)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({ kind: "ok", value: [semillas, nueva] });
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

test("shows the name-taken error on create and does not add the category to the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [semillas] });
  vi.mocked(services.createCategory).mockResolvedValue({ kind: "name_taken" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 categoría")).toBeVisible();
  const dialog = await openNewCategoryModal(screen);

  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }),
    "semillas",
  );
  await userEvent.click(dialog.getByRole("button", { name: "Crear la categoría" }));

  await expect.element(dialog.getByText("Ya existe una categoría con este nombre.")).toBeVisible();
  await expect.element(screen.getByRole("dialog")).toBeVisible();
  await expect.element(screen.getByText("1 categoría")).toBeVisible();
});

test("the row action opens the edit modal pre-filled with the category's current name", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [semillas] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Semillas")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Editar la categoría Semillas" }));

  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Semillas" })).toBeVisible();
  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }))
    .toHaveValue("Semillas");
});

test("renames a category and shows the new name in the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [semillas] });
  const renamed: CategorySummary = { id: "category-1", name: "Semillas y granos", version: 2 };
  vi.mocked(services.editCategory).mockResolvedValue({ kind: "ok", value: renamed });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Semillas")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Editar la categoría Semillas" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }),
    "Semillas y granos",
  );
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editCategory).mock.calls.length).toBe(1);
  expect(services.editCategory).toHaveBeenCalledWith("category-1", {
    name: "Semillas y granos",
    version: 1,
  });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Semillas y granos")).toBeVisible();
});

test("rejects a name longer than 100 characters in the edit modal, without calling the API", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [semillas] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Semillas")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Editar la categoría Semillas" }));
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

test("shows the name-taken error on rename and keeps the original name in the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [semillas, bebidas],
  });
  vi.mocked(services.editCategory).mockResolvedValue({ kind: "name_taken" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Semillas")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Editar la categoría Semillas" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }), "bebidas");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Ya existe una categoría con este nombre.")).toBeVisible();
  await expect.element(screen.getByRole("cell", { name: "Semillas" })).toBeVisible();
});

test("shows a stale-version notice on rename, and Recargar refreshes the category before saving again", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [semillas] });
  vi.mocked(services.editCategory).mockResolvedValue({ kind: "stale_version" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Semillas")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Editar la categoría Semillas" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }),
    "Semillas y granos",
  );
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect
    .element(dialog.getByText("Esta categoría cambió mientras la editabas"))
    .toBeVisible();

  const freshened: CategorySummary = { id: "category-1", name: "Semillas", version: 2 };
  vi.mocked(services.fetchCategories).mockResolvedValueOnce({ kind: "ok", value: [freshened] });
  vi.mocked(services.editCategory).mockResolvedValueOnce({
    kind: "ok",
    value: { id: "category-1", name: "Semillas y granos", version: 3 },
  });
  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));
  // Reloading refreshes the version from the freshened category, the same way it discards a
  // stale in-progress edit for roles and users: the name has to be typed again.
  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }))
    .toHaveValue("Semillas");
  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }),
    "Semillas y granos",
  );
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  expect(services.editCategory).toHaveBeenLastCalledWith("category-1", {
    name: "Semillas y granos",
    version: 2,
  });
});

test("has no accessibility violations once loaded, and with the create modal open", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [semillas] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 categoría")).toBeVisible();
  await expectNoAccessibilityViolations(document.body);

  await openNewCategoryModal(screen);
  await expectNoAccessibilityViolations(document.body);
});
