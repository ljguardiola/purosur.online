import type { RecipeListing, RecipeListReader } from "../recipe-list-reader.js";

export class FakeRecipeListReader implements RecipeListReader {
  private readonly listings: RecipeListing[];

  constructor(listings: RecipeListing[] = []) {
    this.listings = listings;
  }

  readonly locationsAsked: string[] = [];

  async recipes(locationId: string): Promise<RecipeListing[]> {
    this.locationsAsked.push(locationId);
    return [...this.listings].sort((a, b) => a.productName.localeCompare(b.productName));
  }

  async recipe(productId: string, locationId: string): Promise<RecipeListing | undefined> {
    this.locationsAsked.push(locationId);
    return this.listings.find((listing) => listing.productId === productId);
  }
}
