import type { RecipeList, RecipeSummary } from "@purosur/contracts";

export const almendras = { id: "c0000000-0000-4000-8000-000000000001", name: "Almendras" };
export const nueces = { id: "c0000000-0000-4000-8000-000000000002", name: "Nueces" };
export const mani = { id: "c0000000-0000-4000-8000-000000000003", name: "Maní" };
export const pasas = { id: "c0000000-0000-4000-8000-000000000004", name: "Pasas" };
export const teVerde = { id: "c0000000-0000-4000-8000-000000000005", name: "Té verde" };
export const miel = { id: "c0000000-0000-4000-8000-000000000006", name: "Miel pura 1 kg" };

export const mixDeFrutosSecos: RecipeSummary = {
  productId: "a0000000-0000-4000-8000-000000000001",
  productName: "Mix de frutos secos",
  categoryName: "Frutos secos",
  saleUnit: "KG",
  version: 2,
  lastBatch: null,
  components: [
    {
      componentProductId: almendras.id,
      name: almendras.name,
      saleUnit: "KG",
      quantityPerOutputUnit: 400,
    },
    {
      componentProductId: nueces.id,
      name: nueces.name,
      saleUnit: "KG",
      quantityPerOutputUnit: 300,
    },
    { componentProductId: mani.id, name: mani.name, saleUnit: "KG", quantityPerOutputUnit: 200 },
    { componentProductId: pasas.id, name: pasas.name, saleUnit: "KG", quantityPerOutputUnit: 100 },
  ],
};

export const cajaDeInfusiones: RecipeSummary = {
  productId: "a0000000-0000-4000-8000-000000000002",
  productName: "Caja de infusiones",
  categoryName: "Infusiones",
  saleUnit: "UNIT",
  version: 1,
  lastBatch: null,
  components: [
    {
      componentProductId: teVerde.id,
      name: teVerde.name,
      saleUnit: "UNIT",
      quantityPerOutputUnit: 2000,
    },
    { componentProductId: miel.id, name: miel.name, saleUnit: "UNIT", quantityPerOutputUnit: 1000 },
  ],
};

export const avenaConPasas = {
  id: "a0000000-0000-4000-8000-000000000003",
  name: "Avena con pasas",
  saleUnit: "KG",
} as const;

const cajaDeRegalo = {
  id: "a0000000-0000-4000-8000-000000000004",
  name: "Caja de regalo",
  saleUnit: "UNIT",
} as const;

export const recipeProducts: RecipeList["products"] = [
  { id: mixDeFrutosSecos.productId, name: mixDeFrutosSecos.productName, saleUnit: "KG" },
  { id: cajaDeInfusiones.productId, name: cajaDeInfusiones.productName, saleUnit: "UNIT" },
  avenaConPasas,
  cajaDeRegalo,
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
