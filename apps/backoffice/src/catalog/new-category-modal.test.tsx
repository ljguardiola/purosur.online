import type { CategorySummary } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { createCategory } from "./categories-api";
import { NewCategoryModal } from "./new-category-modal";
import { groceries, spreads } from "./test-support/categories";

function renderModal({
  categories,
  create = vi.fn<typeof createCategory>(),
  onCreated = () => {},
}: {
  categories: CategorySummary[];
  create?: typeof createCategory;
  onCreated?: () => void;
}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <NewCategoryModal
          open
          onClose={() => {}}
          onCreated={onCreated}
          onSessionEnded={() => {}}
          createCategory={create}
          categories={categories}
        />
      </main>
    </FieldSizeProvider>,
  );
}

test("rejects a name longer than 100 characters, without calling the API", async () => {
  const create = vi.fn<typeof createCategory>();
  const screen = await renderModal({ categories: [], create });
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }),
    "a".repeat(101),
  );
  await userEvent.click(dialog.getByRole("button", { name: "Crear la categoría" }));

  await expect
    .element(dialog.getByText("El nombre puede tener hasta 100 caracteres."))
    .toBeVisible();
  expect(create).not.toHaveBeenCalled();
});

test("sends the typed name trimmed", async () => {
  const create = vi.fn<typeof createCategory>().mockResolvedValue({ kind: "ok" });
  const screen = await renderModal({ categories: [], create });
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }),
    "  Limpieza  ",
  );
  await userEvent.click(dialog.getByRole("button", { name: "Crear la categoría" }));

  await expect.poll(() => create.mock.calls.length).toBe(1);
  expect(create).toHaveBeenCalledWith({ name: "Limpieza", parentId: null });
});

test("requires a name before submitting, without calling the API", async () => {
  const create = vi.fn<typeof createCategory>();
  const screen = await renderModal({ categories: [], create });
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Crear la categoría" }));

  await expect.element(dialog.getByText("Ingresá el nombre de la categoría.")).toBeVisible();
  expect(create).not.toHaveBeenCalled();
});

test("opens with a parent select offering every category by its path label", async () => {
  const screen = await renderModal({ categories: [groceries, spreads] });
  const dialog = screen.getByRole("dialog");

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

test("creates a subcategory under the chosen parent", async () => {
  const create = vi.fn<typeof createCategory>().mockResolvedValue({ kind: "ok" });
  const onCreated = vi.fn();
  const screen = await renderModal({ categories: [groceries], create, onCreated });
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }), "Snacks");
  await userEvent.click(dialog.getByRole("button", { name: /Categoría superior/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await userEvent.click(dialog.getByRole("button", { name: "Crear la categoría" }));

  await expect.poll(() => create.mock.calls.length).toBe(1);
  expect(create).toHaveBeenCalledWith({
    name: "Snacks",
    parentId: "category-1",
  });
  await expect.poll(() => onCreated.mock.calls.length).toBe(1);
});

test("shows the parent-has-products error, naming the chosen parent", async () => {
  const create = vi.fn<typeof createCategory>().mockResolvedValue({ kind: "parent_has_products" });
  const screen = await renderModal({ categories: [groceries], create });
  const dialog = screen.getByRole("dialog");

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

test("shows the name-taken-under-parent error, naming the entered name and the parent", async () => {
  const create = vi.fn<typeof createCategory>().mockResolvedValue({ kind: "name_taken" });
  const screen = await renderModal({ categories: [groceries], create });
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }), "Snacks");
  await userEvent.click(dialog.getByRole("button", { name: /Categoría superior/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await userEvent.click(dialog.getByRole("button", { name: "Crear la categoría" }));

  await expect
    .element(dialog.getByText('Ya existe una categoría "Snacks" en Almacén.'))
    .toBeVisible();
});

test("shows the plain name-taken error when the category is top-level", async () => {
  const create = vi.fn<typeof createCategory>().mockResolvedValue({ kind: "name_taken" });
  const screen = await renderModal({ categories: [groceries], create });
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }), "Almacén");
  await userEvent.click(dialog.getByRole("button", { name: "Crear la categoría" }));

  await expect.element(dialog.getByText("Ya existe una categoría con este nombre.")).toBeVisible();
});

test("shows a field error under the parent select when the chosen parent has vanished", async () => {
  const create = vi.fn<typeof createCategory>().mockResolvedValue({
    kind: "validation_failed",
    field: "parentId",
  });
  const screen = await renderModal({ categories: [groceries], create });
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }), "Snacks");
  await userEvent.click(dialog.getByRole("button", { name: /Categoría superior/ }));
  await userEvent.click(dialog.getByRole("option", { name: "Almacén" }));
  await userEvent.click(dialog.getByRole("button", { name: "Crear la categoría" }));

  await expect
    .element(dialog.getByText("La categoría superior elegida ya no existe."))
    .toBeVisible();
});

test("asks to review the name when the cloud refuses a name that passes every local check", async () => {
  const create = vi.fn<typeof createCategory>().mockResolvedValue({
    kind: "validation_failed",
    field: "name",
  });
  const screen = await renderModal({ categories: [], create });
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }), "Snacks");
  await userEvent.click(dialog.getByRole("button", { name: "Crear la categoría" }));

  await expect.element(dialog.getByText("Revisá el nombre de la categoría.")).toBeVisible();
  expect(dialog.getByText("Ingresá el nombre de la categoría.").query()).toBeNull();
});

test("shows the generic failure notice when the cloud refuses a field the form does not have", async () => {
  const create = vi.fn<typeof createCategory>().mockResolvedValue({
    kind: "validation_failed",
    field: "version",
  });
  const screen = await renderModal({ categories: [], create });
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre de la categoría/ }), "Snacks");
  await userEvent.click(dialog.getByRole("button", { name: "Crear la categoría" }));

  await expect.element(dialog.getByText("No se pudo crear la categoría")).toBeVisible();
  expect(dialog.getByText("Ingresá el nombre de la categoría.").query()).toBeNull();
});
