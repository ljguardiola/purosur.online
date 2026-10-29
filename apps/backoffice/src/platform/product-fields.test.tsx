import { type BrandSummary, productCreationBodySchema } from "@purosur/contracts";
import { FieldSizeProvider, useRequestForm } from "@purosur/ui";
import type { ComponentProps } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  PRODUCT_GENERATE_INTERNAL_BARCODE_FAILED,
  useBarcodeChips,
  useGenerateInternalBarcode,
} from "./barcode-chips";
import { barcodeProblemMessage } from "./barcode-list";
import type { StackedBrandCreation } from "./product-brand-field";
import { PRODUCT_GROUP_FIELDS, ProductFields } from "./product-fields";
import {
  EMPTY_PRODUCT_FORM,
  PRODUCT_FIELDS,
  PRODUCT_MESSAGES,
  productRequestFrom,
} from "./product-form";
import type { StackedTagCreation } from "./product-tags-field";
import { organico, sinColorantes, sinTacc } from "./test-support/tags";

type FieldsProps = ComponentProps<typeof ProductFields>;
type Choices = Pick<FieldsProps, "categories" | "brands" | "tags">;

const granuz: BrandSummary = {
  id: "b2a00000-0000-4000-8000-000000000011",
  name: "Granuz",
  active: true,
  version: 1,
  productCount: 4,
};
const litoral: BrandSummary = {
  id: "b2a00000-0000-4000-8000-000000000012",
  name: "Yerba del Litoral",
  active: false,
  version: 2,
  productCount: 1,
};
const cabriola: BrandSummary = {
  id: "b2a00000-0000-4000-8000-000000000013",
  name: "Cabriola",
  active: true,
  version: 1,
  productCount: 0,
};

function brandCreation(overrides: Partial<StackedBrandCreation> = {}): StackedBrandCreation {
  return {
    open: false,
    created: null,
    start: vi.fn(),
    reset: vi.fn(),
    close: vi.fn(),
    select: vi.fn(),
    finish: vi.fn(),
    ...overrides,
  };
}

function tagCreation(overrides: Partial<StackedTagCreation> = {}): StackedTagCreation {
  return {
    open: false,
    created: [],
    start: vi.fn(),
    reset: vi.fn(),
    close: vi.fn(),
    select: vi.fn(),
    finish: vi.fn(),
    ...overrides,
  };
}

const LOADED: Choices = {
  categories: {
    state: "loaded",
    options: [{ value: "c4700000-0000-4000-8000-000000000001", label: "Almacén › Yerbas" }],
  },
  brands: { state: "loaded", items: [granuz, litoral], creation: null },
  tags: { state: "loaded", items: [sinTacc, sinColorantes], creation: null },
};

function Harness(choices: Choices) {
  const { form, values } = useRequestForm({
    defaultValues: EMPTY_PRODUCT_FORM,
    request: { schema: productCreationBodySchema, from: productRequestFrom },
    fields: PRODUCT_FIELDS,
    messages: PRODUCT_MESSAGES,
    onSubmit: async () => {},
  });
  const chips = useBarcodeChips({
    list: values.barcodes,
    setList: (next) => form.setFieldValue("barcodes", next),
    problemMessage: barcodeProblemMessage,
  });
  const generate = useGenerateInternalBarcode(
    chips,
    vi.fn(),
    () => {},
    () => {},
    () => {},
    PRODUCT_GENERATE_INTERNAL_BARCODE_FAILED,
  );
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <ProductFields
          form={form}
          fields={PRODUCT_GROUP_FIELDS}
          {...choices}
          chips={chips}
          generation={generate.generation}
          disabled={false}
        />
      </main>
    </FieldSizeProvider>
  );
}

async function renderFields(choices: Partial<Choices> = {}) {
  const screen = await render(<Harness {...LOADED} {...choices} />);
  return screen.locator;
}

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

test("offers the name, the category, the brand, the net content, the tags, the sale unit and the barcodes, in that order", async () => {
  const fields = await renderFields();
  await expect.element(fields.getByRole("textbox", { name: /^Nombre/ })).toBeVisible();

  const inOrder = [
    fields.getByRole("textbox", { name: /^Nombre/ }),
    fields.getByRole("combobox", { name: /^Categoría/ }),
    fields.getByRole("combobox", { name: /^Marca/ }),
    fields.getByRole("textbox", { name: "Contenido neto" }),
    fields.getByRole("group", { name: "Distintivos" }),
    fields.getByRole("radio", { name: "Por unidad" }),
    fields.getByRole("button", { name: "Generar código interno" }),
  ]
    .map((locator) => locator.element())
    .every(
      (element, index, elements) =>
        index === 0 ||
        (elements[index - 1]?.compareDocumentPosition(element) ?? 0) &
          Node.DOCUMENT_POSITION_FOLLOWING,
    );
  expect(inOrder).toBe(true);
});

test("shows the placeholder given in place of each list that is not available", async () => {
  const fields = await renderFields({
    categories: { state: "unavailable", placeholder: <p>Categorías sin cargar</p> },
    brands: { state: "unavailable", placeholder: <p>Marcas sin cargar</p> },
    tags: { state: "unavailable", placeholder: <p>Distintivos sin cargar</p> },
  });

  await expect.element(fields.getByText("Categorías sin cargar")).toBeVisible();
  await expect.element(fields.getByText("Marcas sin cargar")).toBeVisible();
  await expect.element(fields.getByText("Distintivos sin cargar")).toBeVisible();
  expect(fields.getByRole("combobox", { name: /^Categoría/ }).query()).toBeNull();
  expect(fields.getByRole("combobox", { name: /^Marca/ }).query()).toBeNull();
  expect(fields.getByRole("group", { name: "Distintivos" }).query()).toBeNull();
  await expect.element(fields.getByRole("textbox", { name: /^Nombre/ })).toBeVisible();
});

test("offers no way to create a brand or a tag when no creation is given", async () => {
  const fields = await renderFields();
  await expect.element(fields.getByRole("combobox", { name: /^Marca/ })).toBeVisible();

  expect(fields.getByRole("button", { name: "Nueva marca" }).query()).toBeNull();
  await userEvent.click(fields.getByRole("button", { name: "Agregar distintivo" }));
  await expect.element(page.getByRole("menuitem", { name: "Sin TACC" })).toBeVisible();
  expect(page.getByRole("menuitem", { name: "Crear distintivo…" }).query()).toBeNull();
});

test("starts creating a brand or a tag through the creation given", async () => {
  const brands = brandCreation();
  const tags = tagCreation();
  const fields = await renderFields({
    brands: { state: "loaded", items: [granuz], creation: brands },
    tags: { state: "loaded", items: [sinTacc], creation: tags },
  });

  await userEvent.click(fields.getByRole("button", { name: "Nueva marca" }));
  await userEvent.click(fields.getByRole("button", { name: "Agregar distintivo" }));
  await userEvent.click(page.getByRole("menuitem", { name: "Crear distintivo…" }));

  expect(brands.start).toHaveBeenCalledTimes(1);
  expect(tags.start).toHaveBeenCalledTimes(1);
});

test("offers the active brands and tags, and the brand and tag just created though the lists do not hold them yet", async () => {
  const fields = await renderFields({
    brands: {
      state: "loaded",
      items: [granuz, litoral],
      creation: brandCreation({ created: cabriola }),
    },
    tags: {
      state: "loaded",
      items: [sinTacc, sinColorantes],
      creation: tagCreation({ created: [organico] }),
    },
  });

  await userEvent.click(fields.getByRole("combobox", { name: /^Marca/ }));
  await expect.element(page.getByRole("option", { name: "Granuz" })).toBeVisible();
  expect(
    page
      .getByRole("option")
      .all()
      .map((option) => option.element().textContent),
  ).toEqual(["Sin marca", "Cabriola", "Granuz"]);
  await userEvent.keyboard("{Escape}");
  await userEvent.click(fields.getByRole("button", { name: "Agregar distintivo" }));
  await expect.element(page.getByRole("menuitem", { name: "Orgánico" })).toBeVisible();
  await expect.element(page.getByRole("menuitem", { name: "Sin TACC" })).toBeVisible();
  expect(page.getByRole("menuitem", { name: "Sin colorantes" }).query()).toBeNull();
});

const ALMACEN = "c4700000-0000-4000-8000-000000000011";
const BEBIDAS = "c4700000-0000-4000-8000-000000000012";
const LACTEOS = "c4700000-0000-4000-8000-000000000013";

test("typing in the category offers only the matching categories, and choosing one selects it", async () => {
  const fields = await renderFields({
    categories: {
      state: "loaded",
      options: [
        { value: ALMACEN, label: "Almacén" },
        { value: BEBIDAS, label: "Bebidas" },
        { value: LACTEOS, label: "Lácteos" },
      ],
    },
  });

  const category = fields.getByRole("combobox", { name: /^Categoría/ });
  await userEvent.fill(category, "lác");

  const offered = page
    .getByRole("option")
    .all()
    .map((option) => option.element().textContent);
  expect(offered).toEqual(["Lácteos"]);

  await userEvent.click(page.getByRole("option", { name: "Lácteos" }));
  await expect.element(category).toHaveValue("Lácteos");
});

test("typing in the brand offers only the brands that match, and Sin marca only when it matches", async () => {
  const fields = await renderFields();
  const brand = fields.getByRole("combobox", { name: /^Marca/ });

  await userEvent.fill(brand, "gran");
  expect(
    page
      .getByRole("option")
      .all()
      .map((option) => option.element().textContent),
  ).toEqual(["Granuz"]);

  await userEvent.fill(brand, "sin m");
  expect(
    page
      .getByRole("option")
      .all()
      .map((option) => option.element().textContent),
  ).toEqual(["Sin marca"]);

  await userEvent.click(page.getByRole("option", { name: "Sin marca" }));
  await userEvent.fill(brand, "gran");
  await userEvent.click(page.getByRole("option", { name: "Granuz" }));
  await expect.element(brand).toHaveValue("Granuz");
});
