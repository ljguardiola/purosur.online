import type { RecipeList, RecipeSummary } from "@purosur/contracts";

export const almendras = {
  id: "c0000000-0000-4000-8000-000000000001",
  name: "Almendras",
  brandName: null,
  netContent: null,
};
export const nueces = {
  id: "c0000000-0000-4000-8000-000000000002",
  name: "Nueces",
  brandName: null,
  netContent: null,
};
export const mani = {
  id: "c0000000-0000-4000-8000-000000000003",
  name: "Maní",
  brandName: null,
  netContent: null,
};
export const pasas = {
  id: "c0000000-0000-4000-8000-000000000004",
  name: "Pasas",
  brandName: null,
  netContent: null,
};
export const teVerde = {
  id: "c0000000-0000-4000-8000-000000000005",
  name: "Té verde",
  brandName: null,
  netContent: null,
};
export const miel = {
  id: "c0000000-0000-4000-8000-000000000006",
  name: "Miel pura 1 kg",
  brandName: null,
  netContent: null,
};

export const aceiteDeAlmendras = {
  id: "c0000000-0000-4000-8000-000000000007",
  name: "Aceite de Almendras",
  brandName: "Vitora",
  netContent: { quantity: 30, unit: "ML" },
} as const;

export const mixDeFrutosSecos: RecipeSummary = {
  productId: "a0000000-0000-4000-8000-000000000001",
  productName: "Mix de frutos secos",
  brandName: null,
  netContent: null,
  categoryName: "Frutos secos",
  saleUnit: "KG",
  version: 2,
  lastBatch: null,
  components: [
    {
      componentProductId: almendras.id,
      name: almendras.name,
      brandName: null,
      netContent: null,
      saleUnit: "KG",
      quantityPerOutputUnit: 400,
    },
    {
      componentProductId: nueces.id,
      name: nueces.name,
      brandName: null,
      netContent: null,
      saleUnit: "KG",
      quantityPerOutputUnit: 300,
    },
    {
      componentProductId: mani.id,
      name: mani.name,
      brandName: null,
      netContent: null,
      saleUnit: "KG",
      quantityPerOutputUnit: 200,
    },
    {
      componentProductId: pasas.id,
      name: pasas.name,
      brandName: null,
      netContent: null,
      saleUnit: "KG",
      quantityPerOutputUnit: 100,
    },
  ],
};

export const cajaDeInfusiones: RecipeSummary = {
  productId: "a0000000-0000-4000-8000-000000000002",
  productName: "Caja de infusiones",
  brandName: null,
  netContent: null,
  categoryName: "Infusiones",
  saleUnit: "UNIT",
  version: 1,
  lastBatch: null,
  components: [
    {
      componentProductId: teVerde.id,
      name: teVerde.name,
      brandName: null,
      netContent: null,
      saleUnit: "UNIT",
      quantityPerOutputUnit: 2000,
    },
    {
      componentProductId: miel.id,
      name: miel.name,
      brandName: null,
      netContent: null,
      saleUnit: "UNIT",
      quantityPerOutputUnit: 1000,
    },
  ],
};

export const balsamo: RecipeSummary = {
  productId: "a0000000-0000-4000-8000-000000000005",
  productName: "Bálsamo de caléndula",
  brandName: "Herbaria",
  netContent: { quantity: 50, unit: "G" },
  categoryName: "Cosmética",
  saleUnit: "UNIT",
  version: 1,
  lastBatch: null,
  components: [
    {
      componentProductId: aceiteDeAlmendras.id,
      name: aceiteDeAlmendras.name,
      brandName: aceiteDeAlmendras.brandName,
      netContent: aceiteDeAlmendras.netContent,
      saleUnit: "UNIT",
      quantityPerOutputUnit: 500,
    },
  ],
};

export const cremaNutritiva = {
  id: "a0000000-0000-4000-8000-000000000006",
  name: "Crema nutritiva",
  brandName: "Vitora",
  netContent: { quantity: 200, unit: "G" },
  saleUnit: "UNIT",
} as const;

export const avenaConPasas = {
  id: "a0000000-0000-4000-8000-000000000003",
  name: "Avena con pasas",
  brandName: null,
  netContent: null,
  saleUnit: "KG",
} as const;

const cajaDeRegalo = {
  id: "a0000000-0000-4000-8000-000000000004",
  name: "Caja de regalo",
  brandName: null,
  netContent: null,
  saleUnit: "UNIT",
} as const;

export const recipeProducts: RecipeList["products"] = [
  {
    id: mixDeFrutosSecos.productId,
    name: mixDeFrutosSecos.productName,
    brandName: null,
    netContent: null,
    saleUnit: "KG",
  },
  {
    id: cajaDeInfusiones.productId,
    name: cajaDeInfusiones.productName,
    brandName: null,
    netContent: null,
    saleUnit: "UNIT",
  },
  avenaConPasas,
  cajaDeRegalo,
  cremaNutritiva,
  { ...aceiteDeAlmendras, saleUnit: "UNIT" },
  { ...almendras, saleUnit: "KG" },
  { ...nueces, saleUnit: "KG" },
  { ...mani, saleUnit: "KG" },
  { ...pasas, saleUnit: "KG" },
  { ...teVerde, saleUnit: "UNIT" },
  { ...miel, saleUnit: "UNIT" },
];

export function recipeList(
  recipes: RecipeSummary[],
  products: RecipeList["products"] = recipeProducts,
): RecipeList {
  return { recipes, products };
}
