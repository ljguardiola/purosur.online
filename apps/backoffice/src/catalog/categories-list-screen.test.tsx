import type { CategorySummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { CategoriesListScreen } from "./categories-list-screen";
import type { CategoriesListScreenServices } from "./categories-list-services";
import { type CategoriesListFilters, categoriesListFilters } from "./routes";
import { drinks, groceries, jams, spreads } from "./test-support/categories";

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

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function screenElement(
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
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <CategoriesListScreen
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
  await expect.element(screen.getByText("0 categorías")).not.toBeInTheDocument();
});

test("shows a filtered empty state when the search matches nothing", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [groceries] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Almacén")).toBeVisible();

  await userEvent.fill(screen.getByPlaceholder("Buscar una categoría"), "zzz");

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
  await expect.element(screen.getByText("0 categorías")).not.toBeInTheDocument();
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

test("retrying a failed load starts again from the loading placeholder", async () => {
  const services = createServices();
  const retry = deferred<Awaited<ReturnType<typeof services.fetchCategories>>>();
  vi.mocked(services.fetchCategories)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir las categorías")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("No pudimos abrir las categorías")).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("table", { name: "Categorías" }))
    .toHaveAttribute("aria-busy", "true");
  retry.resolve({ kind: "ok", value: [groceries] });
  await expect.element(screen.getByText("Almacén")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait and a retry action", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
});

test("navigates to Mi cuenta when the categories request comes back forbidden", async () => {
  window.history.pushState(null, "", "/categories");
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
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

test("the create action is disabled while the categories load, and after they fail to load", async () => {
  const services = createServices();
  const firstLoad = deferred<Awaited<ReturnType<typeof services.fetchCategories>>>();
  vi.mocked(services.fetchCategories)
    .mockReturnValueOnce(firstLoad.promise)
    .mockResolvedValueOnce({ kind: "failed" });
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: "Nueva categoría" })).toBeDisabled();

  firstLoad.resolve({ kind: "failed" });
  await expect.element(screen.getByText("No pudimos abrir las categorías")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Nueva categoría" })).toBeDisabled();
});

test("the create action stays available while a refresh of the shown categories runs", async () => {
  const services = createServices();
  const refresh = deferred<Awaited<ReturnType<typeof services.fetchCategories>>>();
  vi.mocked(services.fetchCategories)
    .mockResolvedValueOnce({ kind: "ok", value: [groceries] })
    .mockReturnValueOnce(refresh.promise);
  vi.mocked(services.editCategory).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Almacén")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Editar la categoría Almacén" }));
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Guardar los cambios" }),
  );

  await expect
    .element(screen.getByRole("table", { name: "Categorías" }))
    .toHaveAttribute("aria-busy", "true");
  expect(screen.getByText("Almacén").query()).not.toBeNull();
  await expect.element(screen.getByRole("button", { name: "Nueva categoría" })).toBeEnabled();
  refresh.resolve({ kind: "ok", value: [groceries] });
});

test("creates a top-level category and shows it in the list", async () => {
  const services = createServices();
  const newCategory: CategorySummary = {
    id: "category-5",
    name: "Limpieza",
    version: 1,
    parentId: null,
  };
  vi.mocked(services.fetchCategories)
    .mockResolvedValueOnce({ kind: "ok", value: [groceries] })
    .mockResolvedValueOnce({ kind: "ok", value: [groceries, newCategory, drinks] });
  vi.mocked(services.createCategory).mockResolvedValue({ kind: "ok" });
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
  await expect.element(screen.getByText("3 categorías")).toBeVisible();
  expect(services.fetchCategories).toHaveBeenCalledTimes(2);
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

test("moves a category to a new parent and shows its updated path in the list", async () => {
  const services = createServices();
  const moved: CategorySummary = { ...drinks, parentId: "category-1", version: 4 };
  vi.mocked(services.fetchCategories)
    .mockResolvedValueOnce({ kind: "ok", value: [groceries, drinks] })
    .mockResolvedValueOnce({ kind: "ok", value: [groceries, moved] });
  vi.mocked(services.editCategory).mockResolvedValue({ kind: "ok" });
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

test("a stale-version reload on edit reads the categories once, and refills the form from that read", async () => {
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
  vi.mocked(services.fetchCategories).mockClear();
  vi.mocked(services.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [groceries, renamed],
  });

  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }))
    .toHaveValue("Bebidas frías");
  expect(services.fetchCategories).toHaveBeenCalledTimes(1);
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
  vi.mocked(services.fetchCategories).mockResolvedValue({
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

test("a stale-version reload whose read fails closes the edit modal for the list's failure, and a retry leaves it closed", async () => {
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
  vi.mocked(services.fetchCategories).mockResolvedValueOnce({ kind: "failed" });

  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect.element(screen.getByText("No pudimos abrir las categorías")).toBeVisible();
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  await expect.element(screen.getByRole("cell", { name: "Bebidas" })).toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
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

test("does not report its filters again when the route hands it a new callback", async () => {
  const services = createServices();
  vi.mocked(services.fetchCategories).mockResolvedValue({ kind: "ok", value: [groceries, drinks] });
  const onFiltersChange = vi.fn();
  const filters = categoriesListFilters.parse({});
  const screen = await renderScreen(services, () => {}, { filters, onFiltersChange });
  await expect.element(screen.getByText("2 categorías")).toBeVisible();
  await userEvent.fill(screen.getByPlaceholder("Buscar una categoría"), "beb");
  await expect.poll(() => onFiltersChange.mock.calls.length).toBeGreaterThan(0);
  const reported = onFiltersChange.mock.calls.length;

  await screen.rerender(
    screenElement(services, () => {}, {
      filters,
      onFiltersChange: (reported) => onFiltersChange(reported),
    }),
  );

  expect(onFiltersChange).toHaveBeenCalledTimes(reported);
});
