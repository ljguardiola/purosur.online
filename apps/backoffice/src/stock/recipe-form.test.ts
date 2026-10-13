import { describe, expect, it } from "vitest";
import {
  EMPTY_RECIPE_FORM,
  recipeComponentOptions,
  recipeComponentsHeading,
  recipeComponentsMessage,
  recipeFormValuesOf,
  recipeProductOptions,
  recipeRowRefusalOf,
  recipeSaveRequestFrom,
} from "./recipe-form";
import {
  almendras,
  cajaDeInfusiones,
  miel,
  mixDeFrutosSecos,
  nueces,
  recipeProducts,
  teVerde,
} from "./test-support/recipes";

const kgRow = { productId: almendras.id, name: almendras.name, saleUnit: "KG" as const };
const unitRow = { productId: teVerde.id, name: teVerde.name, saleUnit: "UNIT" as const };
const KG_MESSAGE = "Escribí los kilos con coma para los decimales, hasta 3, por ejemplo 12,150.";

describe("recipeFormValuesOf", () => {
  it("fills each component's quantity in its own unit", () => {
    expect(recipeFormValuesOf(mixDeFrutosSecos).components.map((c) => c.quantity)).toEqual([
      "0,400",
      "0,300",
      "0,200",
      "0,100",
    ]);
  });

  it("keeps the product, each component's name and unit, and the recipe's version", () => {
    expect(recipeFormValuesOf(cajaDeInfusiones)).toEqual({
      productId: cajaDeInfusiones.productId,
      components: [
        { productId: teVerde.id, name: teVerde.name, saleUnit: "UNIT", quantity: "2" },
        { productId: miel.id, name: miel.name, saleUnit: "UNIT", quantity: "1" },
      ],
      version: 1,
    });
  });
});

describe("recipeSaveRequestFrom", () => {
  it("sends each component's quantity typed in its own unit as thousandths, with the version", () => {
    expect(
      recipeSaveRequestFrom({
        productId: mixDeFrutosSecos.productId,
        components: [
          { ...kgRow, quantity: "0,4" },
          { ...unitRow, quantity: "2" },
        ],
        version: 3,
      }),
    ).toEqual({
      components: [
        { componentProductId: almendras.id, quantityPerOutputUnit: 400 },
        { componentProductId: teVerde.id, quantityPerOutputUnit: 2000 },
      ],
      version: 3,
    });
  });

  it("sends a null version for a new recipe and not a number for a quantity it cannot read", () => {
    const request = recipeSaveRequestFrom({
      ...EMPTY_RECIPE_FORM,
      components: [{ ...kgRow, quantity: "abc" }],
    });

    expect(request.version).toBeNull();
    expect(request.components[0]?.quantityPerOutputUnit).toBeNaN();
  });
});

describe("recipeComponentsMessage", () => {
  it("asks for a component when there is none", () => {
    expect(recipeComponentsMessage(EMPTY_RECIPE_FORM)).toBe("Agregá al menos un componente.");
  });

  it("asks for the quantity of the first component without one", () => {
    expect(
      recipeComponentsMessage({
        ...EMPTY_RECIPE_FORM,
        components: [
          { ...kgRow, quantity: "0,4" },
          { ...unitRow, quantity: " " },
        ],
      }),
    ).toBe("Té verde: ingresá la cantidad.");
  });

  it("tells how to type the quantity in the unit of the first component that is wrong", () => {
    expect(
      recipeComponentsMessage({ ...EMPTY_RECIPE_FORM, components: [{ ...kgRow, quantity: "x" }] }),
    ).toBe(
      "Almendras: escribí los kilos con coma para los decimales, hasta 3, por ejemplo 12,150.",
    );
    expect(
      recipeComponentsMessage({
        ...EMPTY_RECIPE_FORM,
        components: [{ ...unitRow, quantity: "1,5" }],
      }),
    ).toBe("Té verde: escribí una cantidad entera de unidades, por ejemplo 16.");
  });

  it("refuses a quantity of zero", () => {
    expect(
      recipeComponentsMessage({ ...EMPTY_RECIPE_FORM, components: [{ ...kgRow, quantity: "0" }] }),
    ).toContain("Almendras: escribí los kilos");
  });
});

describe("recipeProductOptions", () => {
  it("offers by name the products that have no recipe yet, or none when there is none", () => {
    expect(
      recipeProductOptions(recipeProducts, [mixDeFrutosSecos, cajaDeInfusiones])?.map(
        (option) => option.label,
      ),
    ).toEqual([
      "Almendras",
      "Avena con pasas",
      "Caja de regalo",
      "Maní",
      "Miel pura 1 kg",
      "Nueces",
      "Pasas",
      "Té verde",
    ]);
    expect(recipeProductOptions([], [])).toBeUndefined();
  });
});

describe("recipeComponentOptions", () => {
  it("offers by name every product but the assembled one and those already added", () => {
    expect(
      recipeComponentOptions(recipeProducts, mixDeFrutosSecos.productId, [kgRow]).map(
        (option) => option.label,
      ),
    ).toEqual([
      "Avena con pasas",
      "Caja de infusiones",
      "Caja de regalo",
      "Maní",
      "Miel pura 1 kg",
      "Nueces",
      "Pasas",
      "Té verde",
    ]);
  });

  it("offers every product but the added ones while no assembled product is chosen", () => {
    expect(recipeComponentOptions(recipeProducts, null, []).map((o) => o.value)).toContain(
      mixDeFrutosSecos.productId,
    );
  });
});

describe("recipeComponentsHeading", () => {
  it.each([
    ["KG", "Componentes por kg de producto terminado"],
    ["UNIT", "Componentes por unidad de producto terminado"],
    [null, "Componentes"],
  ] as const)("names the unit of the assembled product %s", (saleUnit, heading) => {
    expect(recipeComponentsHeading(saleUnit)).toBe(heading);
  });
});

describe("recipeRowRefusalOf", () => {
  const values = {
    productId: mixDeFrutosSecos.productId,
    components: [{ ...kgRow, quantity: "0,4" }],
    version: null,
  };

  it("points at the component the cloud no longer finds", () => {
    expect(
      recipeRowRefusalOf({ kind: "component_not_found", componentProductId: almendras.id }, values),
    ).toEqual({
      productId: almendras.id,
      message: "Este componente ya no está disponible. Quitalo.",
    });
  });

  it("points at a repeated component", () => {
    expect(
      recipeRowRefusalOf(
        {
          kind: "invalid_recipe",
          reason: { kind: "repeated_component", componentProductId: nueces.id },
        },
        values,
      ),
    ).toEqual({ productId: nueces.id, message: "Este componente está repetido." });
  });

  it("points at the component that is the assembled product itself", () => {
    expect(
      recipeRowRefusalOf({ kind: "invalid_recipe", reason: { kind: "self_component" } }, values),
    ).toEqual({
      productId: mixDeFrutosSecos.productId,
      message: "El producto armado no puede ser componente de su propia receta.",
    });
  });

  it("tells how to type the quantity of a component the cloud refused", () => {
    expect(
      recipeRowRefusalOf(
        {
          kind: "invalid_recipe",
          reason: { kind: "invalid_quantity", componentProductId: almendras.id },
        },
        values,
      ),
    ).toEqual({ productId: almendras.id, message: KG_MESSAGE });
  });

  it("points at no component for a recipe without components", () => {
    expect(
      recipeRowRefusalOf({ kind: "invalid_recipe", reason: { kind: "no_components" } }, values),
    ).toBeUndefined();
  });
});
