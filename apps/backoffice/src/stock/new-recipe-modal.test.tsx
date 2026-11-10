import type { RecipeSummary } from "@purosur/contracts";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { NewRecipeModalServices } from "./new-recipe-modal";
import type { fetchRecipes } from "./recipes-api";
import {
  addComponent,
  chooseProduct,
  type NewRecipeModalScreen,
  renderNewRecipeModal,
} from "./test-support/new-recipe-modal";
import {
  almendras,
  avenaConPasas,
  mixDeFrutosSecos,
  nueces,
  recipeList,
} from "./test-support/recipes";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

async function submit(screen: NewRecipeModalScreen) {
  const dialog = screen.getByRole("dialog");
  await userEvent.click(dialog.getByRole("button", { name: "Crear la receta" }));
  return dialog;
}

async function submitAvenaWith(
  saveRecipe: NewRecipeModalServices["saveRecipe"],
  {
    onSessionEnded,
    readRecipes,
  }: { onSessionEnded?: () => void; readRecipes?: typeof fetchRecipes } = {},
) {
  const screen = await renderNewRecipeModal({
    saveRecipe,
    ...(onSessionEnded ? { onSessionEnded } : {}),
    ...(readRecipes ? { readRecipes } : {}),
  });
  await chooseProduct(screen, "Avena con pasas");
  await addComponent(screen, "Almendras", "0,4");
  return submit(screen);
}

test("shows the eyebrow, the title, the product field, the help text and both actions", async () => {
  const screen = await renderNewRecipeModal();
  const dialog = screen.getByRole("dialog");

  await expect.element(dialog.getByText("Productos · Armados")).toBeVisible();
  await expect.element(dialog.getByRole("heading", { name: "Nueva receta" })).toBeVisible();
  await expect.element(dialog.getByRole("combobox", { name: /^Producto armado/ })).toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "Es una plantilla: al registrar una producción se proponen estas cantidades y se registra lo que realmente se usó.",
      ),
    )
    .toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Agregar un componente" })).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Cancelar" })).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Crear la receta" })).toBeVisible();
});

test("offers only the products that have no recipe yet", async () => {
  const screen = await renderNewRecipeModal();

  await userEvent.click(
    screen.getByRole("dialog").getByRole("combobox", { name: /^Producto armado/ }),
  );

  await expect.element(screen.getByRole("option", { name: "Avena con pasas" })).toBeVisible();
  expect(screen.getByRole("option", { name: "Mix de frutos secos" }).query()).toBeNull();
});

test("names the unit of the chosen product above the components", async () => {
  const screen = await renderNewRecipeModal();
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByText("Componentes", { exact: true })).toBeVisible();

  await chooseProduct(screen, "Avena con pasas");
  await expect.element(dialog.getByText("Componentes por kg de producto terminado")).toBeVisible();

  await userEvent.fill(dialog.getByRole("combobox", { name: /^Producto armado/ }), "");
  await chooseProduct(screen, "Caja de regalo");
  await expect
    .element(dialog.getByText("Componentes por unidad de producto terminado"))
    .toBeVisible();
});

test("a component is searched among the products but the chosen one and those already added", async () => {
  const screen = await renderNewRecipeModal();
  const dialog = screen.getByRole("dialog");
  await chooseProduct(screen, "Avena con pasas");
  await addComponent(screen, "Almendras", "0,4");

  await userEvent.click(dialog.getByRole("button", { name: "Agregar un componente" }));
  await userEvent.click(dialog.getByRole("combobox", { name: /^Componente/ }));

  await expect.element(screen.getByRole("option", { name: "Nueces" })).toBeVisible();
  expect(screen.getByRole("option", { name: "Almendras" }).query()).toBeNull();
  expect(screen.getByRole("option", { name: "Avena con pasas" }).query()).toBeNull();
});

test("each component asks its quantity in its own unit and can be removed", async () => {
  const screen = await renderNewRecipeModal();
  const dialog = screen.getByRole("dialog");
  await chooseProduct(screen, "Caja de regalo");
  await addComponent(screen, "Almendras", "0,4");
  await addComponent(screen, "Té verde", "2");

  await expect.element(dialog.getByText("kg", { exact: true })).toBeVisible();
  await expect.element(dialog.getByText("u", { exact: true })).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Quitar Almendras" }));

  expect(dialog.getByRole("textbox", { name: "Cantidad de Almendras" }).query()).toBeNull();
  await expect.element(dialog.getByRole("textbox", { name: "Cantidad de Té verde" })).toBeVisible();
});

test("creates the recipe of the chosen product with each quantity sent as thousandths and no version", async () => {
  const created: RecipeSummary = { ...mixDeFrutosSecos, productId: avenaConPasas.id };
  const saveRecipe = vi
    .fn<NewRecipeModalServices["saveRecipe"]>()
    .mockResolvedValue({ kind: "ok", recipe: created });
  const onSaved = vi.fn();
  const screen = await renderNewRecipeModal({ saveRecipe, onSaved });

  await chooseProduct(screen, "Avena con pasas");
  await addComponent(screen, "Almendras", "0,4");
  await addComponent(screen, "Nueces", "0,6");
  await submit(screen);

  expect(saveRecipe).toHaveBeenCalledWith(avenaConPasas.id, {
    components: [
      { componentProductId: almendras.id, quantityPerOutputUnit: 400 },
      { componentProductId: nueces.id, quantityPerOutputUnit: 600 },
    ],
    version: null,
  });
  await expect.poll(() => onSaved.mock.calls).toEqual([[created]]);
});

test("shows the refusal of a recipe without components under the components", async () => {
  const saveRecipe = vi.fn<NewRecipeModalServices["saveRecipe"]>().mockResolvedValue({
    kind: "invalid_recipe",
    reason: { kind: "no_components" },
  });
  const screen = await renderNewRecipeModal({ saveRecipe });
  await chooseProduct(screen, "Avena con pasas");

  const dialog = await submit(screen);

  await expect.element(dialog.getByText("Agregá al menos un componente.")).toBeVisible();
});

test("asks for the product when the components are fine, without calling the API", async () => {
  const saveRecipe = vi.fn<NewRecipeModalServices["saveRecipe"]>();
  const screen = await renderNewRecipeModal({ saveRecipe });
  await addComponent(screen, "Almendras", "0,4");

  const dialog = await submit(screen);

  await expect.element(dialog.getByText("Elegí el producto armado.")).toBeVisible();
  expect(saveRecipe).not.toHaveBeenCalled();
});

test("refuses a component without a readable quantity, saying how to type it", async () => {
  const saveRecipe = vi.fn<NewRecipeModalServices["saveRecipe"]>();
  const screen = await renderNewRecipeModal({ saveRecipe });
  await chooseProduct(screen, "Avena con pasas");
  await addComponent(screen, "Almendras", "");
  await userEvent.type(screen.getByRole("textbox", { name: "Cantidad de Almendras" }), "5,");

  const dialog = await submit(screen);

  await expect
    .element(
      dialog.getByText("Almendras: escribí los kilos con hasta 3 decimales, por ejemplo 12,150."),
    )
    .toBeVisible();
  expect(saveRecipe).not.toHaveBeenCalled();
});

test("refuses a quantity of zero", async () => {
  const saveRecipe = vi.fn<NewRecipeModalServices["saveRecipe"]>();
  const screen = await renderNewRecipeModal({ saveRecipe });
  await chooseProduct(screen, "Caja de regalo");
  await addComponent(screen, "Té verde", "0");

  const dialog = await submit(screen);

  await expect
    .element(dialog.getByText("Té verde: ingresá una cantidad mayor a cero, de hasta 2.147.483 u."))
    .toBeVisible();
  expect(saveRecipe).not.toHaveBeenCalled();
});

test("shows a product that is no longer available under the product field", async () => {
  const saveRecipe = vi
    .fn<NewRecipeModalServices["saveRecipe"]>()
    .mockResolvedValue({ kind: "product_not_found" });

  const dialog = await submitAvenaWith(saveRecipe);

  await expect
    .element(dialog.getByText("Este producto ya no está disponible. Elegí otro."))
    .toBeVisible();
});

test("shows a component that is no longer available next to it", async () => {
  const saveRecipe = vi
    .fn<NewRecipeModalServices["saveRecipe"]>()
    .mockResolvedValue({ kind: "component_not_found", componentProductId: almendras.id });

  const dialog = await submitAvenaWith(saveRecipe);

  await expect
    .element(dialog.getByText("Este componente ya no está disponible. Quitalo.").first())
    .toBeVisible();
});

test("shows a repeated component next to it", async () => {
  const saveRecipe = vi.fn<NewRecipeModalServices["saveRecipe"]>().mockResolvedValue({
    kind: "invalid_recipe",
    reason: { kind: "repeated_component", componentProductId: almendras.id },
  });

  const dialog = await submitAvenaWith(saveRecipe);

  await expect.element(dialog.getByText("Este componente está repetido.").first()).toBeVisible();
});

test("shows a quantity the cloud refused next to its component", async () => {
  const saveRecipe = vi.fn<NewRecipeModalServices["saveRecipe"]>().mockResolvedValue({
    kind: "invalid_recipe",
    reason: { kind: "invalid_quantity", componentProductId: almendras.id },
  });

  const dialog = await submitAvenaWith(saveRecipe);

  await expect
    .element(
      dialog.getByText("Escribí los kilos con hasta 3 decimales, por ejemplo 12,150.").first(),
    )
    .toBeVisible();
});

test("shows the assembled product used as its own component next to that component", async () => {
  const saveRecipe = vi.fn<NewRecipeModalServices["saveRecipe"]>().mockResolvedValue({
    kind: "invalid_recipe",
    reason: { kind: "self_component" },
  });
  const screen = await renderNewRecipeModal({ saveRecipe });
  await addComponent(screen, "Avena con pasas", "0,4");
  await chooseProduct(screen, "Avena con pasas");

  const dialog = await submit(screen);

  await expect
    .element(
      dialog.getByText("El producto armado no puede ser componente de su propia receta.").first(),
    )
    .toBeVisible();
});

test("tells that someone else created the recipe meanwhile", async () => {
  const saveRecipe = vi
    .fn<NewRecipeModalServices["saveRecipe"]>()
    .mockResolvedValue({ kind: "stale_version" });

  const dialog = await submitAvenaWith(saveRecipe);

  await expect.element(dialog.getByText("Otra persona cambió esta receta")).toBeVisible();
  await expect
    .element(dialog.getByText("Cerrá esta ventana y volvé a abrirla para ver cómo quedó."))
    .toBeVisible();
});

test("reads the recipes again when someone else created the recipe meanwhile", async () => {
  const readRecipes = vi
    .fn<typeof fetchRecipes>()
    .mockResolvedValue({ kind: "ok", value: recipeList([mixDeFrutosSecos]) });
  const saveRecipe = vi
    .fn<NewRecipeModalServices["saveRecipe"]>()
    .mockResolvedValue({ kind: "stale_version" });

  const dialog = await submitAvenaWith(saveRecipe, { readRecipes });

  await expect.element(dialog.getByText("Otra persona cambió esta receta")).toBeVisible();
  await expect.poll(() => readRecipes.mock.calls.length).toBe(2);
});

test("shows a failed attempt", async () => {
  const dialog = await submitAvenaWith(
    vi.fn<NewRecipeModalServices["saveRecipe"]>().mockResolvedValue({ kind: "failed" }),
  );

  await expect.element(dialog.getByText("No se guardó la receta")).toBeVisible();
});

test("shows the time to wait after too many requests", async () => {
  const dialog = await submitAvenaWith(
    vi
      .fn<NewRecipeModalServices["saveRecipe"]>()
      .mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 120 }),
  );

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("ends the session when the cloud finds none open", async () => {
  const onSessionEnded = vi.fn();

  await submitAvenaWith(
    vi.fn<NewRecipeModalServices["saveRecipe"]>().mockResolvedValue({ kind: "unauthenticated" }),
    { onSessionEnded },
  );

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("sends a person the cloud forbids to Mi cuenta", async () => {
  window.history.pushState(null, "", "/recipes");

  await submitAvenaWith(
    vi.fn<NewRecipeModalServices["saveRecipe"]>().mockResolvedValue({ kind: "forbidden" }),
  );

  await expect
    .poll(() => window.location.pathname + window.location.search)
    .toBe("/?account=credentials");
});

test("cancel closes the modal", async () => {
  const onClose = vi.fn();
  const screen = await renderNewRecipeModal({ onClose });

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
});
