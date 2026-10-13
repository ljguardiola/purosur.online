import { type RecipeList, type RecipeSaveBody, recipeSaveBodySchema } from "@purosur/contracts";
import { FieldSizeProvider, useRequestForm } from "@purosur/ui";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { RecipeComponentsField } from "./recipe-components-field";
import {
  RECIPE_FIELDS,
  type RecipeComponentValues,
  recipeComponentsMessage,
  recipeSaveRequestFrom,
} from "./recipe-form";
import { almendras, avenaConPasas, nueces, recipeProducts, teVerde } from "./test-support/recipes";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const almendrasRow: RecipeComponentValues = {
  productId: almendras.id,
  name: almendras.name,
  saleUnit: "KG",
  quantity: "0,400",
};
const teVerdeRow: RecipeComponentValues = {
  productId: teVerde.id,
  name: teVerde.name,
  saleUnit: "UNIT",
  quantity: "2",
};

type HarnessProps = {
  products: RecipeList["products"];
  components: RecipeComponentValues[];
  refusals: Record<string, string>;
  onComponentsChange: () => void;
  onRequest: (request: RecipeSaveBody) => void;
};

function Harness({ products, components, refusals, onComponentsChange, onRequest }: HarnessProps) {
  const { form, submit } = useRequestForm({
    defaultValues: { productId: avenaConPasas.id, components, version: null },
    request: { schema: recipeSaveBodySchema, from: recipeSaveRequestFrom },
    fields: RECIPE_FIELDS,
    messages: { components: recipeComponentsMessage },
    onSubmit: async (request) => onRequest(request),
  });
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <form.AppField name="components">
          {() => (
            <RecipeComponentsField
              products={products}
              assembledProductId={avenaConPasas.id}
              refusals={refusals}
              onComponentsChange={onComponentsChange}
            />
          )}
        </form.AppField>
        <button type="button" onClick={() => void submit()}>
          Enviar
        </button>
      </main>
    </FieldSizeProvider>
  );
}

function renderField({
  products = recipeProducts,
  components = [],
  refusals = {},
  onComponentsChange = () => {},
  onRequest = () => {},
}: Partial<HarnessProps> = {}) {
  return render(
    <Harness
      products={products}
      components={components}
      refusals={refusals}
      onComponentsChange={onComponentsChange}
      onRequest={onRequest}
    />,
  );
}

type FieldScreen = Awaited<ReturnType<typeof renderField>>;

// A locator click scrolls the option into view first, and the scroll event closes the list.
async function addComponent(screen: FieldScreen, name: string) {
  await userEvent.click(screen.getByRole("button", { name: "Agregar un componente" }));
  await userEvent.click(screen.getByRole("combobox", { name: /^Componente/ }));
  await expect.element(screen.getByRole("option", { name })).toBeVisible();
  (screen.getByRole("option", { name }).element() as HTMLElement).click();
}

async function submittedRequest(screen: FieldScreen, onRequest: ReturnType<typeof vi.fn>) {
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
  await expect.poll(() => onRequest.mock.calls.length).toBe(1);
  return onRequest.mock.calls[0]?.[0];
}

test("shows each component with its quantity in its own unit", async () => {
  const screen = await renderField({ components: [almendrasRow, teVerdeRow] });

  await expect.element(screen.getByText("Almendras", { exact: true })).toBeVisible();
  await expect
    .element(screen.getByRole("textbox", { name: "Cantidad de Almendras" }))
    .toHaveValue("0,400");
  await expect.element(screen.getByText("kg", { exact: true })).toBeVisible();
  await expect
    .element(screen.getByRole("textbox", { name: "Cantidad de Té verde" }))
    .toHaveValue("2");
  await expect.element(screen.getByText("u", { exact: true })).toBeVisible();
});

test("adds a chosen product as a component with no quantity yet, in its own unit", async () => {
  const onRequest = vi.fn();
  const screen = await renderField({ onRequest });

  await addComponent(screen, "Nueces");
  await expect.element(screen.getByRole("textbox", { name: "Cantidad de Nueces" })).toHaveValue("");
  await userEvent.fill(screen.getByRole("textbox", { name: "Cantidad de Nueces" }), "0,6");

  expect(await submittedRequest(screen, onRequest)).toEqual({
    components: [{ componentProductId: nueces.id, quantityPerOutputUnit: 600 }],
    version: null,
  });
});

test("offers every product but the assembled one and the components already added", async () => {
  const screen = await renderField({ components: [almendrasRow] });

  await userEvent.click(screen.getByRole("button", { name: "Agregar un componente" }));
  await userEvent.click(screen.getByRole("combobox", { name: /^Componente/ }));

  await expect.element(screen.getByRole("option", { name: "Nueces" })).toBeVisible();
  expect(screen.getByRole("option", { name: "Almendras" }).query()).toBeNull();
  expect(screen.getByRole("option", { name: "Avena con pasas" }).query()).toBeNull();
});

test("disables adding a component when no product is left to add", async () => {
  const screen = await renderField({
    products: [{ ...almendras, saleUnit: "KG" }, avenaConPasas],
    components: [almendrasRow],
  });

  await expect
    .element(screen.getByRole("button", { name: "Agregar un componente" }))
    .toBeDisabled();
});

test("removes a component", async () => {
  const onRequest = vi.fn();
  const screen = await renderField({ components: [almendrasRow, teVerdeRow], onRequest });

  await userEvent.click(screen.getByRole("button", { name: "Quitar Almendras" }));

  expect(screen.getByRole("textbox", { name: "Cantidad de Almendras" }).query()).toBeNull();
  expect(await submittedRequest(screen, onRequest)).toEqual({
    components: [{ componentProductId: teVerde.id, quantityPerOutputUnit: 2000 }],
    version: null,
  });
});

test("reports each change of the components: a quantity typed, one added and one removed", async () => {
  const onComponentsChange = vi.fn();
  const screen = await renderField({ components: [almendrasRow], onComponentsChange });

  await userEvent.fill(screen.getByRole("textbox", { name: "Cantidad de Almendras" }), "1");
  const afterTyping = onComponentsChange.mock.calls.length;
  expect(afterTyping).toBeGreaterThan(0);

  await addComponent(screen, "Nueces");
  await expect.poll(() => onComponentsChange.mock.calls.length).toBe(afterTyping + 1);

  await userEvent.click(screen.getByRole("button", { name: "Quitar Nueces" }));
  expect(onComponentsChange).toHaveBeenCalledTimes(afterTyping + 2);
});

test("shows a refusal next to the component it names", async () => {
  const screen = await renderField({
    components: [teVerdeRow, almendrasRow],
    refusals: { [teVerde.id]: "Este componente ya no está disponible. Quitalo." },
  });

  const text = screen.getByRole("group", { name: "Componentes" }).element().textContent ?? "";
  const [teVerdeCard, almendrasCard] = text.split("Almendras");
  expect(teVerdeCard).toContain("Este componente ya no está disponible. Quitalo.");
  expect(almendrasCard).not.toContain("Quitalo.");
});

test("the components' message describes the whole group", async () => {
  const screen = await renderField({ components: [{ ...almendrasRow, quantity: "" }] });

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect
    .element(screen.getByRole("group", { name: "Componentes" }))
    .toHaveAccessibleDescription("Almendras: ingresá la cantidad.");
});
