import type { CategorySummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { CategoryReload } from "./catalog-queries";
import type { editCategory } from "./categories-api";
import { EditCategoryModal } from "./edit-category-modal";
import { drinks, groceries, jams, spreads } from "./test-support/categories";

function renderModal({
  target,
  categories,
  edit = vi.fn<typeof editCategory>(),
  reload = vi.fn<(id: string) => Promise<CategoryReload>>(),
  onSaved = () => {},
}: {
  target: CategorySummary;
  categories: CategorySummary[];
  edit?: typeof editCategory;
  reload?: (id: string) => Promise<CategoryReload>;
  onSaved?: () => void;
}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <EditCategoryModal
          target={target}
          onClose={() => {}}
          onSaved={onSaved}
          onSessionEnded={() => {}}
          reload={reload}
          editCategory={edit}
          categories={categories}
        />
      </main>
    </FieldSizeProvider>,
  );
}

test("preselects Ninguna for a top-level category", async () => {
  const screen = await renderModal({ target: groceries, categories: [groceries] });
  const dialog = screen.getByRole("dialog");

  await expect
    .element(dialog.getByRole("button", { name: /Categoría superior/ }))
    .toHaveTextContent("Ninguna (categoría de primer nivel)");
});

test("the parent select excludes the category itself and its own descendants", async () => {
  const screen = await renderModal({
    target: spreads,
    categories: [groceries, spreads, jams, drinks],
  });
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: /Categoría superior/ }));

  await expect.element(dialog.getByRole("option", { name: "Almacén" })).toBeVisible();
  await expect.element(dialog.getByRole("option", { name: "Bebidas" })).toBeVisible();
  expect(dialog.getByRole("option", { name: "Almacén › Untables" }).query()).toBeNull();
  expect(
    dialog.getByRole("option", { name: "Almacén › Untables › Mermeladas" }).query(),
  ).toBeNull();
});

test("rejects a name longer than 100 characters, without calling the API", async () => {
  const edit = vi.fn<typeof editCategory>();
  const screen = await renderModal({ target: groceries, categories: [groceries], edit });
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }),
    "a".repeat(101),
  );
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect
    .element(dialog.getByText("El nombre puede tener hasta 100 caracteres."))
    .toBeVisible();
  expect(edit).not.toHaveBeenCalled();
});

test("sends the typed name trimmed", async () => {
  const edit = vi.fn<typeof editCategory>().mockResolvedValue({ kind: "ok" });
  const screen = await renderModal({ target: groceries, categories: [groceries], edit });
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }),
    "  Despensa  ",
  );
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => edit.mock.calls.length).toBe(1);
  expect(edit).toHaveBeenCalledWith("category-1", {
    name: "Despensa",
    parentId: null,
    version: 1,
  });
});

test("shows the parent-has-products error, naming the chosen parent", async () => {
  const edit = vi.fn<typeof editCategory>().mockResolvedValue({ kind: "parent_has_products" });
  const screen = await renderModal({ target: drinks, categories: [groceries, drinks], edit });
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

test("shows the move-not-allowed error, naming the category and the chosen destination", async () => {
  const edit = vi.fn<typeof editCategory>().mockResolvedValue({ kind: "move_not_allowed" });
  const screen = await renderModal({ target: drinks, categories: [groceries, drinks], edit });
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
  const edit = vi.fn<typeof editCategory>().mockResolvedValue({ kind: "name_taken" });
  const screen = await renderModal({ target: spreads, categories: [groceries, spreads], edit });
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }), "Snacks");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect
    .element(dialog.getByText('Ya existe una categoría "Snacks" en Almacén.'))
    .toBeVisible();
});

test("shows the plain name-taken error on rename when the category stays top-level, without reporting it saved", async () => {
  const edit = vi.fn<typeof editCategory>().mockResolvedValue({ kind: "name_taken" });
  const onSaved = vi.fn();
  const screen = await renderModal({
    target: groceries,
    categories: [groceries, drinks],
    edit,
    onSaved,
  });
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }), "bebidas");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Ya existe una categoría con este nombre.")).toBeVisible();
  expect(onSaved).not.toHaveBeenCalled();
});

test("shows the generic failure notice when the cloud refuses the version, leaving the name untouched", async () => {
  const edit = vi.fn<typeof editCategory>().mockResolvedValue({
    kind: "validation_failed",
    field: "version",
  });
  const screen = await renderModal({ target: groceries, categories: [groceries], edit });
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("No se pudo guardar el cambio")).toBeVisible();
  expect(dialog.getByText("Ingresá el nombre de la categoría.").query()).toBeNull();
  expect(dialog.getByText("Revisá el nombre de la categoría.").query()).toBeNull();
});

test("asks to review the name when the cloud refuses a name that passes every local check", async () => {
  const edit = vi.fn<typeof editCategory>().mockResolvedValue({
    kind: "validation_failed",
    field: "name",
  });
  const screen = await renderModal({ target: groceries, categories: [groceries], edit });
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Revisá el nombre de la categoría.")).toBeVisible();
});

test("shows a not-found notice when the category no longer exists", async () => {
  const edit = vi.fn<typeof editCategory>().mockResolvedValue({ kind: "not_found" });
  const screen = await renderModal({ target: groceries, categories: [groceries], edit });
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByRole("alert")).toHaveTextContent("Esta categoría ya no existe");
});

test("a stale-version reload discards the typed name and saves again over the refreshed version and parent", async () => {
  const edit = vi.fn<typeof editCategory>().mockResolvedValue({ kind: "stale_version" });
  const freshened: CategorySummary = { ...drinks, parentId: "category-1", version: 4 };
  const reload = vi
    .fn<(id: string) => Promise<CategoryReload>>()
    .mockResolvedValue({ kind: "found", category: freshened });
  const screen = await renderModal({
    target: drinks,
    categories: [groceries, drinks],
    edit,
    reload,
  });
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }),
    "Bebidas frías",
  );
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect
    .element(dialog.getByText("Esta categoría cambió mientras la editabas"))
    .toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  expect(reload).toHaveBeenCalledWith("category-4");
  await expect
    .element(dialog.getByRole("button", { name: /Categoría superior/ }))
    .toHaveTextContent("Almacén");
  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }))
    .toHaveValue("Bebidas");

  edit.mockResolvedValue({ kind: "ok" });
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => edit.mock.calls.length).toBe(2);
  expect(edit).toHaveBeenLastCalledWith("category-4", {
    name: "Bebidas",
    parentId: "category-1",
    version: 4,
  });
});

test("a stale-version reload also retitles the dialog with the fresh name", async () => {
  const edit = vi.fn<typeof editCategory>().mockResolvedValue({ kind: "stale_version" });
  const renamed: CategorySummary = { ...drinks, name: "Bebidas frías", version: 4 };
  const reload = vi
    .fn<(id: string) => Promise<CategoryReload>>()
    .mockResolvedValue({ kind: "found", category: renamed });
  const screen = await renderModal({
    target: drinks,
    categories: [groceries, drinks],
    edit,
    reload,
  });
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect
    .element(dialog.getByText("Esta categoría cambió mientras la editabas"))
    .toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect.element(dialog.getByRole("heading", { name: "Bebidas frías" })).toBeVisible();
});
