import type { EditRecipeModalServices } from "./edit-recipe-modal";
import type { NewRecipeModalServices } from "./new-recipe-modal";
import { fetchRecipes, saveRecipe } from "./recipes-api";

export type RecipesListScreenServices = {
  fetchRecipes: typeof fetchRecipes;
} & NewRecipeModalServices &
  EditRecipeModalServices;

export const defaultRecipesListScreenServices: RecipesListScreenServices = {
  fetchRecipes,
  saveRecipe,
};
