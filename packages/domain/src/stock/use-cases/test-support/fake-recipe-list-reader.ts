import type { RecipeListing, RecipeListReader } from "../recipe-list-reader.js";

export class FakeRecipeListReader implements RecipeListReader {
  private readonly listings: RecipeListing[];

  constructor(listings: RecipeListing[] = []) {
    this.listings = listings;
  }

  async recipes(): Promise<RecipeListing[]> {
    return [...this.listings].sort((a, b) => a.productName.localeCompare(b.productName));
  }

  async recipe(productId: string): Promise<RecipeListing | undefined> {
    return this.listings.find((listing) => listing.productId === productId);
  }
}
