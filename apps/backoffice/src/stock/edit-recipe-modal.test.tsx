import type { RecipeSummary } from "@purosur/contracts";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { EditRecipeModalServices } from "./edit-recipe-modal";
import type { fetchRecipes } from "./recipes-api";
import {
  type EditRecipeModalScreen,
  renderEditRecipeModal,
} from "./test-support/edit-recipe-modal";
import {
  almendras,
  cajaDeInfusiones,
  mani,
  miel,
  mixDeFrutosSecos,
  nueces,
  recipeList,
  recipeProducts,
  teVerde,
} from "./test-support/recipes";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

async function save(screen: EditRecipeModalScreen) {
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar la receta" }));
  return dialog;
}

test("shows the product's name as the title, with its components and quantities and no product field", async () => {
  const screen = await renderEditRecipeModal();
  const dialog = screen.getByRole("dialog");

  await expect.element(dialog.getByText("Productos · Armados")).toBeVisible();
  await expect.element(dialog.getByRole("heading", { name: "Mix de frutos secos" })).toBeVisible();
  await expect.element(dialog.getByText("Componentes por kg de producto terminado")).toBeVisible();
  await expect
    .element(dialog.getByRole("textbox", { name: "Cantidad de Almendras" }))
    .toHaveValue("0,400");
  await expect
    .element(dialog.getByRole("textbox", { name: "Cantidad de Pasas" }))
    .toHaveValue("0,100");
  expect(dialog.getByRole("combobox", { name: /^Producto armado/ }).query()).toBeNull();
  await expect.element(dialog.getByRole("button", { name: "Guardar la receta" })).toBeVisible();
});

test("shows the components of a unit product in units", async () => {
  const screen = await renderEditRecipeModal({ target: cajaDeInfusiones });
  const dialog = screen.getByRole("dialog");

  await expect
    .element(dialog.getByText("Componentes por unidad de producto terminado"))
    .toBeVisible();
  await expect
    .element(dialog.getByRole("textbox", { name: "Cantidad de Té verde" }))
    .toHaveValue("2");
});

test("saves the changed recipe with the version it was opened at", async () => {
  const saved: RecipeSummary = { ...mixDeFrutosSecos, version: 3 };
  const saveRecipe = vi
    .fn<EditRecipeModalServices["saveRecipe"]>()
    .mockResolvedValue({ kind: "ok", recipe: saved });
  const onSaved = vi.fn();
  const screen = await renderEditRecipeModal({ saveRecipe, onSaved });
  const dialog = screen.getByRole("dialog");

  await userEvent.fill(dialog.getByRole("textbox", { name: "Cantidad de Almendras" }), "0,5");
  await userEvent.click(dialog.getByRole("button", { name: "Quitar Pasas" }));
  await userEvent.click(dialog.getByRole("button", { name: "Quitar Maní" }));
  await save(screen);

  expect(saveRecipe).toHaveBeenCalledWith(mixDeFrutosSecos.productId, {
    components: [
      { componentProductId: almendras.id, quantityPerOutputUnit: 500 },
      { componentProductId: nueces.id, quantityPerOutputUnit: 300 },
    ],
    version: 2,
  });
  await expect.poll(() => onSaved.mock.calls).toEqual([[saved]]);
});

test("adds a component the recipe does not have yet", async () => {
  const saveRecipe = vi
    .fn<EditRecipeModalServices["saveRecipe"]>()
    .mockResolvedValue({ kind: "ok", recipe: cajaDeInfusiones });
  const screen = await renderEditRecipeModal({ saveRecipe, target: cajaDeInfusiones });
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Agregar un componente" }));
  await userEvent.click(dialog.getByRole("combobox", { name: /^Componente/ }));
  await expect.element(screen.getByRole("option", { name: "Maní" })).toBeVisible();
  expect(screen.getByRole("option", { name: "Té verde" }).query()).toBeNull();
  expect(screen.getByRole("option", { name: "Caja de infusiones" }).query()).toBeNull();
  (screen.getByRole("option", { name: "Maní" }).element() as HTMLElement).click();
  await userEvent.fill(dialog.getByRole("textbox", { name: "Cantidad de Maní" }), "1");
  await save(screen);

  expect(saveRecipe).toHaveBeenCalledWith(cajaDeInfusiones.productId, {
    components: [
      { componentProductId: teVerde.id, quantityPerOutputUnit: 2000 },
      { componentProductId: miel.id, quantityPerOutputUnit: 1000 },
      { componentProductId: mani.id, quantityPerOutputUnit: 1000 },
    ],
    version: 1,
  });
});

test("keeps showing a component that is no longer among the products on offer, and can remove it", async () => {
  const products = recipeProducts.filter((product) => product.id !== almendras.id);
  const screen = await renderEditRecipeModal({ products });
  const dialog = screen.getByRole("dialog");

  await expect
    .element(dialog.getByRole("textbox", { name: "Cantidad de Almendras" }))
    .toBeVisible();
  await userEvent.click(dialog.getByRole("button", { name: "Quitar Almendras" }));

  expect(dialog.getByRole("textbox", { name: "Cantidad de Almendras" }).query()).toBeNull();
});

test("shows the refusal of a recipe left without components under the components", async () => {
  const saveRecipe = vi.fn<EditRecipeModalServices["saveRecipe"]>().mockResolvedValue({
    kind: "invalid_recipe",
    reason: { kind: "no_components" },
  });
  const screen = await renderEditRecipeModal({
    saveRecipe,
    target: { ...cajaDeInfusiones, components: [] },
  });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("Agregá al menos un componente.")).toBeVisible();
});

test("refuses an unreadable quantity, saying how to type it", async () => {
  const saveRecipe = vi.fn<EditRecipeModalServices["saveRecipe"]>();
  const screen = await renderEditRecipeModal({ saveRecipe });
  const dialog = screen.getByRole("dialog");
  const quantity = dialog.getByRole("textbox", { name: "Cantidad de Almendras" });
  await userEvent.clear(quantity);
  await userEvent.type(quantity, "5,");

  await save(screen);

  await expect
    .element(
      dialog.getByText("Almendras: escribí los kilos con hasta 3 decimales, por ejemplo 12,150."),
    )
    .toBeVisible();
  expect(saveRecipe).not.toHaveBeenCalled();
});

test("tells that someone else changed the recipe and to open it again", async () => {
  const saveRecipe = vi
    .fn<EditRecipeModalServices["saveRecipe"]>()
    .mockResolvedValue({ kind: "stale_version" });
  const screen = await renderEditRecipeModal({ saveRecipe });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("Otra persona cambió esta receta")).toBeVisible();
  await expect
    .element(dialog.getByText("Cerrá esta ventana y volvé a abrirla para ver cómo quedó."))
    .toBeVisible();
});

test("reads the recipes again when someone else changed the recipe", async () => {
  const readRecipes = vi
    .fn<typeof fetchRecipes>()
    .mockResolvedValue({ kind: "ok", value: recipeList([mixDeFrutosSecos]) });
  const saveRecipe = vi
    .fn<EditRecipeModalServices["saveRecipe"]>()
    .mockResolvedValue({ kind: "stale_version" });
  const screen = await renderEditRecipeModal({ saveRecipe, readRecipes });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("Otra persona cambió esta receta")).toBeVisible();
  await expect.poll(() => readRecipes.mock.calls.length).toBe(2);
});

test("tells that the product is no longer available", async () => {
  const saveRecipe = vi
    .fn<EditRecipeModalServices["saveRecipe"]>()
    .mockResolvedValue({ kind: "product_not_found" });
  const screen = await renderEditRecipeModal({ saveRecipe });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("Este producto ya no está disponible")).toBeVisible();
});

test("shows a component that is no longer available next to it", async () => {
  const saveRecipe = vi
    .fn<EditRecipeModalServices["saveRecipe"]>()
    .mockResolvedValue({ kind: "component_not_found", componentProductId: nueces.id });
  const screen = await renderEditRecipeModal({ saveRecipe });

  const dialog = await save(screen);

  await expect
    .element(dialog.getByText("Este componente ya no está disponible. Quitalo.").first())
    .toBeVisible();
});

test("shows a failed attempt", async () => {
  const saveRecipe = vi
    .fn<EditRecipeModalServices["saveRecipe"]>()
    .mockResolvedValue({ kind: "failed" });
  const screen = await renderEditRecipeModal({ saveRecipe });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("No se guardó la receta")).toBeVisible();
});

test("shows the time to wait after too many requests", async () => {
  const saveRecipe = vi
    .fn<EditRecipeModalServices["saveRecipe"]>()
    .mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 120 });
  const screen = await renderEditRecipeModal({ saveRecipe });

  const dialog = await save(screen);

  await expect.element(dialog.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("ends the session when the cloud finds none open", async () => {
  const onSessionEnded = vi.fn();
  const saveRecipe = vi
    .fn<EditRecipeModalServices["saveRecipe"]>()
    .mockResolvedValue({ kind: "unauthenticated" });
  const screen = await renderEditRecipeModal({ saveRecipe, onSessionEnded });

  await save(screen);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("sends a person the cloud forbids to Mi cuenta", async () => {
  window.history.pushState(null, "", "/recipes");
  const saveRecipe = vi
    .fn<EditRecipeModalServices["saveRecipe"]>()
    .mockResolvedValue({ kind: "forbidden" });
  const screen = await renderEditRecipeModal({ saveRecipe });

  await save(screen);

  await expect
    .poll(() => window.location.pathname + window.location.search)
    .toBe("/?account=credentials");
});

test("cancel closes the modal", async () => {
  const onClose = vi.fn();
  const screen = await renderEditRecipeModal({ onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
});
